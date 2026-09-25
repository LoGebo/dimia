# Budget de la cuenta (§6.1). Tarda 8-12 h en actualizarse: avisa, no es un tope duro.
# El freno automático de sandbox-agente vive en finops (gestión): los roles de
# Identity Center no admiten políticas adjuntas, así que el freno es una SCP.

resource "aws_budgets_budget" "this" {
  name         = "dimia-${var.nombre}"
  budget_type  = "COST"
  limit_amount = tostring(var.presupuesto_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = [50, 80, 100]
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.correos_alertas
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.correos_alertas
  }
}
