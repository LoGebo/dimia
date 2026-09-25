# El freno de sandbox-agente frena todo gasto nuevo, no solo EC2 (§7.2).
mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111111111111" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
}

variables {
  correos_alertas     = ["guardia@example.com"]
  presupuesto_org_usd = 1000
  red_diario_usd      = 20
  sandbox_cuenta_id   = "222222222222"
}

run "freno_niega_todo_salvo_limpiar" {
  command = plan

  plan_options {
    target = [aws_organizations_policy.freno_sandbox]
  }

  assert {
    condition     = jsondecode(aws_organizations_policy.freno_sandbox.content).Statement[0].Effect == "Deny" && jsondecode(aws_organizations_policy.freno_sandbox.content).Statement[0].Resource == "*"
    error_message = "El freno es un Deny sobre todo."
  }

  assert {
    condition = alltrue([
      for a in ["ec2:RunInstances", "ec2:StartInstances", "ec2:CreateNatGateway", "ec2:CreateVolume", "bedrock:InvokeModel", "lambda:InvokeFunction", "lambda:CreateFunction", "ecs:RunTask", "sagemaker:CreateEndpoint"] :
      !contains(jsondecode(aws_organizations_policy.freno_sandbox.content).Statement[0].NotAction, a)
    ])
    error_message = "Una acción que gasta quedó fuera del freno."
  }

  assert {
    condition = alltrue([
      for a in ["ec2:TerminateInstances", "autoscaling:UpdateAutoScalingGroup", "ec2:DescribeInstances", "sts:GetCallerIdentity"] :
      anytrue([for p in jsondecode(aws_organizations_policy.freno_sandbox.content).Statement[0].NotAction : a == p || (endswith(p, "*") && startswith(a, trimsuffix(p, "*")))])
    ])
    error_message = "Con el freno puesto se debe poder ver y apagar lo que corre."
  }
}
