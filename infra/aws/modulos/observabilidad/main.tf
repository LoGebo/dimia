# Métricas (§3.7): un workspace de AMP por región y el Prometheus del clúster le escribe por
# Pod Identity. AMG (us-east-2) lo lee desde operaciones con un rol de solo consulta.

data "aws_caller_identity" "actual" {}

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
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.actual.account_id}:root"]
    }
  }

  statement {
    sid       = "Logs"
    actions   = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["logs.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "amp" {
  description             = "AMP y logs de ${var.nombre}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.llave.json
}

resource "aws_cloudwatch_log_group" "amp" {
  #checkov:skip=CKV_AWS_338:Son errores de ingesta y de reglas de AMP, no auditoría; 30 días bastan.
  name              = "/aws/prometheus/${var.nombre}"
  retention_in_days = var.retencion_logs_dias
  kms_key_id        = aws_kms_key.amp.arn
}

resource "aws_prometheus_workspace" "this" {
  alias       = var.nombre
  kms_key_arn = aws_kms_key.amp.arn

  logging_configuration {
    log_group_arn = "${aws_cloudwatch_log_group.amp.arn}:*"
  }
}

data "aws_iam_policy_document" "confianza_pod" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "escritor" {
  name                 = "amp-${var.nombre}-escritor"
  assume_role_policy   = data.aws_iam_policy_document.confianza_pod.json
  permissions_boundary = var.limite_arn
}

data "aws_iam_policy_document" "escritor" {
  statement {
    actions   = ["aps:RemoteWrite", "aps:GetSeries", "aps:GetLabels", "aps:GetMetricMetadata", "aps:QueryMetrics"]
    resources = [aws_prometheus_workspace.this.arn]
  }
}

resource "aws_iam_role_policy" "escritor" {
  name   = "amp"
  role   = aws_iam_role.escritor.id
  policy = data.aws_iam_policy_document.escritor.json
}

resource "aws_eks_pod_identity_association" "escritor" {
  cluster_name    = var.cluster
  namespace       = var.namespace
  service_account = var.service_account
  role_arn        = aws_iam_role.escritor.arn
}
