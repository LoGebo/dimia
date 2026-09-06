# Arquitectura Dimia en Azure — el destino del plan (planeacion/arquitectura.md).
# NO se aplica hasta tener créditos + `az login`. Esto codifica la infra para que
# desplegarla sea `terraform apply`, no clics.

locals {
  base = "${var.proyecto}-${var.entorno}"
}

resource "azurerm_resource_group" "rg" {
  name     = "${local.base}-rg"
  location = var.region
  tags     = var.etiquetas
}

# --- Registro de contenedores: aquí vive la imagen del motor ---
resource "azurerm_container_registry" "acr" {
  name                = replace("${local.base}acr", "-", "")
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.etiquetas
}

# --- Observabilidad: workspace para Container Apps y métricas ---
resource "azurerm_log_analytics_workspace" "log" {
  name                = "${local.base}-log"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.etiquetas
}

# --- Kubernetes: los workers de voz. KEDA autoescala por concurrencia ---
resource "azurerm_kubernetes_cluster" "aks" {
  name                = "${local.base}-aks"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  dns_prefix          = local.base

  default_node_pool {
    name                 = "sistema"
    vm_size              = var.aks_node_sku
    auto_scaling_enabled = true
    min_count            = var.aks_node_min
    max_count            = var.aks_node_max
  }

  identity {
    type = "SystemAssigned"
  }

  # KEDA: escalar los workers por eventos (rooms activos / cola), no por CPU.
  workload_autoscaler_profile {
    keda_enabled = true
  }

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.log.id
  }

  tags = var.etiquetas
}

# AKS puede jalar imágenes del ACR sin credenciales manuales.
resource "azurerm_role_assignment" "aks_acr_pull" {
  scope                            = azurerm_container_registry.acr.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id
  skip_service_principal_aad_check = true
}

# --- Base de datos: Postgres Flexible, multi-tenant con RLS ---
resource "random_password" "pg" {
  length           = 24
  special          = true
  override_special = "!#$%*-_"
}

resource "azurerm_postgresql_flexible_server" "pg" {
  name                          = "${local.base}-pg"
  resource_group_name           = azurerm_resource_group.rg.name
  location                      = azurerm_resource_group.rg.location
  version                       = var.pg_version
  administrator_login           = var.pg_admin
  administrator_password        = random_password.pg.result
  sku_name                      = var.pg_sku
  storage_mb                    = var.pg_storage_mb
  public_network_access_enabled = true # apretar a VNet privada al escalar
  zone                          = "1"
  tags                          = var.etiquetas
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "dimia"
  server_id = azurerm_postgresql_flexible_server.pg.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# El secreto de la BD se guarda en Key Vault, no en el estado en claro.
resource "azurerm_key_vault_secret" "pg_password" {
  name         = "pg-admin-password"
  value        = random_password.pg.result
  key_vault_id = azurerm_key_vault.kv.id
}

# --- Colas: salientes, campañas, reintentos ---
resource "azurerm_servicebus_namespace" "bus" {
  name                = "${local.base}-bus"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Standard"
  tags                = var.etiquetas
}

resource "azurerm_servicebus_queue" "salientes" {
  name         = "salientes"
  namespace_id = azurerm_servicebus_namespace.bus.id
}

# --- Container Apps: los webhooks de WhatsApp / IG / Messenger ---
resource "azurerm_container_app_environment" "cae" {
  name                       = "${local.base}-cae"
  resource_group_name        = azurerm_resource_group.rg.name
  location                   = azurerm_resource_group.rg.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.log.id
  tags                       = var.etiquetas
}

# --- Secretos: Key Vault para tokens, claves de modelos, DSN ---
data "azurerm_client_config" "actual" {}

resource "azurerm_key_vault" "kv" {
  name                       = replace("${local.base}-kv", "_", "-")
  resource_group_name        = azurerm_resource_group.rg.name
  location                   = azurerm_resource_group.rg.location
  tenant_id                  = data.azurerm_client_config.actual.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = false
  soft_delete_retention_days = 7
  rbac_authorization_enabled = true
  tags                       = var.etiquetas
}
