# El plan de direcciones de §3.1 es fijo: si alguien mueve una subred, esto falla.
mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "mx-central-1" }
  }
  mock_resource "aws_vpc" {
    defaults = { ipv6_cidr_block = "2600:1f00:1234:5600::/56" }
  }
}

variables {
  nombre               = "prueba"
  cidr                 = "10.20.0.0/16"
  zonas                = ["mx-central-1a", "mx-central-1b", "mx-central-1c"]
  flow_logs_bucket_arn = "arn:aws:s3:::flujos"
}

run "mx_con_nat_regional" {
  command = apply

  variables {
    perfil = "mx"
  }

  assert {
    condition     = [for z in var.zonas : aws_subnet.this["app-${z}"].cidr_block] == ["10.20.0.0/18", "10.20.64.0/18", "10.20.128.0/18"]
    error_message = "privada-app debe ser /18 ×3 desde el inicio de la /16."
  }

  assert {
    condition     = [for z in var.zonas : aws_subnet.this["datos-${z}"].cidr_block] == ["10.20.192.0/22", "10.20.196.0/22", "10.20.200.0/22"]
    error_message = "datos debe ser /22 ×3 a partir de .192."
  }

  assert {
    condition     = [for z in var.zonas : aws_subnet.this["publica-${z}"].cidr_block] == ["10.20.204.0/22", "10.20.208.0/22", "10.20.212.0/22"]
    error_message = "pública debe ser /22 ×3 y dejar libre la reserva .216/21."
  }

  assert {
    condition     = length(distinct([for s in aws_subnet.this : s.ipv6_cidr_block])) == 9
    error_message = "Cada subred necesita su propia /64."
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1 && aws_nat_gateway.this[0].availability_mode == "regional"
    error_message = "Producción usa una NAT regional."
  }

  assert {
    condition     = length(aws_route.privada_ipv4) == 3
    error_message = "Las 3 tablas privadas salen por la NAT."
  }

  assert {
    condition     = length(aws_route.privada_ipv6) == 0 || aws_vpc_block_public_access_exclusion.vpc.internet_gateway_exclusion_mode == "allow-egress"
    error_message = "Toda ruta a la EIGW necesita la exclusión de salida de la VPC."
  }

  assert {
    condition     = alltrue([for s in aws_subnet.this : !s.map_public_ip_on_launch])
    error_message = "En mx ninguna subred reparte IPv4 pública."
  }
}

run "voz_sin_nat" {
  command = apply

  variables {
    perfil = "voz"
    cidr   = "10.202.0.0/16"
    nat    = "ninguna"
  }

  assert {
    condition     = [for z in var.zonas : aws_subnet.this["privada-${z}"].cidr_block] == ["10.202.192.0/20", "10.202.208.0/20", "10.202.224.0/20"]
    error_message = "privada de voz debe ser /20 ×3 y dejar libre la reserva .240/20."
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 0 && length(aws_route.privada_ipv4) == 0
    error_message = "La voz no lleva NAT."
  }

  assert {
    condition     = alltrue([for z in var.zonas : aws_subnet.this["publica-${z}"].map_public_ip_on_launch])
    error_message = "Los nodos de voz salen por su IPv4 pública."
  }

  assert {
    condition     = aws_vpc_block_public_access_exclusion.vpc.vpc_id == aws_vpc.this.id && aws_vpc_block_public_access_exclusion.vpc.internet_gateway_exclusion_mode == "allow-egress"
    error_message = "Las públicas y las privadas de voz (IPv6 por la EIGW) necesitan la exclusión de salida de la VPC."
  }
}

run "voz_con_nat_se_rechaza" {
  command = plan

  variables {
    perfil = "voz"
    nat    = "regional"
  }

  expect_failures = [aws_nat_gateway.this]
}

run "noprod_nat_zonal" {
  command = apply

  variables {
    perfil = "mx"
    nat    = "zonal"
  }

  assert {
    condition     = aws_nat_gateway.this[0].subnet_id == aws_subnet.this["publica-mx-central-1a"].id && length(aws_eip.nat) == 1
    error_message = "La NAT zonal vive en la subred pública de la primera AZ con su EIP."
  }

  assert {
    condition     = length(aws_route.privada_ipv6) == 3 && aws_vpc_block_public_access_exclusion.vpc.vpc_id == aws_vpc.this.id && aws_vpc_block_public_access_exclusion.vpc.internet_gateway_exclusion_mode == "allow-egress"
    error_message = "En noprod, las privadas salen por IPv6 a la EIGW: la VPC necesita su exclusión de salida, como en c01."
  }
}
