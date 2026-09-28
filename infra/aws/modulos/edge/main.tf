# Borde (§2.2): CloudFront con origen VPC hacia el ALB interno; el ALB nunca queda en internet.
# Cada servicio tiene su distribución y su dominio *.cloudfront.net. El dominio propio va en dos pasos
# porque el DNS de dimia.mx vive fuera de AWS: con `dominios` se pide el certificado y la salida
# `registros_dns` dice qué pegar; con `dominios_activos = true` (ya validado) entran alias y WAF.

data "aws_lb" "this" {
  name = var.alb_nombre
}

# La política declarativa de EC2 bloquea el acceso público de la VPC; CloudFront con origen VPC exige
# una exclusión bidireccional en las subredes del ALB. El ALB es interno: sin IP pública no queda expuesto.
resource "aws_vpc_block_public_access_exclusion" "alb" {
  for_each                        = data.aws_lb.this.subnets
  subnet_id                       = each.value
  internet_gateway_exclusion_mode = "allow-bidirectional"
}

resource "aws_cloudfront_vpc_origin" "this" {
  depends_on = [aws_vpc_block_public_access_exclusion.alb]

  vpc_origin_endpoint_config {
    name                   = var.alb_nombre
    arn                    = data.aws_lb.this.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

data "aws_cloudfront_cache_policy" "sin_cache" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "todo" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "this" {
  #checkov:skip=CKV_AWS_68:WAF llega con el dominio propio; staging no tiene tráfico público.
  #checkov:skip=CKV_AWS_86:Logs de acceso de CloudFront llegan con el bucket de logs del borde (fase 5).
  #checkov:skip=CKV_AWS_174:El certificado por omisión de *.cloudfront.net ya exige TLS 1.2; con ACM propio se fija la política.
  #checkov:skip=CKV_AWS_305:El origen es la app (Next.js y FastAPI), no un bucket: no hay objeto raíz.
  #checkov:skip=CKV_AWS_310:Un solo origen: el ALB interno; no hay grupo de failover en staging.
  #checkov:skip=CKV_AWS_374:Sin restricción geográfica: la app atiende clientes fuera de México también.
  #checkov:skip=CKV2_AWS_32:Los encabezados de seguridad los pone la app (next.config.mjs, FastAPI).
  #checkov:skip=CKV2_AWS_42:Dominio propio con ACM llega cuando dimia.mx se administre desde Route 53.
  #checkov:skip=CKV2_AWS_47:WAF llega con el dominio propio (ver CKV_AWS_68).
  for_each        = var.servicios
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${var.nombre} ${each.key}"
  price_class     = "PriceClass_All"

  origin {
    origin_id   = "alb"
    domain_name = data.aws_lb.this.dns_name

    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.this.id
    }

    custom_header {
      name  = "X-Dimia-Servicio"
      value = each.key
    }
  }

  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.sin_cache.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.todo.id
    compress                 = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  aliases    = local.activo && contains(keys(var.dominios), each.key) ? [var.dominios[each.key]] : []
  web_acl_id = local.activo ? aws_wafv2_web_acl.this[0].arn : null

  viewer_certificate {
    cloudfront_default_certificate = !local.activo
    acm_certificate_arn            = local.activo ? aws_acm_certificate.this[0].arn : null
    ssl_support_method             = local.activo ? "sni-only" : null
    minimum_protocol_version       = local.activo ? "TLSv1.2_2021" : null
  }
}

locals {
  activo = var.dominios_activos && length(var.dominios) > 0
}

# CloudFront solo acepta certificados de us-east-1. Uno solo con todos los nombres.
resource "aws_acm_certificate" "this" {
  count                     = length(var.dominios) > 0 ? 1 : 0
  provider                  = aws.us_east_1
  domain_name               = values(var.dominios)[0]
  subject_alternative_names = slice(values(var.dominios), 1, length(var.dominios))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Reglas administradas de AWS. El límite de tamaño del cuerpo (8 KB) solo cuenta: el panel sube
# archivos y los webhooks de Meta pueden rebasarlo.
resource "aws_wafv2_web_acl" "this" {
  #checkov:skip=CKV2_AWS_31:Los logs de WAF llegan con el bucket de logs del borde (fase 5).
  count    = local.activo ? 1 : 0
  provider = aws.us_east_1
  name     = "${var.nombre}-borde"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "comunes"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "comunes"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "entradas-maliciosas"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "entradas-maliciosas"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "reputacion-ip"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "reputacion-ip"
      sampled_requests_enabled   = true
    }
  }

  # ponytail: tope por IP fijo; si un cliente legítimo lo alcanza, subirlo o excluir su ruta.
  rule {
    name     = "tope-por-ip"
    priority = 4
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "tope-por-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.nombre}-borde"
    sampled_requests_enabled   = true
  }
}

# Lo que hay que pegar en el DNS de dimia.mx: primero la validación, luego los CNAME.
output "registros_dns" {
  value = {
    validacion = length(var.dominios) > 0 ? { for o in aws_acm_certificate.this[0].domain_validation_options : o.resource_record_name => o.resource_record_value } : {}
    cname      = { for k, d in var.dominios : d => aws_cloudfront_distribution.this[k].domain_name }
  }
}

output "urls" {
  value = { for k, d in aws_cloudfront_distribution.this : k => "https://${d.domain_name}" }
}
