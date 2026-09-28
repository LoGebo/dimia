output "nombre" {
  value = aws_eks_cluster.this.name
}

output "endpoint" {
  value = aws_eks_cluster.this.endpoint
}

output "ca" {
  value = aws_eks_cluster.this.certificate_authority[0].data
}

output "rol_nodo_karpenter" {
  description = "Va en el EC2NodeClass (spec.role)."
  value       = aws_iam_role.nodo["karpenter"].name
}

output "sg_cluster" {
  value = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "argocd_url" {
  value = var.argocd == null ? null : aws_eks_capability.argocd[0].configuration[0].argo_cd[0].server_url
}
