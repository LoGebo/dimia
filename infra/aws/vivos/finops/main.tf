# Budgets, freno de sandbox, anomalías y CUR 2.0 de la organización (gestión, us-east-1).
module "finops" {
  source = "../../modulos/finops"

  correos_alertas     = var.correos_alertas
  presupuesto_org_usd = 400 # cimientos: ~150-300 USD al mes (§6.3)
  red_diario_usd      = 10
  sandbox_cuenta_id   = var.sandbox_cuenta_id
  activar_etiquetas   = var.activar_etiquetas
}
