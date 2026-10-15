terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 3.116" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
  }
  backend "azurerm" { key = "shared.tfstate" } # the rest comes from ../backend.hcl
}

provider "azurerm" {
  features {}
}

variable "project" {
  type    = string
  default = "laundry"
}
variable "location" {
  type    = string
  default = "westeurope"
}

resource "random_string" "acr" {
  length  = 5
  upper   = false
  special = false
}

resource "azurerm_resource_group" "shared" {
  name     = "rg-${var.project}-shared"
  location = var.location
}

# One private registry shared by staging and production. Same image is promoted, never rebuilt.
resource "azurerm_container_registry" "acr" {
  name                = "acr${var.project}${random_string.acr.result}"
  resource_group_name = azurerm_resource_group.shared.name
  location            = azurerm_resource_group.shared.location
  sku                 = "Basic"
  admin_enabled       = false # no shared password; machines use managed identity
}

output "acr_name" { value = azurerm_container_registry.acr.name }
output "acr_login_server" { value = azurerm_container_registry.acr.login_server }
