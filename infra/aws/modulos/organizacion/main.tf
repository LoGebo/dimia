# Organización de Dimia (§2.1, §3.1): OUs, cuentas base, guardarraíles e Identity Center.
# Se aplica desde la cuenta de gestión, que no corre cargas ni herramientas.

locals {
  # Cuentas base de §2.1. Las celdas vienen del módulo cuenta-celda; las de voz, en la etapa B.
  cuentas = {
    "log-archivo"    = "seguridad"
    "seguridad"      = "seguridad"
    "respaldo"       = "seguridad"
    "compartido"     = "infraestructura"
    "operaciones"    = "infraestructura"
    "prod-global"    = "prod-compartidas"
    "noprod"         = "noprod"
    "sandbox-agente" = "noprod"
  }

  ous_raiz = ["seguridad", "infraestructura", "cargas", "suspendidas"]

  ou_ids = merge(
    { for k, ou in aws_organizations_organizational_unit.raiz : k => ou.id },
    {
      "prod"             = aws_organizations_organizational_unit.prod.id
      "noprod"           = aws_organizations_organizational_unit.noprod.id
      "prod-compartidas" = aws_organizations_organizational_unit.prod_compartidas.id
      "prod-dedicadas"   = aws_organizations_organizational_unit.prod_dedicadas.id
    },
  )

  raiz = aws_organizations_organization.this.roots[0].id

  # Lo que puede romper algo se prueba en NoProd antes de subirlo a Root.
  destino_amplio = var.guardarrailes_en_root ? local.raiz : local.ou_ids["noprod"]

  # jsonencode garantiza JSON válido y deja la política en su tamaño mínimo.
  politicas = {
    "base" = {
      tipo      = "SERVICE_CONTROL_POLICY"
      destino   = local.raiz
      contenido = jsonencode(jsondecode(file("${path.module}/../../politicas/scp/base.json")))
    }
    "regiones" = {
      tipo      = "SERVICE_CONTROL_POLICY"
      destino   = local.destino_amplio
      contenido = jsonencode(jsondecode(file("${path.module}/../../politicas/scp/regiones.json")))
    }
    "residencia" = {
      tipo    = "SERVICE_CONTROL_POLICY"
      destino = local.ou_ids["prod"]
      contenido = jsonencode(jsondecode(templatefile("${path.module}/../../politicas/scp/residencia.json.tftpl", {
        # Sin cuentas de voz todavía: un ID imposible deja la excepción vacía sin romper la sintaxis.
        cuentas_voz = jsonencode(length(var.cuentas_voz) > 0 ? var.cuentas_voz : ["000000000000"])
      })))
    }
    "agente-mcp" = {
      tipo      = "SERVICE_CONTROL_POLICY"
      destino   = local.ou_ids["prod"]
      contenido = jsonencode(jsondecode(file("${path.module}/../../politicas/scp/agente-mcp.json")))
    }
    "suspendida" = {
      tipo      = "SERVICE_CONTROL_POLICY"
      destino   = local.ou_ids["suspendidas"]
      contenido = jsonencode(jsondecode(file("${path.module}/../../politicas/scp/suspendida.json")))
    }
    "perimetro" = {
      tipo    = "RESOURCE_CONTROL_POLICY"
      destino = local.destino_amplio
      contenido = jsonencode(jsondecode(templatefile("${path.module}/../../politicas/rcp/perimetro.json.tftpl", {
        org_id = aws_organizations_organization.this.id
      })))
    }
    # Ningún rol de ninguna cuenta confía en un token de GitHub de otro repo, aunque tofu-apply
    # lo cree con límite. Es RCP porque la SCP no aplica a quien llega con AssumeRoleWithWebIdentity.
    # Null deja pasar otros emisores (EKS, Cognito) [confirmar en el primer apply].
    "oidc-github" = {
      tipo    = "RESOURCE_CONTROL_POLICY"
      destino = local.raiz
      contenido = jsonencode(jsondecode(templatefile("${path.module}/../../politicas/rcp/oidc-github.json.tftpl", {
        github_sub = var.github_sub
      })))
    }
    "ec2" = {
      tipo      = "DECLARATIVE_POLICY_EC2"
      destino   = local.destino_amplio
      contenido = jsonencode(jsondecode(file("${path.module}/../../politicas/declarativas/ec2.json")))
    }
  }

  # Topes de tamaño de §3.1 [pub]: SCP 10,240 caracteres, RCP 5,120.
  tope_caracteres = {
    SERVICE_CONTROL_POLICY  = 10240
    RESOURCE_CONTROL_POLICY = 5120
  }
}

resource "aws_organizations_organization" "this" {
  feature_set = "ALL"

  aws_service_access_principals = [
    "account.amazonaws.com", # aws_account_region falla sin esto (§3.1)
    "backup.amazonaws.com",
    "cloudtrail.amazonaws.com",
    "config.amazonaws.com",
    "cost-optimization-hub.bcm.amazonaws.com",
    "guardduty.amazonaws.com",
    "iam.amazonaws.com", # root centralizado
    "inspector2.amazonaws.com",
    "securityhub.amazonaws.com",
    "servicequotas.amazonaws.com",
    "sso.amazonaws.com",
  ]

  enabled_policy_types = [
    "SERVICE_CONTROL_POLICY",
    "RESOURCE_CONTROL_POLICY",
    "DECLARATIVE_POLICY_EC2",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

# Root centralizado: las cuentas miembro nacen sin credenciales root.
resource "aws_iam_organizations_features" "this" {
  enabled_features = ["RootCredentialsManagement", "RootSessions"]

  depends_on = [aws_organizations_organization.this]
}

resource "aws_organizations_organizational_unit" "raiz" {
  for_each = toset(local.ous_raiz)

  name      = each.key
  parent_id = local.raiz
}

resource "aws_organizations_organizational_unit" "prod" {
  name      = "prod"
  parent_id = aws_organizations_organizational_unit.raiz["cargas"].id
}

resource "aws_organizations_organizational_unit" "noprod" {
  name      = "noprod"
  parent_id = aws_organizations_organizational_unit.raiz["cargas"].id
}

resource "aws_organizations_organizational_unit" "prod_compartidas" {
  name      = "compartidas"
  parent_id = aws_organizations_organizational_unit.prod.id
}

resource "aws_organizations_organizational_unit" "prod_dedicadas" {
  name      = "dedicadas"
  parent_id = aws_organizations_organizational_unit.prod.id
}

resource "aws_organizations_account" "base" {
  for_each = local.cuentas

  name      = each.key
  email     = "aws+${each.key}@${var.dominio_correo}"
  parent_id = local.ou_ids[each.value]
  # ALLOW: sin él, ningún rol de la cuenta (ni los de Identity Center) usa Budgets ni Cost
  # Explorer. El acceso lo siguen decidiendo las políticas y las SCP.
  iam_user_access_to_billing = "ALLOW"
  close_on_deletion          = false

  lifecycle {
    prevent_destroy = true
    # AWS no devuelve estos dos campos: sin esto habría un diff eterno.
    ignore_changes = [iam_user_access_to_billing, role_name]
  }
}

# mx-central-1 es opt-in: se habilita por cuenta desde gestión.
resource "aws_account_region" "mx" {
  for_each = local.cuentas

  account_id  = aws_organizations_account.base[each.key].id
  region_name = "mx-central-1"
  enabled     = true

  depends_on = [aws_organizations_organization.this]
}

module "celda" {
  source   = "../cuenta-celda"
  for_each = { for i in var.celdas : format("%02d", i) => i }

  indice         = each.value
  ou_id          = local.ou_ids["prod-compartidas"]
  dominio_correo = var.dominio_correo

  depends_on = [aws_organizations_organization.this]
}

resource "aws_organizations_policy" "this" {
  for_each = local.politicas

  name    = each.key
  type    = each.value.tipo
  content = each.value.contenido

  lifecycle {
    precondition {
      condition     = length(each.value.contenido) <= lookup(local.tope_caracteres, each.value.tipo, length(each.value.contenido))
      error_message = "La política ${each.key} pasa del tope de caracteres de su tipo."
    }
  }
}

resource "aws_organizations_policy_attachment" "this" {
  for_each = local.politicas

  policy_id = aws_organizations_policy.this[each.key].id
  target_id = each.value.destino
}
