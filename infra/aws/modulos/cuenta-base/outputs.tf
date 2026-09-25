output "tofu_plan_arn" {
  value = aws_iam_role.tofu_plan.arn
}

output "tofu_apply_arn" {
  value = aws_iam_role.tofu_apply.arn
}

output "limite_arn" {
  description = "Límite de permisos que deben llevar los roles que creen otras pilas."
  value       = aws_iam_policy.limite.arn
}
