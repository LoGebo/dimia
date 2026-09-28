# Aurora de noprod (§3.2, P10): Serverless v2 que se pausa sin tráfico; dev y staging son
# bases distintas dentro del mismo clúster.

data "aws_vpc" "red" {
  tags = { Name = "noprod-mx" }
}

data "aws_subnets" "datos" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.red.id]
  }
  filter {
    name   = "tag:Name"
    values = ["noprod-mx-datos-*"]
  }
}

data "aws_eks_cluster" "noprod" {
  name = "noprod-mx"
}

module "aurora" {
  source = "../../../modulos/datos-aurora"

  nombre      = "noprod-mx"
  vpc_id      = data.aws_vpc.red.id
  subredes    = sort(data.aws_subnets.datos.ids)
  sg_clientes = [data.aws_eks_cluster.noprod.vpc_config[0].cluster_security_group_id]
  acu         = { minimo = 0, maximo = 4 }
}

output "aurora" {
  value = {
    endpoint            = module.aurora.endpoint
    secreto_maestro_arn = module.aurora.secreto_maestro_arn
  }
}
