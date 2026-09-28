# EKS de noprod (§2.1): dev y staging comparten clúster y se separan por namespace.
# La red sale de vivos/noprod/red; se busca por nombre para no leer otro estado.

data "aws_caller_identity" "actual" {}

data "aws_vpc" "red" {
  tags = { Name = "noprod-mx" }
}

data "aws_subnets" "app" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.red.id]
  }
  filter {
    name   = "tag:Name"
    values = ["noprod-mx-app-*"]
  }
}

module "eks" {
  source    = "../../../modulos/eks"
  providers = { aws = aws, aws.virginia = aws.virginia, helm = helm }

  nombre     = "noprod-mx"
  subredes   = sort(data.aws_subnets.app.ids)
  limite_arn = "arn:aws:iam::${data.aws_caller_identity.actual.account_id}:policy/dimia-limite"
  admins     = ["arn:aws:iam::${data.aws_caller_identity.actual.account_id}:role/tofu-apply"]

  ami_sistema = "1.36.4-20260923"
  addons = {
    "vpc-cni"                = "v1.22.4-eksbuild.3"
    "kube-proxy"             = "v1.36.0-eksbuild.25"
    "eks-pod-identity-agent" = "v1.3.10-eksbuild.3"
    "coredns"                = "v1.14.3-eksbuild.23"
    "aws-ebs-csi-driver"     = "v1.66.0-eksbuild.1"
  }
}

output "eks" {
  value = {
    nombre             = module.eks.nombre
    endpoint           = module.eks.endpoint
    rol_nodo_karpenter = module.eks.rol_nodo_karpenter
  }
}

module "observabilidad" {
  source = "../../../modulos/observabilidad"

  nombre     = "noprod-mx"
  cluster    = module.eks.nombre
  limite_arn = "arn:aws:iam::${data.aws_caller_identity.actual.account_id}:policy/dimia-limite"
}

output "amp_remote_write" {
  value = module.observabilidad.remote_write_url
}
