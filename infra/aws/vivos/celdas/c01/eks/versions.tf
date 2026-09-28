terraform {
  required_version = "1.12.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.66.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "3.3.0"
    }
  }

  # Configuración común en infra/aws/estado.hcl (-backend-config).
  backend "s3" {
    key = "celdas/c01/mx/eks.tfstate"
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

  default_tags {
    tags = {
      "dimia:componente" = "plataforma"
      "dimia:entorno"    = "prod"
    }
  }
}

provider "aws" {
  alias  = "virginia"
  region = "us-east-1"
}

# El token sale de la CLI en cada llamada: en CI es el rol tofu-apply, a mano el de emergencia.
provider "helm" {
  kubernetes = {
    host                   = module.eks.endpoint
    cluster_ca_certificate = base64decode(module.eks.ca)
    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.nombre, "--region", "mx-central-1"]
    }
  }
}
