terraform {
  required_version = ">= 1.12.6, < 1.13.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.66.0, < 7.0.0"
    }
  }
}
