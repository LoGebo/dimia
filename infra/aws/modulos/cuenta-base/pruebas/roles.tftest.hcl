# Los controles de los roles de OpenTofu (§7.2): si alguien los afloja, esto falla.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "333333333333" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::333333333333:policy/dimia-limite" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::333333333333:role/tofu-plan" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::333333333333:oidc-provider/token.actions.githubusercontent.com" }
  }
}

variables {
  nombre          = "prueba"
  entorno_apply   = "infra-prueba"
  presupuesto_usd = 10
  correos_alertas = ["guardia@example.com"]
  estado = {
    bucket_arn = "arn:aws:s3:::estado"
    llave_arn  = "arn:aws:kms:us-east-2:111111111111:key/mrk-1"
    prefijo    = "prueba/"
  }
}

run "produccion_no_planea_en_pr" {
  command = plan

  assert {
    condition = alltrue([
      for c in data.aws_iam_policy_document.confianza_plan.statement[0].condition :
      !anytrue([for v in c.values : endswith(v, ":pull_request")])
    ])
    error_message = "Sin plan_en_pr, tofu-plan no confía en el claim :pull_request."
  }

  assert {
    condition = alltrue([
      for s in ["SinContenidoFueraDeSuEstado", "SinDescifrarFueraDeSuLlave", "NuncaDatosNiSecretos"] :
      contains([for x in data.aws_iam_policy_document.estado_plan.statement : x.sid if x.effect == "Deny"], s)
    ])
    error_message = "tofu-plan niega el contenido de datos, secretos y logs."
  }

  assert {
    condition = alltrue([
      for a in ["s3:GetObject*", "dynamodb:Scan", "logs:GetLogEvents", "ssm:GetParameter*", "secretsmanager:GetSecretValue"] :
      anytrue([for x in data.aws_iam_policy_document.estado_plan.statement : contains(x.actions, a) if x.effect == "Deny"])
    ])
    error_message = "Falta una acción de lectura de contenido en el Deny de tofu-plan."
  }

  assert {
    condition = alltrue([
      for a in ["iam:PutRolePolicy", "iam:AttachRolePolicy", "iam:DeleteRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePermissionsBoundary", "iam:CreateRole"] :
      contains(one([for x in data.aws_iam_policy_document.limite.statement : x.actions if x.sid == "RolesSoloConLimite"]), a)
    ])
    error_message = "El límite impide modificar roles sin límite, no solo crearlos."
  }

  assert {
    condition     = contains(one([for x in data.aws_iam_policy_document.limite.statement : x.resources if x.sid == "ConfianzaDelRolDeLaOrganizacion"]), "arn:aws:iam::333333333333:role/OrganizationAccountAccessRole")
    error_message = "OrganizationAccountAccessRole queda fuera del alcance de tofu-apply."
  }
}

run "noprod_planea_en_pr" {
  command = plan

  variables {
    plan_en_pr = true
  }

  assert {
    condition = anytrue([
      for c in data.aws_iam_policy_document.confianza_plan.statement[0].condition :
      contains(c.values, "repo:LoGebo@90727612/dimia@1344315354:pull_request")
    ])
    error_message = "Con plan_en_pr, tofu-plan acepta el claim :pull_request."
  }
}
