# Lo mínimo de cada cuenta miembro (§4): OIDC de GitHub, roles tofu-plan y tofu-apply,
# cifrado de EBS, bloqueo público de S3, Access Analyzer y budget.
# El primer apply lo hace el dueño con el rol de acceso de la organización (README);
# de ahí en adelante, solo CI.

data "aws_caller_identity" "actual" {}
data "aws_partition" "actual" {}

locals {
  cuenta         = data.aws_caller_identity.actual.account_id
  oidc           = "token.actions.githubusercontent.com"
  estado_objetos = "${var.estado.bucket_arn}/${var.estado.prefijo}*"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.oidc}"
  client_id_list = ["sts.amazonaws.com"]
}

# --- tofu-plan: solo CI, en PR y en main antes del apply. Lee todo, escribe solo el candado.

data "aws_iam_policy_document" "confianza_plan" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:aud"
      values   = ["sts.amazonaws.com"]
    }

    # En un PR corre el workflow de la rama del PR: quien tenga push puede reescribirlo.
    # Por eso solo noprod acepta :pull_request; las demás cuentas planean solo desde main
    # (hasta personalizar el claim con job_workflow_ref, §3.9).
    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:sub"
      values = concat(
        ["${var.github_sub}:ref:refs/heads/main"],
        var.plan_en_pr ? ["${var.github_sub}:pull_request"] : [],
      )
    }
  }
}

resource "aws_iam_role" "tofu_plan" {
  name                 = "tofu-plan"
  assume_role_policy   = data.aws_iam_policy_document.confianza_plan.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "tofu_plan_lectura" {
  role       = aws_iam_role.tofu_plan.name
  policy_arn = "arn:${data.aws_partition.actual.partition}:iam::aws:policy/ReadOnlyAccess"
}

data "aws_iam_policy_document" "estado_plan" {
  statement {
    sid       = "ListarSuPrefijo"
    actions   = ["s3:ListBucket"]
    resources = [var.estado.bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.estado.prefijo}*"]
    }
  }

  statement {
    sid       = "LeerSuEstado"
    actions   = ["s3:GetObject"]
    resources = [local.estado_objetos]
  }

  statement {
    sid       = "SoloElCandado"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.estado.bucket_arn}/${var.estado.prefijo}*.tflock"]
  }

  statement {
    sid       = "LlaveDelEstado"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.estado.llave_arn]
  }

  # ReadOnlyAccess lee contenido (s3:Get*, dynamodb:Scan, logs, parámetros). El refresh solo
  # necesita metadatos: el contenido se niega salvo el estado propio y su llave.
  statement {
    sid           = "SinContenidoFueraDeSuEstado"
    effect        = "Deny"
    actions       = ["s3:GetObject*"]
    not_resources = [local.estado_objetos]
  }

  statement {
    sid           = "SinDescifrarFueraDeSuLlave"
    effect        = "Deny"
    actions       = ["kms:Decrypt"]
    not_resources = [var.estado.llave_arn]
  }

  statement {
    sid    = "NuncaDatosNiSecretos"
    effect = "Deny"
    actions = [
      "athena:GetQueryResults",
      "dynamodb:BatchGetItem",
      "dynamodb:GetItem",
      "dynamodb:PartiQLSelect",
      "dynamodb:Query",
      "dynamodb:Scan",
      "kinesis:GetRecords",
      "logs:FilterLogEvents",
      "logs:GetLogEvents",
      "logs:StartLiveTail",
      "logs:StartQuery",
      "secretsmanager:GetSecretValue",
      "sqs:ReceiveMessage",
      "ssm:GetParameter*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "tofu_plan_estado" {
  name   = "estado"
  role   = aws_iam_role.tofu_plan.id
  policy = data.aws_iam_policy_document.estado_plan.json
}

# --- tofu-apply: CI en main, solo desde el environment con revisor.

data "aws_iam_policy_document" "confianza_apply" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc}:sub"
      values   = ["${var.github_sub}:environment:${var.entorno_apply}"]
    }
  }
}

# Límite obligatorio de todo rol que cree tofu-apply: no toca a los roles de OpenTofu ni al
# de la organización, no crea usuarios, llaves ni proveedores de identidad, y no crea ni
# modifica roles sin este mismo límite.
data "aws_iam_policy_document" "limite" {
  #checkov:skip=CKV_AWS_1:Es un límite de permisos: el Allow * solo pone el techo; los permisos reales los da la política de identidad.
  #checkov:skip=CKV_AWS_49:Límite de permisos, ver CKV_AWS_1.
  #checkov:skip=CKV_AWS_107:Límite de permisos, ver CKV_AWS_1.
  #checkov:skip=CKV_AWS_108:Límite de permisos, ver CKV_AWS_1.
  #checkov:skip=CKV_AWS_109:Límite de permisos, ver CKV_AWS_1.
  #checkov:skip=CKV_AWS_110:Límite de permisos, ver CKV_AWS_1; los Deny impiden escalar sobre los roles de OpenTofu.
  #checkov:skip=CKV_AWS_111:Límite de permisos, ver CKV_AWS_1.
  #checkov:skip=CKV_AWS_356:Límite de permisos, ver CKV_AWS_1.
  statement {
    sid       = "Todo"
    actions   = ["*"]
    resources = ["*"]
  }

  statement {
    sid    = "NoTocarLaMaquinaria"
    effect = "Deny"
    actions = [
      "iam:*",
    ]
    resources = [
      aws_iam_role.tofu_plan.arn,
      "arn:${data.aws_partition.actual.partition}:iam::${local.cuenta}:role/tofu-apply",
      "arn:${data.aws_partition.actual.partition}:iam::${local.cuenta}:policy/dimia-limite",
      aws_iam_openid_connect_provider.github.arn,
    ]
  }

  # Otro proveedor de identidad daría una puerta de entrada que no pasa por GitHub.
  statement {
    sid    = "SinUsuariosNiLlaves"
    effect = "Deny"
    actions = [
      "iam:CreateUser", "iam:CreateAccessKey", "iam:CreateLoginProfile",
      "iam:CreateOpenIDConnectProvider", "iam:CreateSAMLProvider",
      "organizations:*", "account:*",
    ]
    resources = ["*"]
  }

  # Los roles que ya existen sin límite (OrganizationAccountAccessRole tiene AdministratorAccess)
  # no se tocan: ni políticas ni límite. iam:PermissionsBoundary aplica a todas estas acciones.
  statement {
    sid    = "RolesSoloConLimite"
    effect = "Deny"
    actions = [
      "iam:AttachRolePolicy",
      "iam:CreateRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePermissionsBoundary",
      "iam:PutRolePolicy",
    ]
    resources = ["*"]

    condition {
      test     = "StringNotEquals"
      variable = "iam:PermissionsBoundary"
      values   = ["arn:${data.aws_partition.actual.partition}:iam::${local.cuenta}:policy/dimia-limite"]
    }
  }

  # UpdateAssumeRolePolicy no admite iam:PermissionsBoundary: el rol sin límite va por nombre.
  statement {
    sid       = "ConfianzaDelRolDeLaOrganizacion"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = ["arn:${data.aws_partition.actual.partition}:iam::${local.cuenta}:role/OrganizationAccountAccessRole"]
  }

  statement {
    sid       = "ElLimiteNoSeQuita"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "limite" {
  name        = "dimia-limite"
  description = "Límite de permisos obligatorio de los roles que crea OpenTofu"
  policy      = data.aws_iam_policy_document.limite.json
}

resource "aws_iam_role" "tofu_apply" {
  name                 = "tofu-apply"
  assume_role_policy   = data.aws_iam_policy_document.confianza_apply.json
  max_session_duration = 3600
  # El mismo límite lo ata a él: no puede quitarse el límite ni tocar a tofu-plan.
  permissions_boundary = aws_iam_policy.limite.arn
}

# Administra infraestructura; el límite y el revisor del environment son el control.
resource "aws_iam_role_policy_attachment" "tofu_apply_admin" {
  #checkov:skip=CKV_AWS_274:tofu-apply administra la infraestructura de la cuenta; lo acotan el límite dimia-limite, las SCP y el revisor del environment (§7.2).
  role       = aws_iam_role.tofu_apply.name
  policy_arn = "arn:${data.aws_partition.actual.partition}:iam::aws:policy/AdministratorAccess"
}

data "aws_iam_policy_document" "estado_apply" {
  statement {
    sid       = "ListarSuPrefijo"
    actions   = ["s3:ListBucket"]
    resources = [var.estado.bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.estado.prefijo}*"]
    }
  }

  statement {
    sid       = "EscribirSuEstado"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = [local.estado_objetos]
  }

  statement {
    sid       = "LlaveDelEstado"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.estado.llave_arn]
  }
}

resource "aws_iam_role_policy" "tofu_apply_estado" {
  name   = "estado"
  role   = aws_iam_role.tofu_apply.id
  policy = data.aws_iam_policy_document.estado_apply.json
}

# --- Base de seguridad de la cuenta

resource "aws_ebs_encryption_by_default" "this" {
  enabled = true
}

resource "aws_s3_account_public_access_block" "this" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_accessanalyzer_analyzer" "this" {
  analyzer_name = "dimia-${var.nombre}"
  type          = "ACCOUNT"
}
