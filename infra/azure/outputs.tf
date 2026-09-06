output "resource_group" {
  value = azurerm_resource_group.rg.name
}

output "acr_login_server" {
  description = "A dónde se sube la imagen del motor"
  value       = azurerm_container_registry.acr.login_server
}

output "aks_name" {
  value = azurerm_kubernetes_cluster.aks.name
}

output "pg_fqdn" {
  description = "Host de Postgres (el DSN se arma con el secreto en Key Vault)"
  value       = azurerm_postgresql_flexible_server.pg.fqdn
}

output "servicebus_namespace" {
  value = azurerm_servicebus_namespace.bus.name
}

output "container_app_environment" {
  value = azurerm_container_app_environment.cae.name
}

output "key_vault" {
  value = azurerm_key_vault.kv.name
}
