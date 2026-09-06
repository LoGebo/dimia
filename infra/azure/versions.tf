# Versiones fijas: la infra se reproduce igual en cualquier máquina.
# El estado arranca local; cuando el equipo crezca se mueve a un backend
# remoto (azurerm con un Storage Account) para trabajar sin pisarse.
terraform {
  required_version = ">= 1.6"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # backend "azurerm" {
  #   resource_group_name  = "dimia-tfstate"
  #   storage_account_name = "dimiatfstate"
  #   container_name       = "tfstate"
  #   key                  = "azure.tfstate"
  # }
}

provider "azurerm" {
  features {}
  # La suscripción se toma de `az login`. Para fijarla:
  # subscription_id = var.subscription_id
}
