# Permisos de la plataforma del clúster (§3.5): los charts los instala Argo CD desde
# despliegues/plataforma; aquí solo van sus roles por Pod Identity y la capacidad de Argo CD.

locals {
  pod_identity = {
    lb = {
      namespace       = "kube-system"
      service_account = "aws-load-balancer-controller"
      politica        = file("${path.module}/../../politicas/iam/aws-load-balancer-controller.json")
    }
    external_secrets = {
      namespace       = "external-secrets"
      service_account = "external-secrets"
      politica        = data.aws_iam_policy_document.external_secrets.json
    }
  }
}

data "aws_iam_policy_document" "external_secrets" {
  statement {
    sid       = "LeerSecretosDelEntorno"
    actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret", "secretsmanager:ListSecretVersionIds"]
    resources = ["arn:${local.particion}:secretsmanager:${local.region}:${local.cuenta}:secret:${var.prefijo_secretos}*"]
  }

  statement {
    sid       = "DescifrarConLasLlavesDeLaCuenta"
    actions   = ["kms:Decrypt"]
    resources = ["arn:${local.particion}:kms:${local.region}:${local.cuenta}:key/*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${local.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "plataforma" {
  for_each             = local.pod_identity
  name                 = "eks-${var.nombre}-${replace(each.key, "_", "-")}"
  assume_role_policy   = data.aws_iam_policy_document.confianza_pod.json
  permissions_boundary = var.limite_arn
}

resource "aws_iam_role_policy" "plataforma" {
  for_each = local.pod_identity
  name     = each.key
  role     = aws_iam_role.plataforma[each.key].id
  policy   = each.value.politica
}

resource "aws_eks_pod_identity_association" "plataforma" {
  for_each        = local.pod_identity
  cluster_name    = aws_eks_cluster.this.name
  namespace       = each.value.namespace
  service_account = each.value.service_account
  role_arn        = aws_iam_role.plataforma[each.key].arn
}

# --- Argo CD administrado: corre fuera de los nodos; el rol solo le deja leer su repositorio.

data "aws_iam_policy_document" "confianza_capacidad" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]
    principals {
      type        = "Service"
      identifiers = ["capabilities.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "argocd" {
  count                = var.argocd == null ? 0 : 1
  name                 = "eks-${var.nombre}-argocd"
  assume_role_policy   = data.aws_iam_policy_document.confianza_capacidad.json
  permissions_boundary = var.limite_arn
}

resource "aws_eks_capability" "argocd" {
  count                     = var.argocd == null ? 0 : 1
  cluster_name              = aws_eks_cluster.this.name
  capability_name           = "argocd"
  type                      = "ARGOCD"
  role_arn                  = aws_iam_role.argocd[0].arn
  delete_propagation_policy = "RETAIN"

  configuration {
    argo_cd {
      namespace = "argocd"
      aws_idc {
        idc_instance_arn = var.argocd.idc_instancia_arn
        idc_region       = var.argocd.idc_region
      }
      rbac_role_mapping {
        role = "ADMIN"
        identity {
          id   = var.argocd.grupo_admin_id
          type = "SSO_GROUP"
        }
      }
    }
  }

  depends_on = [aws_eks_addon.con_nodos]
}
