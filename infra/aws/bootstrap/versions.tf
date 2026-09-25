terraform {
  required_version = "1.12.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.66.0"
    }
  }

  # Primer apply con estado local; después se descomenta y se corre
  # tofu init -migrate-state -backend-config=../estado.hcl (README, paso 5).
  # backend "s3" {
  #   key = "compartido/use2/bootstrap.tfstate"
  # }
}

# Se aplica en la cuenta compartido, con el rol de acceso de la organización.
provider "aws" {
  region = "us-east-2"
  default_tags {
    tags = { "dimia:componente" = "estado", "dimia:entorno" = "infra" }
  }
}

provider "aws" {
  alias  = "mx"
  region = "mx-central-1"
  default_tags {
    tags = { "dimia:componente" = "estado", "dimia:entorno" = "infra" }
  }
}
