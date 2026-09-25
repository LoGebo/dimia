# Estado remoto de OpenTofu (§4): bucket en compartido (us-east-2) con réplica en mx,
# llave KMS multirregión, bloqueo nativo por archivo (use_lockfile) y solo TLS.
# Lo leen y escriben únicamente los roles tofu-* y emergencia de la organización.

data "aws_caller_identity" "actual" {}

locals {
  cuenta = data.aws_caller_identity.actual.account_id
  bucket = "dimia-tofu-estado-${local.cuenta}"
  # CI usa tofu-plan y tofu-apply; el dueño aplica las pilas manuales con emergencia.
  roles_tofu = ["arn:aws:iam::*:role/tofu-plan", "arn:aws:iam::*:role/tofu-apply"]
  emergencia = "arn:aws:iam::*:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_emergencia_*"
  roles      = concat(local.roles_tofu, [local.emergencia])
}

data "aws_iam_policy_document" "llave" {
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
    sid       = "RolesDeOpenTofu"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
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
      test     = "ArnLike"
      variable = "aws:PrincipalArn"
      values   = local.roles
    }
  }
}

resource "aws_kms_key" "estado" {
  description             = "Estado y planes de OpenTofu (cifrado del lado del cliente y SSE)"
  multi_region            = true
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.llave.json

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "estado" {
  name          = "alias/dimia-tofu-estado"
  target_key_id = aws_kms_key.estado.key_id
}

resource "aws_kms_replica_key" "estado_mx" {
  provider = aws.mx

  description             = "Réplica en mx de la llave del estado"
  primary_key_arn         = aws_kms_key.estado.arn
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.llave.json
}

# --- Bucket principal

resource "aws_s3_bucket" "estado" {
  #checkov:skip=CKV_AWS_18:Los accesos al estado quedan en CloudTrail (eventos de datos de S3 del trail de organización).
  #checkov:skip=CKV2_AWS_62:Nadie consume eventos del bucket de estado.
  bucket = local.bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "estado" {
  bucket = aws_s3_bucket.estado.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "estado" {
  bucket                  = aws_s3_bucket.estado.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "estado" {
  bucket = aws_s3_bucket.estado.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.estado.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id

  rule {
    id     = "versiones-viejas"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days           = 90
      newer_noncurrent_versions = 20
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "estado" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.estado.arn, "${aws_s3_bucket.estado.arn}/*"]

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

  # Emergencia es el dueño aplicando las pilas manuales: todo el bucket.
  statement {
    sid       = "Emergencia"
    actions   = ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [aws_s3_bucket.estado.arn, "${aws_s3_bucket.estado.arn}/*"]

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
      test     = "ArnLike"
      variable = "aws:PrincipalArn"
      values   = [local.emergencia]
    }
  }

  # Los roles tofu-* de cada cuenta, solo en su prefijo. El acceso cruza cuentas, así que sin
  # este Allow no hay acceso: una cuenta fuera del mapa no lee ni escribe estado (falla cerrado).
  # Sus políticas de identidad no acotan nada: ReadOnlyAccess y AdministratorAccess dan s3 en *.
  dynamic "statement" {
    for_each = var.prefijos_por_cuenta
    content {
      sid       = "Listar${statement.key}"
      actions   = ["s3:ListBucket"]
      resources = [aws_s3_bucket.estado.arn]

      principals {
        type        = "AWS"
        identifiers = ["*"]
      }

      condition {
        test     = "StringEquals"
        variable = "aws:PrincipalAccount"
        values   = [statement.key]
      }

      condition {
        test     = "ArnLike"
        variable = "aws:PrincipalArn"
        values   = local.roles_tofu
      }

      condition {
        test     = "StringLike"
        variable = "s3:prefix"
        values   = ["${statement.value}*"]
      }
    }
  }

  dynamic "statement" {
    for_each = var.prefijos_por_cuenta
    content {
      sid       = "Estado${statement.key}"
      actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
      resources = ["${aws_s3_bucket.estado.arn}/${statement.value}*"]

      principals {
        type        = "AWS"
        identifiers = ["*"]
      }

      condition {
        test     = "StringEquals"
        variable = "aws:PrincipalAccount"
        values   = [statement.key]
      }

      condition {
        test     = "ArnLike"
        variable = "aws:PrincipalArn"
        values   = local.roles_tofu
      }
    }
  }
}

resource "aws_s3_bucket_policy" "estado" {
  bucket = aws_s3_bucket.estado.id
  policy = data.aws_iam_policy_document.estado.json

  depends_on = [aws_s3_bucket_public_access_block.estado]
}

# --- Réplica en mx-central-1

resource "aws_s3_bucket" "replica" {
  #checkov:skip=CKV_AWS_18:Réplica del estado; los accesos quedan en CloudTrail.
  #checkov:skip=CKV_AWS_144:Es la réplica: no se replica a su vez.
  #checkov:skip=CKV2_AWS_62:Nadie consume eventos de la réplica.
  #checkov:skip=CKV2_AWS_61:Las versiones viejas las expira la regla de replicación del origen; la réplica solo guarda lo que llega.
  provider = aws.mx
  bucket   = "${local.bucket}-mx"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_ownership_controls" "replica" {
  provider = aws.mx
  bucket   = aws_s3_bucket.replica.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "replica" {
  provider                = aws.mx
  bucket                  = aws_s3_bucket.replica.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "replica" {
  provider = aws.mx
  bucket   = aws_s3_bucket.replica.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "replica" {
  provider = aws.mx
  bucket   = aws_s3_bucket.replica.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_replica_key.estado_mx.arn
    }
  }
}

data "aws_iam_policy_document" "replica" {
  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.replica.arn, "${aws_s3_bucket.replica.arn}/*"]

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
}

resource "aws_s3_bucket_policy" "replica" {
  provider = aws.mx
  bucket   = aws_s3_bucket.replica.id
  policy   = data.aws_iam_policy_document.replica.json
}

data "aws_iam_policy_document" "confianza_replicacion" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.cuenta]
    }
  }
}

resource "aws_iam_role" "replicacion" {
  name               = "dimia-tofu-estado-replicacion"
  assume_role_policy = data.aws_iam_policy_document.confianza_replicacion.json
}

data "aws_iam_policy_document" "replicacion" {
  statement {
    actions   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
    resources = [aws_s3_bucket.estado.arn]
  }

  statement {
    actions   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"]
    resources = ["${aws_s3_bucket.estado.arn}/*"]
  }

  statement {
    actions   = ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"]
    resources = ["${aws_s3_bucket.replica.arn}/*"]
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = [aws_kms_key.estado.arn]
  }

  statement {
    actions   = ["kms:Encrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_replica_key.estado_mx.arn]
  }
}

resource "aws_iam_role_policy" "replicacion" {
  name   = "replicacion"
  role   = aws_iam_role.replicacion.id
  policy = data.aws_iam_policy_document.replicacion.json
}

resource "aws_s3_bucket_replication_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id
  role   = aws_iam_role.replicacion.arn

  rule {
    id     = "a-mx"
    status = "Enabled"
    filter {}

    delete_marker_replication {
      status = "Enabled"
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }

    destination {
      bucket = aws_s3_bucket.replica.arn
      encryption_configuration {
        replica_kms_key_id = aws_kms_replica_key.estado_mx.arn
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.estado, aws_s3_bucket_versioning.replica]
}
