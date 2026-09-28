# Archivo de logs de la organización (§2.1): CloudTrail con Object Lock y flow logs de todas
# las VPC, en mx-central-1. La aplica el dueño a mano con emergencia: log-archivo no tiene tofu-apply.

data "aws_caller_identity" "actual" {}
data "aws_organizations_organization" "org" {}

locals {
  cuenta     = data.aws_caller_identity.actual.account_id
  gestion    = data.aws_organizations_organization.org.master_account_id
  trail      = "dimia-org"
  trail_arn  = "arn:aws:cloudtrail:us-east-2:${local.gestion}:trail/${local.trail}"
  emergencia = "arn:aws:iam::*:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_emergencia_*"
}

# --- CloudTrail: llave propia (§3.7) y bucket inmutable

data "aws_iam_policy_document" "llave_trail" {
  #checkov:skip=CKV_AWS_109:Política de llave: el root de la cuenta administra la llave, patrón por omisión de KMS.
  #checkov:skip=CKV_AWS_111:Política de llave: el recurso es la propia llave.
  #checkov:skip=CKV_AWS_356:Política de llave: el recurso es la propia llave.
  statement {
    sid       = "Cuenta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.cuenta}:root"]
    }
  }

  statement {
    sid       = "CloudTrailCifra"
    actions   = ["kms:GenerateDataKey*", "kms:DescribeKey"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "LecturaDentroDeLaOrganizacion"
    actions   = ["kms:Decrypt", "kms:ReEncryptFrom"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalOrgID"
      values   = [var.org_id]
    }
    condition {
      test     = "StringLike"
      variable = "kms:EncryptionContext:aws:cloudtrail:arn"
      values   = ["arn:aws:cloudtrail:*:${local.gestion}:trail/*"]
    }
  }
}

resource "aws_kms_key" "trail" {
  description             = "CloudTrail de la organización"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.llave_trail.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "trail" {
  name          = "alias/dimia-cloudtrail"
  target_key_id = aws_kms_key.trail.key_id
}

resource "aws_s3_bucket" "trail" {
  #checkov:skip=CKV_AWS_18:Es el destino de los logs; registrar sus accesos en sí mismo haría un ciclo.
  #checkov:skip=CKV2_AWS_62:Nadie consume eventos del bucket de CloudTrail.
  #checkov:skip=CKV_AWS_144:La copia fuera de México contradice la residencia (§10, decisión 2).
  bucket              = "dimia-cloudtrail-${local.cuenta}"
  object_lock_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_object_lock_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.retencion_trail_dias
    }
  }
}

resource "aws_s3_bucket_versioning" "trail" {
  bucket = aws_s3_bucket.trail.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "trail" {
  bucket = aws_s3_bucket.trail.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.trail.arn
    }
  }
}

data "aws_iam_policy_document" "trail" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.trail.arn, "${aws_s3_bucket.trail.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "CloudTrailRevisaAcl"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.trail.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid     = "CloudTrailEscribe"
    actions = ["s3:PutObject"]
    resources = [
      "${aws_s3_bucket.trail.arn}/AWSLogs/${local.gestion}/*",
      "${aws_s3_bucket.trail.arn}/AWSLogs/${var.org_id}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "NadieBorraSalvoEmergencia"
    effect    = "Deny"
    actions   = ["s3:DeleteObject*", "s3:PutLifecycleConfiguration", "s3:PutBucketObjectLockConfiguration", "s3:BypassGovernanceRetention"]
    resources = [aws_s3_bucket.trail.arn, "${aws_s3_bucket.trail.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "ArnNotLike"
      variable = "aws:PrincipalArn"
      values   = [local.emergencia]
    }
  }
}

resource "aws_s3_bucket_policy" "trail" {
  bucket = aws_s3_bucket.trail.id
  policy = data.aws_iam_policy_document.trail.json
}

# --- Flow logs de todas las VPC (Parquet). SSE-S3: el entregador de logs no usa llaves de otra cuenta.

resource "aws_s3_bucket" "flow_logs" {
  #checkov:skip=CKV_AWS_18:Es el destino de los logs; registrar sus accesos en sí mismo haría un ciclo.
  #checkov:skip=CKV2_AWS_62:Nadie consume eventos del bucket de flow logs.
  #checkov:skip=CKV_AWS_144:La copia fuera de México contradice la residencia (§10, decisión 2).
  #checkov:skip=CKV_AWS_145:El servicio de entrega de flow logs entre cuentas no cifra con llaves KMS ajenas; va SSE-S3.
  #checkov:skip=CKV_AWS_21:Los flow logs no se reescriben; versionar solo duplica costo.
  bucket = "dimia-flow-logs-${local.cuenta}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "flow_logs" {
  bucket = aws_s3_bucket.flow_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "flow_logs" {
  bucket = aws_s3_bucket.flow_logs.id
  rule {
    id     = "expira"
    status = "Enabled"
    filter {}
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    expiration {
      days = 395
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "flow_logs" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.flow_logs.arn, "${aws_s3_bucket.flow_logs.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid       = "EntregaDeLaOrganizacion"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.flow_logs.arn}/AWSLogs/*"]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceOrgID"
      values   = [var.org_id]
    }
  }

  statement {
    sid       = "EntregaRevisaBucket"
    actions   = ["s3:GetBucketAcl", "s3:ListBucket"]
    resources = [aws_s3_bucket.flow_logs.arn]
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceOrgID"
      values   = [var.org_id]
    }
  }
}

resource "aws_s3_bucket_policy" "flow_logs" {
  bucket = aws_s3_bucket.flow_logs.id
  policy = data.aws_iam_policy_document.flow_logs.json
}

# --- Comunes

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = { trail = aws_s3_bucket.trail.id, flow_logs = aws_s3_bucket.flow_logs.id }
  bucket   = each.value
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = { trail = aws_s3_bucket.trail.id, flow_logs = aws_s3_bucket.flow_logs.id }
  bucket                  = each.value
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "flow_logs_bucket_arn" {
  description = "Va en comun.tfvars (flow_logs_bucket_arn): destino de los flow logs de las redes."
  value       = aws_s3_bucket.flow_logs.arn
}

output "trail_bucket" {
  description = "Va en comun.tfvars (trail_bucket) para el trail de organización de vivos/gestion."
  value       = aws_s3_bucket.trail.id
}

output "trail_llave_arn" {
  value = aws_kms_key.trail.arn
}
