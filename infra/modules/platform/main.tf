data "azurerm_client_config" "current" {}

data "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = var.acr_resource_group
}

locals {
  name = "${var.project}-${var.env}"
  tags = { project = var.project, environment = var.env, managed_by = "terraform" }
}

resource "random_string" "suffix" {
  length  = 4
  upper   = false
  special = false
}

resource "azurerm_resource_group" "rg" {
  name     = "rg-${local.name}"
  location = var.location
  tags     = local.tags
}

# ------------------------------------------------------------------ Network
resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-${local.name}"
  address_space       = [var.vnet_cidr]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.tags
}

resource "azurerm_subnet" "vm" {
  name                 = "snet-vm"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 8, 1)]
}

resource "azurerm_subnet" "db" {
  name                 = "snet-db"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 8, 2)]
  delegation {
    name = "postgres"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_network_security_group" "vm" {
  name                = "nsg-${local.name}-vm"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.tags

  security_rule {
    name                       = "allow-web"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["80", "443"]
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }

  dynamic "security_rule" {
    for_each = var.admin_cidr == "" ? [] : [var.admin_cidr]
    content {
      name                       = "allow-ssh-admin"
      priority                   = 110
      direction                  = "Inbound"
      access                     = "Allow"
      protocol                   = "Tcp"
      source_port_range          = "*"
      destination_port_range     = "22"
      source_address_prefix      = security_rule.value
      destination_address_prefix = "*"
    }
  }
}

resource "azurerm_subnet_network_security_group_association" "vm" {
  subnet_id                 = azurerm_subnet.vm.id
  network_security_group_id = azurerm_network_security_group.vm.id
}

# ------------------------------------------------------------------ Database (managed PostgreSQL, private only)
resource "azurerm_private_dns_zone" "pg" {
  name                = "${local.name}.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "pg" {
  name                  = "pg-dns-link"
  resource_group_name   = azurerm_resource_group.rg.name
  private_dns_zone_name = azurerm_private_dns_zone.pg.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "pg" {
  name                          = "psql-${local.name}-${random_string.suffix.result}"
  resource_group_name           = azurerm_resource_group.rg.name
  location                      = azurerm_resource_group.rg.location
  version                       = "16"
  delegated_subnet_id           = azurerm_subnet.db.id
  private_dns_zone_id           = azurerm_private_dns_zone.pg.id
  public_network_access_enabled = false
  administrator_login           = "laundryadmin"
  administrator_password        = random_password.db.result
  sku_name                      = var.db_sku
  storage_mb                    = 32768
  backup_retention_days         = 7
  tags                          = local.tags
  depends_on                    = [azurerm_private_dns_zone_virtual_network_link.pg]

  lifecycle {
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = "laundry"
  server_id = azurerm_postgresql_flexible_server.pg.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# ------------------------------------------------------------------ Secrets (Key Vault)
resource "azurerm_key_vault" "kv" {
  name                       = "kv-${var.project}-${var.env}-${random_string.suffix.result}"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  enable_rbac_authorization  = true
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  tags                       = local.tags
}

resource "azurerm_role_assignment" "kv_terraform" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# RBAC takes a moment to propagate; without this the first apply can fail with 403.
resource "time_sleep" "rbac" {
  depends_on      = [azurerm_role_assignment.kv_terraform]
  create_duration = "60s"
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}
resource "random_password" "admin" {
  length  = 20
  special = false
}

locals {
  secrets = {
    "database-url"                  = "postgresql://laundryadmin:${random_password.db.result}@${azurerm_postgresql_flexible_server.pg.fqdn}:5432/${azurerm_postgresql_flexible_server_database.app.name}"
    "jwt-secret"                    = random_password.jwt.result
    "admin-password"                = random_password.admin.result
    "appinsights-connection-string" = azurerm_application_insights.ai.connection_string
  }
}

resource "azurerm_key_vault_secret" "s" {
  for_each     = nonsensitive(toset(keys(local.secrets)))
  name         = each.key
  value        = local.secrets[each.key]
  key_vault_id = azurerm_key_vault.kv.id
  depends_on   = [time_sleep.rbac]
}

# ------------------------------------------------------------------ Compute (the VM)
resource "azurerm_public_ip" "ip" {
  name                = "pip-${local.name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
  domain_name_label   = "${var.project}-${var.env}-${random_string.suffix.result}"
  tags                = local.tags
}

resource "azurerm_network_interface" "nic" {
  name                = "nic-${local.name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.tags
  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.vm.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.ip.id
  }
}

resource "azurerm_linux_virtual_machine" "vm" {
  name                            = "vm-${local.name}"
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  size                            = var.vm_size
  admin_username                  = "azureuser"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.nic.id]
  tags                            = local.tags

  admin_ssh_key {
    username   = "azureuser"
    public_key = var.admin_ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = 64
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  identity {
    type = "SystemAssigned" # the VM's own passwordless identity
  }

  # Everything the VM needs is described in this file => a replacement VM is identical. (Disaster recovery!)
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    acr_name        = var.acr_name
    kv_name         = azurerm_key_vault.kv.name
    app_name        = var.app_name
    domain          = azurerm_public_ip.ip.fqdn
    deploy_sh_b64   = filebase64("${path.module}/files/deploy.sh")
    rollback_sh_b64 = filebase64("${path.module}/files/rollback.sh")
  }))

  boot_diagnostics {}
}

resource "azurerm_role_assignment" "vm_kv" {
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_linux_virtual_machine.vm.identity[0].principal_id
}

resource "azurerm_role_assignment" "vm_acr" {
  scope                = data.azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_virtual_machine.vm.identity[0].principal_id
}
