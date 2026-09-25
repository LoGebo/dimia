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
    key = "voz/g1/use/red.tfstate"
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
  alias  = "use1"
  region = "us-east-1"

  default_tags {
    tags = {
      "dimia:componente" = "red"
      "dimia:entorno"    = "prod"
    }
  }
}

provider "aws" {
  alias  = "use2"
  region = "us-east-2"

  default_tags {
    tags = {
      "dimia:componente" = "red"
      "dimia:entorno"    = "prod"
    }
  }
}
