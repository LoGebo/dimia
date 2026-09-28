# Aurora de producción de la celda 01 (§3.2): Serverless v2 sin pausa (mínimo 1 ACU) con lector en
# otra AZ; pasa a r8g cuando el promedio supere ~2.5-3 ACU (P10).

data "aws_vpc" "red" {
  tags = { Name = "c01-mx" }
}

data "aws_subnets" "datos" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.red.id]
  }
  filter {
    name   = "tag:Name"
    values = ["c01-mx-datos-*"]
  }
}

data "aws_eks_cluster" "c01" {
  name = "c01-mx"
}

module "aurora" {
  source = "../../../../modulos/datos-aurora"

  nombre      = "c01-mx"
  vpc_id      = data.aws_vpc.red.id
  subredes    = sort(data.aws_subnets.datos.ids)
  sg_clientes = [data.aws_eks_cluster.c01.vpc_config[0].cluster_security_group_id]
  acu         = { minimo = 1, maximo = 8 }
  lectores    = 1
}

output "aurora" {
  value = {
    endpoint            = module.aurora.endpoint
    secreto_maestro_arn = module.aurora.secreto_maestro_arn
  }
}
