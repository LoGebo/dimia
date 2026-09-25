# FinOps de la organización (§6.1, §6.2). Corre en la cuenta de gestión, us-east-1:
# Budgets de organización, freno de sandbox-agente, Cost Anomaly Detection y CUR 2.0.

data "aws_caller_identity" "actual" {}
data "aws_region" "actual" {}

locals {
  cuenta = data.aws_caller_identity.actual.account_id
  region = data.aws_region.actual.region
}

# --- Avisos: un tema de SNS cifrado que pueden publicar Budgets y CAD.

data "aws_iam_policy_document" "llave_avisos" {
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
    sid       = "ServiciosDeCostos"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey*"]
    resources = ["*"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com", "costalerts.amazonaws.com"]
    }
  }
}

resource "aws_kms_key" "avisos" {
  description         = "Tema de SNS de avisos de costos"
  enable_key_rotation = true
  policy              = data.aws_iam_policy_document.llave_avisos.json
}

resource "aws_sns_topic" "avisos" {
  name              = "dimia-costos"
  kms_master_key_id = aws_kms_key.avisos.arn
}

data "aws_iam_policy_document" "avisos" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.avisos.arn]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com", "costalerts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.cuenta]
    }
  }
}

resource "aws_sns_topic_policy" "avisos" {
  arn    = aws_sns_topic.avisos.arn
  policy = data.aws_iam_policy_document.avisos.json
}

resource "aws_sns_topic_subscription" "avisos" {
  for_each = toset(var.correos_alertas)

  topic_arn = aws_sns_topic.avisos.arn
  protocol  = "email"
  endpoint  = each.value
}

# --- Budgets de organización (§6.1)

resource "aws_budgets_budget" "organizacion" {
  name         = "dimia-organizacion"
  budget_type  = "COST"
  limit_amount = tostring(var.presupuesto_org_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [
      { tipo = "FORECASTED", umbral = 80 },
      { tipo = "FORECASTED", umbral = 100 },
      { tipo = "ACTUAL", umbral = 100 },
      { tipo = "ACTUAL", umbral = 120 },
    ]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.umbral
      threshold_type             = "PERCENTAGE"
      notification_type          = notification.value.tipo
      subscriber_email_addresses = var.correos_alertas
      subscriber_sns_topic_arns  = [aws_sns_topic.avisos.arn]
    }
  }
}

# NAT y transferencia, al día: es la fuga más común y la que más tarda en verse.
resource "aws_budgets_budget" "red_diario" {
  name         = "dimia-red-diario"
  budget_type  = "COST"
  limit_amount = tostring(var.red_diario_usd)
  limit_unit   = "USD"
  time_unit    = "DAILY"

  # Grupos de tipo de uso de Cost Explorer [confirmar nombres en el primer apply].
  cost_filter {
    name = "UsageTypeGroup"
    values = [
      "EC2: NAT Gateway - Data Processed",
      "EC2: NAT Gateway - Running Hours",
      "EC2: Data Transfer - Inter AZ",
      "EC2: Data Transfer - Internet (Out)",
      "EC2: Data Transfer - Region to Region (Out)",
    ]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.correos_alertas
    subscriber_sns_topic_arns  = [aws_sns_topic.avisos.arn]
  }
}

# --- Freno de sandbox-agente (§7.2): al 100 % real se adjunta una SCP que lo niega todo salvo
# ver, detener y borrar. Es SCP y no política IAM porque los roles de Identity Center no se pueden
# modificar. Lo que ya corre sigue costando hasta que alguien lo borre (aws-nuke con emergencia):
# los Auto Scaling groups y los node groups lanzan con su rol de servicio, al que la SCP no aplica;
# por eso se permite bajarlos a cero. Las acciones van por servicio: IAM no admite comodín en el prefijo.

locals {
  freno_permitidas = concat(
    ["sts:*", "tag:GetResources", "budgets:View*", "ce:Get*"],
    flatten([for srv in ["ec2", "autoscaling", "eks", "ecs", "rds", "elasticloadbalancing", "lambda", "sagemaker", "s3", "cloudformation", "elasticache", "bedrock", "logs"] : [
      "${srv}:Describe*", "${srv}:List*", "${srv}:Get*", "${srv}:Delete*",
    ]]),
    [
      "autoscaling:UpdateAutoScalingGroup",
      "ec2:StopInstances",
      "ec2:TerminateInstances",
      "ecs:StopTask",
      "ecs:UpdateService",
      "eks:UpdateNodegroupConfig",
      "rds:StopDBCluster",
      "rds:StopDBInstance",
      "sagemaker:Stop*",
    ],
  )
}

resource "aws_organizations_policy" "freno_sandbox" {
  name        = "freno-sandbox"
  description = "La adjunta el budget de sandbox-agente al 100 %. Se quita a mano tras revisar."
  type        = "SERVICE_CONTROL_POLICY"
  content = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PresupuestoAgotado"
      Effect    = "Deny"
      NotAction = local.freno_permitidas
      Resource  = "*"
      Condition = {
        ArnNotLike = { "aws:PrincipalArn" = "arn:aws:iam::*:role/aws-reserved/sso.amazonaws.com/*AWSReservedSSO_emergencia_*" }
      }
    }]
  })

  lifecycle {
    precondition {
      condition     = length(jsonencode(local.freno_permitidas)) < 9000
      error_message = "La SCP del freno pasa del tope de 10,240 caracteres."
    }
  }
}

resource "aws_budgets_budget" "sandbox" {
  name         = "dimia-sandbox-agente"
  budget_type  = "COST"
  limit_amount = tostring(var.sandbox_presupuesto_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "LinkedAccount"
    values = [var.sandbox_cuenta_id]
  }

  dynamic "notification" {
    for_each = [50, 80]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.correos_alertas
    }
  }
}

data "aws_iam_policy_document" "confianza_budgets" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.cuenta]
    }
  }
}

resource "aws_iam_role" "budgets" {
  name               = "dimia-budgets-freno"
  assume_role_policy = data.aws_iam_policy_document.confianza_budgets.json
}

data "aws_iam_policy_document" "budgets" {
  statement {
    sid = "SoloElFrenoSoloEnSandbox"
    actions = [
      "organizations:AttachPolicy",
      "organizations:DescribePolicy",
      "organizations:DetachPolicy",
      "organizations:ListPoliciesForTarget",
      "organizations:ListTargetsForPolicy",
    ]
    resources = [
      aws_organizations_policy.freno_sandbox.arn,
      "arn:aws:organizations::${local.cuenta}:account/*/${var.sandbox_cuenta_id}",
    ]
  }
}

resource "aws_iam_role_policy" "budgets" {
  name   = "freno"
  role   = aws_iam_role.budgets.id
  policy = data.aws_iam_policy_document.budgets.json
}

resource "aws_budgets_budget_action" "freno_sandbox" {
  budget_name        = aws_budgets_budget.sandbox.name
  action_type        = "APPLY_SCP_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budgets.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    scp_action_definition {
      policy_id  = aws_organizations_policy.freno_sandbox.id
      target_ids = [var.sandbox_cuenta_id]
    }
  }

  subscriber {
    address           = aws_sns_topic.avisos.arn
    subscription_type = "SNS"
  }
}

# --- Cost Anomaly Detection (§6.1): aviso individual con 25 USD y 15 % a la vez.

resource "aws_ce_anomaly_monitor" "servicio" {
  name              = "dimia-servicio"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_monitor" "cuenta" {
  name              = "dimia-cuenta"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "LINKED_ACCOUNT"
}

resource "aws_ce_anomaly_monitor" "componente" {
  name         = "dimia-componente"
  monitor_type = "CUSTOM"
  monitor_specification = jsonencode({
    Tags = { Key = "dimia:componente", Values = var.componentes, MatchOptions = ["EQUALS"] }
  })
}

resource "aws_ce_anomaly_subscription" "this" {
  name      = "dimia-anomalias"
  frequency = "IMMEDIATE"
  monitor_arn_list = [
    aws_ce_anomaly_monitor.servicio.arn,
    aws_ce_anomaly_monitor.cuenta.arn,
    aws_ce_anomaly_monitor.componente.arn,
  ]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.avisos.arn
  }

  threshold_expression {
    and {
      dimension {
        key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
        match_options = ["GREATER_THAN_OR_EQUAL"]
        values        = ["25"]
      }
    }
    and {
      dimension {
        key           = "ANOMALY_TOTAL_IMPACT_PERCENTAGE"
        match_options = ["GREATER_THAN_OR_EQUAL"]
        values        = ["15"]
      }
    }
  }

  depends_on = [aws_sns_topic_policy.avisos]
}

resource "aws_ce_cost_allocation_tag" "this" {
  for_each = var.activar_etiquetas ? toset(["dimia:celda", "dimia:componente", "dimia:entorno", "dimia:negocio"]) : toset([])

  tag_key = each.value
  status  = "Active"
}
