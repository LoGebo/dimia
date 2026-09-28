# EKS de una región (§3.5, §4): plano de control privado + endpoint público autenticado por IAM,
# secretos cifrados con KMS propia, access entries (sin aws-auth), Pod Identity y upgrade STANDARD.

data "aws_caller_identity" "actual" {}
data "aws_partition" "actual" {}
data "aws_region" "actual" {}

locals {
  cuenta    = data.aws_caller_identity.actual.account_id
  particion = data.aws_partition.actual.partition
  region    = data.aws_region.actual.region
}

# Identity Center crea el rol de emergencia con sufijo aleatorio. Con la instancia multirregión el rol
# vive en /aws-reserved/sso.amazonaws.com/us-east-2/ y EKS solo lo acepta con la ruta completa.
data "aws_iam_roles" "emergencia" {
  name_regex  = "AWSReservedSSO_emergencia_.*"
  path_prefix = "/aws-reserved/sso.amazonaws.com/"
}

locals {
  # Argo CD administrado despliega en el propio clúster con el rol de su capacidad.
  admins = toset(concat(
    var.admins,
    tolist(data.aws_iam_roles.emergencia.arns),
    var.argocd == null ? [] : ["arn:${local.particion}:iam::${local.cuenta}:role/eks-${var.nombre}-argocd"],
  ))
}

# --- Llave de los secretos de Kubernetes

data "aws_iam_policy_document" "llave" {
  #checkov:skip=CKV_AWS_109:Política de llave: el root de la cuenta administra la llave, patrón por omisión de KMS.
  #checkov:skip=CKV_AWS_111:Política de llave: el recurso es la propia llave.
  #checkov:skip=CKV_AWS_356:Política de llave: el recurso es la propia llave.
  statement {
    sid       = "Cuenta"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${local.particion}:iam::${local.cuenta}:root"]
    }
  }
}

resource "aws_kms_key" "secretos" {
  description             = "Secretos de Kubernetes de ${var.nombre}"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.llave.json
}

resource "aws_kms_alias" "secretos" {
  name          = "alias/eks-${var.nombre}"
  target_key_id = aws_kms_key.secretos.key_id
}

# --- Plano de control

data "aws_iam_policy_document" "confianza_eks" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  name                 = "eks-${var.nombre}-cluster"
  assume_role_policy   = data.aws_iam_policy_document.confianza_eks.json
  permissions_boundary = var.limite_arn
}

resource "aws_iam_role_policy_attachment" "cluster" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:${local.particion}:iam::aws:policy/AmazonEKSClusterPolicy"
}

resource "aws_cloudwatch_log_group" "cluster" {
  #checkov:skip=CKV_AWS_158:Logs del plano de control con la llave administrada de CloudWatch; una CMK más no agrega control aquí.
  #checkov:skip=CKV_AWS_338:Auditoría de noprod: 90 días bastan; producción los manda a S3 (§3.7).
  name              = "/aws/eks/${var.nombre}/cluster"
  retention_in_days = 90
}

resource "aws_eks_cluster" "this" {
  #checkov:skip=CKV_AWS_39:El endpoint público va autenticado por IAM y access entries; los runners de GitHub no tienen IP fija.
  #checkov:skip=CKV_AWS_38:Ver CKV_AWS_39: la lista de CIDR es variable y en producción se cierra.
  #checkov:skip=CKV_AWS_339:1.36 es la versión por omisión de EKS en mx-central-1 (describe-cluster-versions); checkov aún no la lista.
  name     = var.nombre
  version  = var.version_k8s
  role_arn = aws_iam_role.cluster.arn

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = false
  }

  vpc_config {
    subnet_ids              = var.subredes
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.acceso_publico_cidrs
  }

  encryption_config {
    resources = ["secrets"]
    provider {
      key_arn = aws_kms_key.secretos.arn
    }
  }

  upgrade_policy {
    support_type = "STANDARD"
  }

  zonal_shift_config {
    enabled = true
  }

  depends_on = [aws_iam_role_policy_attachment.cluster, aws_cloudwatch_log_group.cluster]
}

resource "aws_eks_access_entry" "admin" {
  for_each      = local.admins
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value
}

resource "aws_eks_access_entry" "lector" {
  for_each      = toset(var.lectores)
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value
}

resource "aws_eks_access_policy_association" "lector" {
  for_each      = toset(var.lectores)
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value
  policy_arn    = "arn:${local.particion}:eks::aws:cluster-access-policy/AmazonEKSAdminViewPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.lector]
}

resource "aws_eks_access_policy_association" "admin" {
  for_each      = local.admins
  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value
  policy_arn    = "arn:${local.particion}:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.admin]
}

# --- Nodos: un rol para el node group de sistema y otro para los de Karpenter

data "aws_iam_policy_document" "confianza_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

locals {
  politicas_nodo = [
    "AmazonEKSWorkerNodePolicy",
    "AmazonEKS_CNI_Policy",
    "AmazonEC2ContainerRegistryPullOnly",
    "AmazonSSMManagedInstanceCore",
  ]
  roles_nodo = { sistema = "eks-${var.nombre}-sistema", karpenter = "eks-${var.nombre}-karpenter-nodo" }
}

resource "aws_iam_role" "nodo" {
  for_each             = local.roles_nodo
  name                 = each.value
  assume_role_policy   = data.aws_iam_policy_document.confianza_ec2.json
  permissions_boundary = var.limite_arn
}

resource "aws_iam_role_policy_attachment" "nodo" {
  for_each = merge([
    for r in keys(local.roles_nodo) : { for p in local.politicas_nodo : "${r}|${p}" => { rol = r, politica = p } }
  ]...)
  role       = aws_iam_role.nodo[each.value.rol].name
  policy_arn = "arn:${local.particion}:iam::aws:policy/${each.value.politica}"
}

resource "aws_launch_template" "sistema" {
  name                   = "eks-${var.nombre}-sistema"
  update_default_version = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 40
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.nombre}-sistema" }
  }
}

resource "aws_eks_node_group" "sistema" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "sistema"
  node_role_arn   = aws_iam_role.nodo["sistema"].arn
  subnet_ids      = var.subredes
  ami_type        = "AL2023_ARM_64_STANDARD"
  release_version = var.ami_sistema
  instance_types  = var.sistema.tipos
  capacity_type   = "ON_DEMAND"

  launch_template {
    id      = aws_launch_template.sistema.id
    version = aws_launch_template.sistema.latest_version
  }

  scaling_config {
    min_size     = var.sistema.minimo
    desired_size = var.sistema.deseado
    max_size     = var.sistema.maximo
  }

  update_config {
    max_unavailable = 1
  }

  labels = { "dimia.mx/pool" = "sistema" }

  depends_on = [aws_iam_role_policy_attachment.nodo]
}

# --- Add-ons. El CNI usa el rol del nodo; el driver de EBS, Pod Identity.

data "aws_iam_policy_document" "confianza_pod" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ebs_csi" {
  name                 = "eks-${var.nombre}-ebs-csi"
  assume_role_policy   = data.aws_iam_policy_document.confianza_pod.json
  permissions_boundary = var.limite_arn
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:${local.particion}:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_addon" "previo" {
  for_each                    = { for k, v in var.addons : k => v if contains(["vpc-cni", "kube-proxy", "eks-pod-identity-agent"], k) }
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.key
  addon_version               = each.value
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

resource "aws_eks_addon" "con_nodos" {
  for_each                    = { for k, v in var.addons : k => v if !contains(["vpc-cni", "kube-proxy", "eks-pod-identity-agent"], k) }
  cluster_name                = aws_eks_cluster.this.name
  addon_name                  = each.key
  addon_version               = each.value
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  dynamic "pod_identity_association" {
    for_each = each.key == "aws-ebs-csi-driver" ? [1] : []
    content {
      role_arn        = aws_iam_role.ebs_csi.arn
      service_account = "ebs-csi-controller-sa"
    }
  }

  depends_on = [aws_eks_node_group.sistema, aws_eks_addon.previo]
}
