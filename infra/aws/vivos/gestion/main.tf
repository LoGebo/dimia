# Organización, cuentas, guardarraíles e Identity Center, desde la cuenta de gestión.
# La aplica el dueño a mano con el permission set emergencia: la llave de la organización no pasa por CI.
module "organizacion" {
  source = "../../modulos/organizacion"

  dominio_correo        = var.dominio_correo
  guardarrailes_en_root = var.guardarrailes_en_root
  celdas                = [1]
}

output "cuentas" {
  value = module.organizacion.cuentas
}

output "org_id" {
  value = module.organizacion.org_id
}

output "celdas" {
  value = module.organizacion.celdas
}
