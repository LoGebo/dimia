output "tema_avisos_arn" {
  description = "Tema de SNS de costos; sirve también para otras alarmas de la organización."
  value       = aws_sns_topic.avisos.arn
}

output "cur_bucket" {
  value = aws_s3_bucket.cur.id
}
