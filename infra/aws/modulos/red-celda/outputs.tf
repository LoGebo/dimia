output "vpc_id" {
  value = aws_vpc.this.id
}

output "cidr" {
  value = aws_vpc.this.cidr_block
}

output "ipv6_cidr" {
  value = aws_vpc.this.ipv6_cidr_block
}

output "subredes" {
  description = "tipo -> IDs por AZ, en el orden de var.zonas."
  value = {
    for tipo in keys(local.plan) : tipo => [for z in var.zonas : aws_subnet.this["${tipo}-${z}"].id]
  }
}

output "tablas_privadas" {
  value = [for z in var.zonas : aws_route_table.privada[z].id]
}
