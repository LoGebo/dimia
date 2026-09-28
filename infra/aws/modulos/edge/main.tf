# Borde (§2.2): CloudFront con origen VPC hacia el ALB interno; el ALB nunca queda en internet.
# Cada servicio tiene su distribución y su dominio *.cloudfront.net; el dominio propio (ACM en
# us-east-1) y WAF se agregan cuando el DNS de dimia.mx se administre desde aquí.

data "aws_lb" "this" {
  name = var.alb_nombre
}

resource "aws_cloudfront_vpc_origin" "this" {
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

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "urls" {
  value = { for k, d in aws_cloudfront_distribution.this : k => "https://${d.domain_name}" }
}
