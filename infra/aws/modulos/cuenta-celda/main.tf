# Alta de una cuenta de celda (vending, §2.1). Unas cuantas veces al año, por PR.
# La red y las cargas se aplican después, en vivos/celdas/cNN, con el cidr_mx de aquí.

locals {
  nn     = format("%02d", var.indice)
  nombre = "prod-celda-${local.nn}"

  # Plan de direcciones de §3.1: celda k = 10.(16+4k).0.0/14; +0 es mx, lo demás es reserva.
  bloque  = "10.${16 + 4 * var.indice}.0.0/14"
  cidr_mx = cidrsubnet(local.bloque, 2, 0)
}

resource "aws_organizations_account" "this" {
  name                       = local.nombre
  email                      = "aws+celda${local.nn}@${var.dominio_correo}"
  parent_id                  = var.ou_id
  iam_user_access_to_billing = "ALLOW" # Budgets y Cost Explorer en la cuenta, ver organizacion
  close_on_deletion          = false

  tags = {
    "dimia:celda" = "c${local.nn}"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [iam_user_access_to_billing, role_name]
  }
}

resource "aws_account_region" "mx" {
  account_id  = aws_organizations_account.this.id
  region_name = "mx-central-1"
  enabled     = true
}
