# Lo que el orquestador necesita en su entorno (despliegues/apps/*): EC2_PLANTILLA, EC2_SUBREDES, HERMES_REDES.
output "plantilla" {
  value = aws_launch_template.casa.id
}

output "subredes" {
  value = join(",", sort(data.aws_subnets.hermes.ids))
}

output "redes" {
  value = join(",", sort([for s in data.aws_subnet.hermes : s.cidr_block]))
}
