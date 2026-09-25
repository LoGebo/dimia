# El estado queda aislado por cuenta: los roles tofu-* solo tocan el prefijo de su cuenta.
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::dimia-tofu-estado-111111111111" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-2:111111111111:key/mrk-1" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111111111111:role/dimia-tofu-estado-replicacion" }
  }
}

mock_provider "aws" {
  alias = "mx"
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::dimia-tofu-estado-111111111111-mx" }
  }
  mock_resource "aws_kms_replica_key" {
    defaults = { arn = "arn:aws:kms:mx-central-1:111111111111:key/mrk-1" }
  }
}

variables {
  org_id = "o-prueba1234"
  prefijos_por_cuenta = {
    "222222222222" = "noprod/"
    "333333333333" = "celdas/c01/"
  }
}

run "cada_cuenta_en_su_prefijo" {
  command = plan

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.estado.statement :
      alltrue([for r in s.resources : r != "arn:aws:s3:::dimia-tofu-estado-111111111111/*"])
      if s.sid != "SoloTLS" && s.sid != "Emergencia"
    ])
    error_message = "Solo emergencia llega a todo el bucket; los tofu-* se quedan en su prefijo."
  }

  assert {
    condition = one([
      for s in data.aws_iam_policy_document.estado.statement : s.resources if s.sid == "Estado222222222222"
    ]) == toset(["arn:aws:s3:::dimia-tofu-estado-111111111111/noprod/*"])
    error_message = "noprod solo toca noprod/."
  }

  assert {
    condition = anytrue(flatten([
      for s in data.aws_iam_policy_document.estado.statement : [
        for c in s.condition : c.variable == "aws:PrincipalAccount" && contains(c.values, "333333333333")
      ] if s.sid == "Estado333333333333"
    ]))
    error_message = "El prefijo de la celda va atado a la cuenta de la celda."
  }
}

run "prefijos_que_se_contienen_se_rechazan" {
  command = plan

  variables {
    prefijos_por_cuenta = {
      "222222222222" = "voz/"
      "333333333333" = "voz/g1/"
    }
  }

  expect_failures = [var.prefijos_por_cuenta]
}
