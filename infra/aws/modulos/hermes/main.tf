# Computadora de casa de Hermes (§3.6, paso 8): una EC2 por negocio con su disco EBS de datos.
# Aquí va lo fijo (SG, perfil de la instancia, plantilla y los permisos del orquestador); cada
# máquina la crea el orquestador (agentes/maquinas/ec2.py) con RunInstances sobre esta plantilla.

data "aws_caller_identity" "actual" {}
data "aws_partition" "actual" {}
data "aws_region" "actual" {}

locals {
  cuenta    = data.aws_caller_identity.actual.account_id
  particion = data.aws_partition.actual.partition
  region    = data.aws_region.actual.region
  etiqueta  = { "dimia:hermes" = var.nombre }
}

data "aws_vpc" "red" {
  tags = { Name = var.red }
}

data "aws_subnets" "hermes" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.red.id]
  }
  tags = { "dimia:red" = "hermes" }
}

data "aws_subnet" "app" {
  for_each = toset(var.zonas)
  vpc_id   = data.aws_vpc.red.id
  tags     = { Name = "${var.red}-app-${each.key}" }
}

data "aws_subnet" "hermes" {
  for_each = toset(data.aws_subnets.hermes.ids)
  id       = each.value
}

# Solo el orquestador (pods en las subredes app) llega a Hermes, a la compuerta de pantallas y al
# exec. Ningún negocio ve a otro: el SG no se acepta a sí mismo.
resource "aws_security_group" "casa" {
  name        = "${var.nombre}-hermes-casa"
  description = "Hermes: entra solo el orquestador desde las subredes app"
  vpc_id      = data.aws_vpc.red.id
}

resource "aws_vpc_security_group_ingress_rule" "casa" {
  for_each = {
    for par in setproduct(keys(local.puertos), var.zonas) : "${par[0]}-${par[1]}" => {
      puertos = local.puertos[par[0]]
      cidr    = data.aws_subnet.app[par[1]].cidr_block
    }
  }
  security_group_id = aws_security_group.casa.id
  ip_protocol       = "tcp"
  from_port         = each.value.puertos[0]
  to_port           = each.value.puertos[1]
  cidr_ipv4         = each.value.cidr
  description       = "orquestador ${each.key}"
}

locals {
  # imagen/pantallas.py (8600 pantallas, 8601 exec) y un Hermes por agente en 8700+n.
  puertos = { compuerta = [8600, 8601], hermes = [8700, 8799] }
}

resource "aws_vpc_security_group_egress_rule" "casa" {
  #checkov:skip=CKV_AWS_382:Hermes navega por internet por diseño; el proxy de salida de la celda llega después (§3.6).
  security_group_id = aws_security_group.casa.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
  description       = "salida a internet por la NAT"
}

resource "aws_vpc_security_group_egress_rule" "casa_v6" {
  security_group_id = aws_security_group.casa.id
  ip_protocol       = "-1"
  cidr_ipv6         = "::/0"
  description       = "salida IPv6 por la EIGW"
}

# --- La instancia: baja su imagen, lee su etiqueta de imagen y se administra por SSM ---

data "aws_iam_policy_document" "confianza_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "casa" {
  name                 = "${var.nombre}-hermes-casa"
  assume_role_policy   = data.aws_iam_policy_document.confianza_ec2.json
  permissions_boundary = var.limite_arn
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.casa.name
  policy_arn = "arn:${local.particion}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "casa" {
  statement {
    sid       = "LoginDeECR"
    actions   = ["ecr:GetAuthorizationToken", "ec2:DescribeTags"]
    resources = ["*"]
  }
  statement {
    sid       = "BajarLaImagenDeHermes"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [var.repositorio_arn]
  }
}

resource "aws_iam_role_policy" "casa" {
  name   = "imagen"
  role   = aws_iam_role.casa.id
  policy = data.aws_iam_policy_document.casa.json
}

resource "aws_iam_instance_profile" "casa" {
  name = "${var.nombre}-hermes-casa"
  role = aws_iam_role.casa.name
}

# El contenedor corre en la red bridge de Docker: con hop limit 1 no alcanza los metadatos ni,
# por tanto, las credenciales del perfil. Las etiquetas no se exponen en IMDS (política declarativa).
resource "aws_launch_template" "casa" {
  name                   = "${var.nombre}-hermes-casa"
  image_id               = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
  update_default_version = true
  vpc_security_group_ids = [aws_security_group.casa.id]
  ebs_optimized          = true

  iam_instance_profile {
    arn = aws_iam_instance_profile.casa.arn
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = true
  }

  # Dormir = hibernar: la RAM va al disco de sistema (cifrado, 30 GB > 8 GB de RAM) y al despertar
  # Hermes, Chromium y el escritorio siguen vivos. Solo se puede fijar al crear la instancia.
  hibernation_options {
    configured = true
  }

  tag_specifications {
    resource_type = "instance"
    tags          = local.etiqueta
  }

  tag_specifications {
    resource_type = "volume"
    tags          = local.etiqueta
  }
}

# --- El orquestador: crea, prende, apaga y borra solo lo que lleva la etiqueta de este entorno ---

data "aws_iam_policy_document" "orquestador" {
  statement {
    sid     = "CrearDesdeLaPlantilla"
    actions = ["ec2:RunInstances"]
    resources = [
      "arn:${local.particion}:ec2:${local.region}:${local.cuenta}:instance/*",
      "arn:${local.particion}:ec2:${local.region}:${local.cuenta}:volume/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/dimia:hermes"
      values   = [var.nombre]
    }
    condition {
      test     = "ArnLike"
      variable = "ec2:LaunchTemplate"
      values   = [aws_launch_template.casa.arn]
    }
  }

  statement {
    sid     = "LoQueUsaLaPlantilla"
    actions = ["ec2:RunInstances"]
    resources = concat(
      [for s in data.aws_subnet.hermes : s.arn],
      [
        aws_security_group.casa.arn,
        aws_launch_template.casa.arn,
        "arn:${local.particion}:ec2:${local.region}:${local.cuenta}:network-interface/*",
        "arn:${local.particion}:ec2:${local.region}::image/*",
      ],
    )
  }

  statement {
    sid       = "EtiquetarAlCrear"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:${local.particion}:ec2:${local.region}:${local.cuenta}:*/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["RunInstances"]
    }
  }

  statement {
    sid = "AdministrarLasSuyas"
    actions = [
      "ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances", "ec2:TerminateInstances",
      "ec2:ModifyInstanceAttribute", "ec2:AttachVolume", "ec2:DetachVolume", "ec2:DeleteVolume", "ec2:CreateTags",
    ]
    resources = [
      "arn:${local.particion}:ec2:${local.region}:${local.cuenta}:instance/*",
      "arn:${local.particion}:ec2:${local.region}:${local.cuenta}:volume/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/dimia:hermes"
      values   = [var.nombre]
    }
  }

  # La plantilla toma la AMI de AL2023 de un parámetro público de SSM (resolve:ssm:).
  statement {
    sid       = "ResolverLaAmi"
    actions   = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = ["arn:${local.particion}:ssm:${local.region}::parameter/aws/service/ami-amazon-linux-latest/*"]
  }

  statement {
    sid       = "Leer"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeVolumes", "ec2:DescribeSubnets"]
    resources = ["*"]
  }

  statement {
    sid       = "PasarElPerfil"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.casa.arn]
  }
}

resource "aws_iam_role" "orquestador" {
  name                 = "${var.nombre}-hermes-orquestador"
  assume_role_policy   = data.aws_iam_policy_document.confianza_pod.json
  permissions_boundary = var.limite_arn
}

data "aws_iam_policy_document" "confianza_pod" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "orquestador" {
  name   = "hermes"
  role   = aws_iam_role.orquestador.id
  policy = data.aws_iam_policy_document.orquestador.json
}

resource "aws_eks_pod_identity_association" "orquestador" {
  cluster_name    = var.cluster
  namespace       = var.namespace
  service_account = "agentes"
  role_arn        = aws_iam_role.orquestador.arn
}
