# VPC de doble pila de una celda o de un grupo de voz (§2.2, §3.1).
# El plan de direcciones es fijo, sin IPAM:
#   mx : privada-app /18 ×3 · datos /22 ×3 · pública /22 ×3 · reserva .216/21
#   voz: pública-voz /18 ×3 · privada /20 ×3 · reserva .240/20

data "aws_region" "actual" {}

locals {
  az = { for i, z in var.zonas : z => i }

  # tipo -> [bits nuevos sobre la /16, primer índice]; la subred de la AZ i usa índice + i.
  plan = {
    mx = {
      app     = { bits = 2, base = 0, publica = false }
      datos   = { bits = 6, base = 48, publica = false }
      publica = { bits = 6, base = 51, publica = true }
    }
    voz = {
      publica = { bits = 2, base = 0, publica = true }
      privada = { bits = 4, base = 12, publica = false }
    }
  }[var.perfil]

  # Cada subred recibe una /64 distinta de la /56 de Amazon.
  subredes = merge([
    for tipo, p in local.plan : {
      for z, i in local.az : "${tipo}-${z}" => {
        tipo    = tipo
        zona    = z
        cidr    = cidrsubnet(var.cidr, p.bits, p.base + i)
        ipv6    = index(keys(local.plan), tipo) * 3 + i
        publica = p.publica
      }
    }
  ]...)

  publicas = { for k, s in local.subredes : k => s if s.publica }
  privadas = { for k, s in local.subredes : k => s if !s.publica }
}

resource "aws_vpc" "this" {
  cidr_block                           = var.cidr
  assign_generated_ipv6_cidr_block     = true
  enable_dns_hostnames                 = true
  enable_dns_support                   = true
  enable_network_address_usage_metrics = true

  tags = { Name = var.nombre }
}

# El grupo por omisión queda sin reglas: nadie debe usarlo.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id
}

resource "aws_subnet" "this" {
  for_each = local.subredes

  vpc_id                                         = aws_vpc.this.id
  availability_zone                              = each.value.zona
  cidr_block                                     = each.value.cidr
  ipv6_cidr_block                                = cidrsubnet(aws_vpc.this.ipv6_cidr_block, 8, each.value.ipv6)
  assign_ipv6_address_on_creation                = true
  enable_resource_name_dns_aaaa_record_on_launch = true
  # Voz: los nodos salen por su IPv4 pública, sin NAT; su SG no tiene reglas de entrada.
  #checkov:skip=CKV_AWS_130:La voz sale por la IPv4 pública del nodo por diseño (§3.1); el SG no abre entrada.
  map_public_ip_on_launch = var.perfil == "voz" && each.value.publica

  tags = {
    Name        = "${var.nombre}-${each.key}"
    "dimia:red" = each.value.tipo
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.nombre }
}

resource "aws_egress_only_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.nombre }
}

resource "aws_route_table" "publica" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.nombre}-publica" }
}

resource "aws_route" "publica_ipv4" {
  route_table_id         = aws_route_table.publica.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route" "publica_ipv6" {
  route_table_id              = aws_route_table.publica.id
  destination_ipv6_cidr_block = "::/0"
  gateway_id                  = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "publica" {
  for_each = local.publicas

  subnet_id      = aws_subnet.this[each.key].id
  route_table_id = aws_route_table.publica.id
}

# Una tabla por AZ para las privadas: la NAT zonal y los endpoints se enrutan por tabla.
resource "aws_route_table" "privada" {
  for_each = local.az

  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.nombre}-privada-${each.key}" }
}

resource "aws_route" "privada_ipv6" {
  for_each = local.az

  route_table_id              = aws_route_table.privada[each.key].id
  destination_ipv6_cidr_block = "::/0"
  egress_only_gateway_id      = aws_egress_only_internet_gateway.this.id
}

resource "aws_route_table_association" "privada" {
  for_each = local.privadas

  subnet_id      = aws_subnet.this[each.key].id
  route_table_id = aws_route_table.privada[each.value.zona].id
}

# NAT regional: una sola, cubre las AZ activas y se cobra por AZ (§3.0).
# NAT zonal: una sola AZ, fuera de producción.
resource "aws_eip" "nat" {
  count  = var.nat == "zonal" ? 1 : 0
  domain = "vpc"
  tags   = { Name = "${var.nombre}-nat" }
}

resource "aws_nat_gateway" "this" {
  count = var.nat == "ninguna" ? 0 : 1

  availability_mode = var.nat
  vpc_id            = var.nat == "regional" ? aws_vpc.this.id : null
  subnet_id         = var.nat == "zonal" ? aws_subnet.this["publica-${var.zonas[0]}"].id : null
  allocation_id     = var.nat == "zonal" ? aws_eip.nat[0].id : null

  tags       = { Name = var.nombre }
  depends_on = [aws_internet_gateway.this]

  lifecycle {
    precondition {
      condition     = !(var.perfil == "voz" && var.nat != "ninguna")
      error_message = "La voz no lleva NAT: sale por la IPv4 pública del nodo (§3.1)."
    }
  }
}

resource "aws_route" "privada_ipv4" {
  for_each = var.nat == "ninguna" ? {} : local.az

  route_table_id         = aws_route_table.privada[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

# VPC Block Public Access va bidireccional por política declarativa, y eso también corta el
# egress-only IGW. Todas las subredes salen a internet (IPv4 por la NAT o la IP del nodo, IPv6
# por la EIGW), así que la exclusión solo de salida va a nivel VPC en todos los perfiles; sin
# ella, el IPv6 de salida de las privadas queda en un agujero negro [confirmar en staging, §3.1].
resource "aws_vpc_block_public_access_exclusion" "vpc" {
  vpc_id                          = aws_vpc.this.id
  internet_gateway_exclusion_mode = "allow-egress"
}

# Endpoints gateway de S3 y DynamoDB en todas las tablas: gratis y quitan tráfico de la NAT.
resource "aws_vpc_endpoint" "gateway" {
  for_each = toset(["s3", "dynamodb"])

  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.actual.region}.${each.key}"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = concat([aws_route_table.publica.id], [for t in aws_route_table.privada : t.id])

  tags = { Name = "${var.nombre}-${each.key}" }
}

resource "aws_security_group" "endpoints" {
  count = length(var.endpoints_interfaz) > 0 ? 1 : 0

  name        = "${var.nombre}-endpoints"
  description = "HTTPS desde la VPC hacia los endpoints de interfaz"
  vpc_id      = aws_vpc.this.id

  ingress {
    description      = "HTTPS desde la VPC"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = [aws_vpc.this.cidr_block]
    ipv6_cidr_blocks = [aws_vpc.this.ipv6_cidr_block]
  }
}

resource "aws_vpc_endpoint" "interfaz" {
  for_each = var.endpoints_interfaz

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.actual.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  ip_address_type     = "dualstack"
  subnet_ids          = [for k, s in local.privadas : aws_subnet.this[k].id if s.tipo == (var.perfil == "mx" ? "app" : "privada")]
  security_group_ids  = [aws_security_group.endpoints[0].id]

  tags = { Name = "${var.nombre}-${each.key}" }
}

resource "aws_flow_log" "this" {
  vpc_id                   = aws_vpc.this.id
  traffic_type             = "ALL"
  log_destination_type     = "s3"
  log_destination          = var.flow_logs_bucket_arn
  max_aggregation_interval = 600

  destination_options {
    file_format                = "parquet"
    hive_compatible_partitions = true
    per_hour_partition         = true
  }

  tags = { Name = var.nombre }
}

# Network Address Usage: 64,000 unidades por VPC [pub]; aviso al 80 %.
resource "aws_cloudwatch_metric_alarm" "nau" {
  alarm_name          = "${var.nombre}-nau-80"
  alarm_description   = "La VPC ${var.nombre} pasa del 80 % de Network Address Usage (64,000)."
  namespace           = "AWS/EC2"
  metric_name         = "NetworkAddressUsage"
  dimensions          = { "Per-VPC Metrics" = aws_vpc.this.id }
  statistic           = "Maximum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 51200
  treat_missing_data  = "missing"
  alarm_actions       = var.alarma_sns_arn == null ? [] : [var.alarma_sns_arn]
}
