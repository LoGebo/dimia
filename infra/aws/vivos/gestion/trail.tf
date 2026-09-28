# Trail de organización (§3.7): todas las cuentas y regiones, al bucket inmutable de log-archivo.
# El nombre dimia-org lo esperan la llave y la política del bucket (vivos/log-archivo/logs).
resource "aws_cloudtrail" "org" {
  #checkov:skip=CKV2_AWS_10:La integración con CloudWatch Logs llega con la observabilidad de la fase 2 (AMP/AMG).
  #checkov:skip=CKV_AWS_252:Sin tema SNS: la alerta del uso de emergencia sale de EventBridge (§3.10).
  name                          = "dimia-org"
  s3_bucket_name                = var.trail_bucket
  kms_key_id                    = var.trail_llave_arn
  is_organization_trail         = true
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true
}
