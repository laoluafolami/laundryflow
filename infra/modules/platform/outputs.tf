output "resource_group" { value = azurerm_resource_group.rg.name }
output "vm_name" { value = azurerm_linux_virtual_machine.vm.name }
output "public_ip" { value = azurerm_public_ip.ip.ip_address }
output "fqdn" { value = azurerm_public_ip.ip.fqdn }
output "url" { value = "https://${azurerm_public_ip.ip.fqdn}" }
output "key_vault_name" { value = azurerm_key_vault.kv.name }
output "db_server_name" { value = azurerm_postgresql_flexible_server.pg.name }
output "app_insights_name" { value = azurerm_application_insights.ai.name }
