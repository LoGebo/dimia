# Karpenter v1 (§3.3): controlador en el node group de sistema, credenciales por Pod Identity,
# cola de interrupciones y descubrimiento por la etiqueta karpenter.sh/discovery. Los NodePools y
# EC2NodeClass viven en despliegues/plataforma (Kubernetes, no OpenTofu).

locals {
  etiqueta_cluster = "kubernetes.io/cluster/${var.nombre}"
}

resource "aws_eks_access_entry" "karpenter_nodo" {
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = aws_iam_role.nodo["karpenter"].arn
  type          = "EC2_LINUX"
}

# Descubrimiento: las subredes y el SG del clúster llevan la etiqueta (son de otra pila; aws_ec2_tag no las toma).
resource "aws_ec2_tag" "subred" {
  for_each    = toset(var.subredes)
  resource_id = each.value
  key         = "karpenter.sh/discovery"
  value       = var.nombre
}

resource "aws_ec2_tag" "sg" {
  resource_id = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
  key         = "karpenter.sh/discovery"
  value       = var.nombre
}

# --- Interrupciones: Spot, rebalanceo, mantenimiento y cambios de estado.

resource "aws_sqs_queue" "interrupciones" {
  name                      = "karpenter-${var.nombre}"
  message_retention_seconds = 300
  sqs_managed_sse_enabled   = true
}

data "aws_iam_policy_document" "interrupciones" {
  statement {
    sid       = "EventBridge"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.interrupciones.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com", "sqs.amazonaws.com"]
    }
  }

  statement {
    sid       = "SoloTLS"
    effect    = "Deny"
    actions   = ["sqs:*"]
    resources = [aws_sqs_queue.interrupciones.arn]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "interrupciones" {
  queue_url = aws_sqs_queue.interrupciones.url
  policy    = data.aws_iam_policy_document.interrupciones.json
}

locals {
  eventos = {
    salud      = { source = ["aws.health"], detail-type = ["AWS Health Event"] }
    spot       = { source = ["aws.ec2"], detail-type = ["EC2 Spot Instance Interruption Warning"] }
    rebalanceo = { source = ["aws.ec2"], detail-type = ["EC2 Instance Rebalance Recommendation"] }
    estado     = { source = ["aws.ec2"], detail-type = ["EC2 Instance State-change Notification"] }
    capacidad  = { source = ["aws.ec2"], detail-type = ["EC2 Capacity Reservation Instance Interruption Warning"] }
  }
}

resource "aws_cloudwatch_event_rule" "karpenter" {
  for_each      = local.eventos
  name          = "karpenter-${var.nombre}-${each.key}"
  event_pattern = jsonencode(each.value)
}

resource "aws_cloudwatch_event_target" "karpenter" {
  for_each = local.eventos
  rule     = aws_cloudwatch_event_rule.karpenter[each.key].name
  arn      = aws_sqs_queue.interrupciones.arn
}

# --- Controlador

resource "aws_iam_role" "karpenter" {
  name                 = "eks-${var.nombre}-karpenter"
  assume_role_policy   = data.aws_iam_policy_document.confianza_pod.json
  permissions_boundary = var.limite_arn
}

data "aws_iam_policy_document" "karpenter" {
  #checkov:skip=CKV_AWS_356:Describe* de EC2 y la lectura de precios no admiten permisos por recurso.
  #checkov:skip=CKV_AWS_111:Crear flotas y plantillas se acota por etiqueta del clúster y región, no por ARN.
  statement {
    sid = "CrearInstancias"
    actions = [
      "ec2:RunInstances", "ec2:CreateFleet",
    ]
    resources = [
      "arn:${local.particion}:ec2:${local.region}::image/*",
      "arn:${local.particion}:ec2:${local.region}::snapshot/*",
      "arn:${local.particion}:ec2:${local.region}:*:security-group/*",
      "arn:${local.particion}:ec2:${local.region}:*:subnet/*",
      "arn:${local.particion}:ec2:${local.region}:*:capacity-reservation/*",
    ]
  }

  statement {
    sid       = "UsarPlantillasDelCluster"
    actions   = ["ec2:RunInstances", "ec2:CreateFleet"]
    resources = ["arn:${local.particion}:ec2:${local.region}:*:launch-template/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
  }

  statement {
    sid = "CrearConEtiquetaDelCluster"
    actions = [
      "ec2:RunInstances", "ec2:CreateFleet", "ec2:CreateLaunchTemplate",
    ]
    resources = [
      "arn:${local.particion}:ec2:${local.region}:*:fleet/*",
      "arn:${local.particion}:ec2:${local.region}:*:instance/*",
      "arn:${local.particion}:ec2:${local.region}:*:volume/*",
      "arn:${local.particion}:ec2:${local.region}:*:network-interface/*",
      "arn:${local.particion}:ec2:${local.region}:*:launch-template/*",
      "arn:${local.particion}:ec2:${local.region}:*:spot-instances-request/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
    condition {
      test     = "StringLike"
      variable = "aws:RequestTag/karpenter.sh/nodepool"
      values   = ["*"]
    }
  }

  statement {
    sid     = "EtiquetarAlCrear"
    actions = ["ec2:CreateTags"]
    resources = [
      "arn:${local.particion}:ec2:${local.region}:*:fleet/*",
      "arn:${local.particion}:ec2:${local.region}:*:instance/*",
      "arn:${local.particion}:ec2:${local.region}:*:volume/*",
      "arn:${local.particion}:ec2:${local.region}:*:network-interface/*",
      "arn:${local.particion}:ec2:${local.region}:*:launch-template/*",
      "arn:${local.particion}:ec2:${local.region}:*:spot-instances-request/*",
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["RunInstances", "CreateFleet", "CreateLaunchTemplate"]
    }
  }

  statement {
    sid       = "EtiquetarNodosPropios"
    actions   = ["ec2:CreateTags"]
    resources = ["arn:${local.particion}:ec2:${local.region}:*:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "aws:TagKeys"
      values   = ["eks:eks-cluster-name", "karpenter.sh/nodeclaim", "Name"]
    }
  }

  statement {
    sid       = "BorrarSoloLoPropio"
    actions   = ["ec2:TerminateInstances", "ec2:DeleteLaunchTemplate"]
    resources = ["arn:${local.particion}:ec2:${local.region}:*:instance/*", "arn:${local.particion}:ec2:${local.region}:*:launch-template/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
  }

  statement {
    sid = "LecturaRegional"
    actions = [
      "ec2:DescribeCapacityReservations", "ec2:DescribeImages", "ec2:DescribeInstances",
      "ec2:DescribeInstanceTypeOfferings", "ec2:DescribeInstanceTypes", "ec2:DescribeLaunchTemplates",
      "ec2:DescribeSecurityGroups", "ec2:DescribeSpotPriceHistory", "ec2:DescribeSubnets",
      "ec2:DescribePlacementGroups",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [local.region]
    }
  }

  statement {
    sid       = "AmisDeSSM"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:${local.particion}:ssm:${local.region}::parameter/aws/service/*"]
  }

  statement {
    sid       = "Precios"
    actions   = ["pricing:GetProducts"]
    resources = ["*"]
  }

  statement {
    sid       = "ColaDeInterrupciones"
    actions   = ["sqs:DeleteMessage", "sqs:GetQueueUrl", "sqs:ReceiveMessage"]
    resources = [aws_sqs_queue.interrupciones.arn]
  }

  statement {
    sid       = "PasarElRolDeNodo"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.nodo["karpenter"].arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }

  statement {
    sid = "PerfilesDeInstanciaPropios"
    actions = [
      "iam:AddRoleToInstanceProfile", "iam:CreateInstanceProfile", "iam:DeleteInstanceProfile",
      "iam:RemoveRoleFromInstanceProfile", "iam:TagInstanceProfile",
    ]
    resources = ["arn:${local.particion}:iam::${local.cuenta}:instance-profile/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
  }

  statement {
    sid       = "CrearPerfilEtiquetado"
    actions   = ["iam:CreateInstanceProfile", "iam:TagInstanceProfile"]
    resources = ["arn:${local.particion}:iam::${local.cuenta}:instance-profile/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/${local.etiqueta_cluster}"
      values   = ["owned"]
    }
  }

  statement {
    sid       = "LeerPerfiles"
    actions   = ["iam:GetInstanceProfile", "iam:ListInstanceProfiles"]
    resources = ["*"]
  }

  statement {
    sid       = "DescubrirEndpoint"
    actions   = ["eks:DescribeCluster"]
    resources = [aws_eks_cluster.this.arn]
  }
}

resource "aws_iam_role_policy" "karpenter" {
  name   = "karpenter"
  role   = aws_iam_role.karpenter.id
  policy = data.aws_iam_policy_document.karpenter.json
}

resource "aws_eks_pod_identity_association" "karpenter" {
  cluster_name    = aws_eks_cluster.this.name
  namespace       = "kube-system"
  service_account = "karpenter"
  role_arn        = aws_iam_role.karpenter.arn
}

resource "helm_release" "karpenter" {
  name       = "karpenter"
  namespace  = "kube-system"
  repository = "oci://public.ecr.aws/karpenter"
  chart      = "karpenter"
  version    = var.karpenter_version
  wait       = true

  values = [yamlencode({
    settings = {
      clusterName       = aws_eks_cluster.this.name
      interruptionQueue = aws_sqs_queue.interrupciones.name
    }
    nodeSelector = { "dimia.mx/pool" = "sistema" }
    replicas     = 2
    controller = {
      resources = {
        requests = { cpu = "250m", memory = "512Mi" }
        limits   = { memory = "512Mi" }
      }
    }
  })]

  # Sin la política de admin ya asociada, el token de tofu-apply no puede instalar los CRD.
  depends_on = [
    aws_eks_access_policy_association.admin,
    aws_eks_pod_identity_association.karpenter,
    aws_iam_role_policy.karpenter,
    aws_eks_addon.con_nodos,
  ]
}
