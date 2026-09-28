# Imágenes de la plataforma (§3.9, §4 paso 3): ECR en compartido, mx-central-1, etiquetas inmutables y
# escaneo al subir. Solo el workflow imagen.yml de main sube; cualquier cuenta de la organización baja.
# La aplica el dueño a mano con emergencia: compartido no tiene tofu-apply.

locals {
  repos = ["voz", "agentes", "panel"]
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "confianza_imagen" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Solo main; el workflow se fija en job_workflow_ref cuando el repo personalice el claim sub (§3.9).
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repositorio_github}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "imagen" {
  name               = "imagen-push"
  assume_role_policy = data.aws_iam_policy_document.confianza_imagen.json
}

data "aws_iam_policy_document" "imagen" {
  #checkov:skip=CKV_AWS_356:ecr:GetAuthorizationToken no admite recursos.
  statement {
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
      "ecr:DescribeImages", "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
    ]
    resources = [for r in aws_ecr_repository.this : r.arn]
  }
}

resource "aws_iam_role_policy" "imagen" {
  name   = "ecr"
  role   = aws_iam_role.imagen.id
  policy = data.aws_iam_policy_document.imagen.json
}

resource "aws_ecr_repository" "this" {
  #checkov:skip=CKV_AWS_136:AES-256 administrado basta para imágenes sin datos; KMS propia se agrega si una imagen lleva algo sensible.
  for_each             = toset(local.repos)
  name                 = "dimia/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

data "aws_iam_policy_document" "pull_organizacion" {
  statement {
    sid     = "BajanLasCuentasDeLaOrganizacion"
    actions = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalOrgID"
      values   = [var.org_id]
    }
  }
}

resource "aws_ecr_repository_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  policy     = data.aws_iam_policy_document.pull_organizacion.json
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Se quedan las 50 imágenes más recientes"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 50 }
      action       = { type = "expire" }
    }]
  })
}

output "registro" {
  value = split("/", aws_ecr_repository.this["voz"].repository_url)[0]
}

output "rol_imagen" {
  value = aws_iam_role.imagen.arn
}
