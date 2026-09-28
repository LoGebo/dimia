terraform {
  required_version = "1.12.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.66.0"
    }
  }

  # Configuración común en infra/aws/estado.hcl (-backend-config).
  backend "s3" {
    key = "celdas/c01/global/edge.tfstate"
  }

  # Estado y planes cifrados del lado del cliente: sin la llave no se escribe nada en claro.
  encryption {
    key_provider "aws_kms" "estado" {
      kms_key_id = var.llave_estado_arn
      region     = "us-east-2"
      key_spec   = "AES_256"
    }

    method "aes_gcm" "estado" {
      keys = key_provider.aws_kms.estado
    }

    state {
      method   = method.aes_gcm.estado
      enforced = true
    }

    plan {
      method   = method.aes_gcm.estado
      enforced = true
    }
  }
}

provider "aws" {
  region = "mx-central-1"

  # Las subredes llevan etiquetas que pone la pila de EKS (descubrimiento de Karpenter y del LB).
  ignore_tags {
    key_prefixes = ["karpenter.sh/", "kubernetes.io/"]
  }

  default_tags {
    tags = {
      "dimia:componente" = "edge"
      "dimia:entorno"    = "prod"
    }
  }
}

# CloudFront solo toma certificados y WAF de us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      "dimia:componente" = "edge"
      "dimia:entorno"    = "prod"
    }
  }
}
