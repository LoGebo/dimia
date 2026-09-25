# Identity Center (§3.1, §7.2). La instancia se habilita a mano en us-east-2 (README):
# la API no permite crear la instancia de organización.

data "aws_ssoadmin_instances" "this" {
  lifecycle {
    postcondition {
      condition     = length(self.arns) == 1
      error_message = "Identity Center no está habilitado. Habilítelo a mano en us-east-2 (README, paso 4)."
    }
  }
}

locals {
  sso_instancia  = one(data.aws_ssoadmin_instances.this.arns)
  sso_directorio = one(data.aws_ssoadmin_instances.this.identity_store_ids)

  miembros = merge(
    { for k, c in aws_organizations_account.base : k => c.id },
    { for k, c in module.celda : c.nombre => c.id },
  )

  permission_sets = {
    # Claude Code en todas las cuentas miembro: metadatos sí, contenido no.
    "agente-lectura" = {
      descripcion = "Agente: solo lectura de metadatos, sin datos ni secretos"
      duracion    = "PT4H"
      politicas   = ["arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"]
      en_linea    = data.aws_iam_policy_document.agente_lectura.json
    }
    # Solo en sandbox-agente, en una sesión aparte.
    "agente-sandbox" = {
      descripcion = "Agente: crea y borra dentro de sandbox-agente"
      duracion    = "PT4H"
      politicas   = ["arn:aws:iam::aws:policy/PowerUserAccess"]
      en_linea    = null
    }
    "guardia" = {
      descripcion = "Guardia: lectura y runbooks dimia-remediar-* permitidos"
      duracion    = "PT8H"
      politicas   = ["arn:aws:iam::aws:policy/job-function/ViewOnlyAccess"]
      en_linea    = data.aws_iam_policy_document.guardia.json
    }
    "facturacion" = {
      descripcion = "Facturación de la organización"
      duracion    = "PT4H"
      politicas   = ["arn:aws:iam::aws:policy/job-function/Billing"]
      en_linea    = null
    }
    # Acceso de emergencia: sesión de 1 h. Las SCP lo exceptúan por nombre.
    "emergencia" = {
      descripcion = "Emergencia: administrador por 1 h, con alarma"
      duracion    = "PT1H"
      politicas   = ["arn:aws:iam::aws:policy/AdministratorAccess"]
      en_linea    = null
    }
  }

  # Grupo -> permission set -> cuentas. Gestión solo para facturación y emergencia (§7.2).
  asignaciones = merge(
    { for n, id in local.miembros : "agente-lectura/${n}" => { grupo = "dimia-agente", ps = "agente-lectura", cuenta = id } },
    { for n, id in local.miembros : "guardia/${n}" => { grupo = "dimia-guardia", ps = "guardia", cuenta = id } },
    { for n, id in local.miembros : "emergencia/${n}" => { grupo = "dimia-emergencia", ps = "emergencia", cuenta = id } },
    {
      "agente-sandbox/sandbox-agente" = { grupo = "dimia-agente", ps = "agente-sandbox", cuenta = local.miembros["sandbox-agente"] }
      "emergencia/gestion"            = { grupo = "dimia-emergencia", ps = "emergencia", cuenta = aws_organizations_organization.this.master_account_id }
      "facturacion/gestion"           = { grupo = "dimia-facturacion", ps = "facturacion", cuenta = aws_organizations_organization.this.master_account_id }
    },
  )
}

data "aws_iam_policy_document" "agente_lectura" {
  #checkov:skip=CKV_AWS_356:ce, budgets, pricing y las consultas de logs y métricas no admiten permisos por recurso; todo es lectura.
  statement {
    sid = "CostosYMetricas"
    actions = [
      "budgets:View*",
      "ce:Get*",
      "cloudwatch:GetMetricData",
      "logs:GetQueryResults",
      "logs:StartQuery",
      "pricing:*",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "NuncaDatosNiSecretos"
    effect = "Deny"
    actions = [
      "kms:Decrypt",
      "rds-data:*",
      "rds-db:connect",
      "s3:GetObject",
      "secretsmanager:GetSecretValue",
      "ssm:GetParameter",
      "ssm:GetParameterHistory",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
      "sqs:ReceiveMessage",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "NuncaRolesDeOpenTofu"
    effect    = "Deny"
    actions   = ["sts:AssumeRole"]
    resources = ["arn:aws:iam::*:role/tofu-*"]
  }
}

data "aws_iam_policy_document" "guardia" {
  statement {
    sid       = "RunbooksPermitidos"
    actions   = ["ssm:StartAutomationExecution"]
    resources = ["arn:aws:ssm:*:*:automation-definition/dimia-remediar-*:*"]
  }

  statement {
    sid    = "SinLecturaDeDatos"
    effect = "Deny"
    actions = [
      "kms:Decrypt",
      "rds-data:*",
      "rds-db:connect",
      "s3:GetObject",
      "secretsmanager:GetSecretValue",
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = ["*"]
  }
}

resource "aws_ssoadmin_permission_set" "this" {
  for_each = local.permission_sets

  instance_arn     = local.sso_instancia
  name             = each.key
  description      = each.value.descripcion
  session_duration = each.value.duracion
}

resource "aws_ssoadmin_managed_policy_attachment" "this" {
  for_each = merge([
    for ps, v in local.permission_sets : { for p in v.politicas : "${ps}|${p}" => { ps = ps, politica = p } }
  ]...)

  instance_arn       = local.sso_instancia
  permission_set_arn = aws_ssoadmin_permission_set.this[each.value.ps].arn
  managed_policy_arn = each.value.politica
}

resource "aws_ssoadmin_permission_set_inline_policy" "this" {
  for_each = { for ps, v in local.permission_sets : ps => v if v.en_linea != null }

  instance_arn       = local.sso_instancia
  permission_set_arn = aws_ssoadmin_permission_set.this[each.key].arn
  inline_policy      = each.value.en_linea
}

# Los usuarios se agregan a mano a estos grupos: nombres y correos no van al repo.
resource "aws_identitystore_group" "this" {
  for_each = toset(["dimia-agente", "dimia-guardia", "dimia-emergencia", "dimia-facturacion"])

  identity_store_id = local.sso_directorio
  display_name      = each.key
}

resource "aws_ssoadmin_account_assignment" "this" {
  for_each = local.asignaciones

  instance_arn       = local.sso_instancia
  permission_set_arn = aws_ssoadmin_permission_set.this[each.value.ps].arn
  principal_id       = aws_identitystore_group.this[each.value.grupo].group_id
  principal_type     = "GROUP"
  target_id          = each.value.cuenta
  target_type        = "AWS_ACCOUNT"
}
