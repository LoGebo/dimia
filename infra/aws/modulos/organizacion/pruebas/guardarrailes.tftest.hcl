mock_provider "aws" {
  mock_resource "aws_organizations_organization" {
    defaults = {
      id                = "o-prueba1234"
      master_account_id = "111111111111"
      roots             = [{ id = "r-raiz", arn = "arn", name = "Root", policy_types = [] }]
    }
  }
  mock_data "aws_ssoadmin_instances" {
    defaults = {
      arns               = ["arn:aws:sso:::instance/ssoins-prueba"]
      identity_store_ids = ["d-prueba"]
    }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_organizations_account" {
    defaults = { id = "222222222222" }
  }
  mock_resource "aws_identitystore_group" {
    defaults = { group_id = "12345678-1234-1234-1234-123456789012" }
  }
  mock_resource "aws_ssoadmin_permission_set" {
    defaults = { arn = "arn:aws:sso:::permissionSet/ssoins-1234567890abcdef/ps-1234567890abcdef" }
  }
}

override_resource {
  target = aws_organizations_organizational_unit.raiz
  values = { id = "ou-raiz-00000000" }
}

override_resource {
  target = aws_organizations_organizational_unit.prod
  values = { id = "ou-prod-11111111" }
}

override_resource {
  target = aws_organizations_organizational_unit.noprod
  values = { id = "ou-nopr-22222222" }
}

override_resource {
  target = aws_organizations_organizational_unit.prod_compartidas
  values = { id = "ou-comp-33333333" }
}

override_resource {
  target = aws_organizations_organizational_unit.prod_dedicadas
  values = { id = "ou-dedi-44444444" }
}

variables {
  dominio_correo = "dimia.mx"
}

run "primero_en_noprod" {
  command = plan

  assert {
    condition     = aws_organizations_policy_attachment.this["regiones"].target_id == aws_organizations_organizational_unit.noprod.id
    error_message = "La SCP de regiones se prueba primero en NoProd."
  }

  assert {
    condition = alltrue([
      for p in ["perimetro", "ec2"] : aws_organizations_policy_attachment.this[p].target_id == aws_organizations_organizational_unit.noprod.id
    ])
    error_message = "RCP de perímetro y declarativa de EC2 también empiezan en NoProd."
  }

  assert {
    condition     = aws_organizations_policy_attachment.this["base"].target_id == "r-raiz"
    error_message = "La SCP base va en Root desde el día 1."
  }

  assert {
    condition     = aws_organizations_policy_attachment.this["residencia"].target_id == aws_organizations_organizational_unit.prod.id
    error_message = "La residencia de datos aplica a toda la OU Prod."
  }

  assert {
    condition     = strcontains(aws_organizations_policy.this["perimetro"].content, "o-prueba1234")
    error_message = "La RCP debe llevar el ID real de la organización."
  }

  assert {
    condition     = strcontains(aws_organizations_policy.this["residencia"].content, "\"aws:PrincipalAccount\":[\"000000000000\"]")
    error_message = "Sin cuentas de voz, nadie de Prod crea buckets ni secretos fuera de mx."
  }

  assert {
    condition     = aws_organizations_policy_attachment.this["oidc-github"].target_id == "r-raiz" && strcontains(aws_organizations_policy.this["oidc-github"].content, "repo:LoGebo@90727612/dimia@1344315354:*")
    error_message = "La RCP de OIDC va en Root desde el día 1 y solo acepta tokens de nuestro repo."
  }

  assert {
    condition = alltrue([
      for a in ["savingsplans:Create*", "ec2:Purchase*", "shield:CreateSubscription", "route53domains:RegisterDomain", "aws-marketplace:Subscribe"] :
      contains(one([for st in jsondecode(aws_organizations_policy.this["base"].content).Statement : st.Action if st.Sid == "SinCompromisos"]), a)
    ])
    error_message = "La SCP base niega las compras con compromiso."
  }

  assert {
    condition     = alltrue([for c in aws_organizations_account.base : c.iam_user_access_to_billing == "ALLOW"])
    error_message = "Sin acceso de IAM a facturación, los budgets de cada cuenta no se pueden crear."
  }

  assert {
    condition     = !contains(keys(local.asignaciones), "agente-lectura/gestion")
    error_message = "El agente no entra a la cuenta de gestión (§7.2)."
  }

  assert {
    condition     = local.asignaciones["agente-sandbox/sandbox-agente"].cuenta == aws_organizations_account.base["sandbox-agente"].id
    error_message = "agente-sandbox solo va en sandbox-agente."
  }

  assert {
    condition     = aws_ssoadmin_permission_set.this["emergencia"].session_duration == "PT1H"
    error_message = "Emergencia dura 1 h."
  }
}

run "en_root" {
  command = plan

  variables {
    guardarrailes_en_root = true
  }

  assert {
    condition     = aws_organizations_policy_attachment.this["regiones"].target_id == "r-raiz"
    error_message = "Con guardarrailes_en_root, regiones pasa a Root."
  }
}

run "sin_identity_center_falla" {
  command = plan

  override_data {
    target = data.aws_ssoadmin_instances.this
    values = { arns = [], identity_store_ids = [] }
  }

  expect_failures = [data.aws_ssoadmin_instances.this]
}
