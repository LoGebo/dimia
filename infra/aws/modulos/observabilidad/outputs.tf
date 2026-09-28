output "remote_write_url" {
  value = "${aws_prometheus_workspace.this.prometheus_endpoint}api/v1/remote_write"
}

output "workspace_arn" {
  value = aws_prometheus_workspace.this.arn
}
