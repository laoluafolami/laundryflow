terraform {
  required_version = ">= 1.6"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 3.116" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
    time    = { source = "hashicorp/time", version = "~> 0.12" }
  }
  backend "azurerm" { key = "staging.tfstate" } # the rest comes from ../../backend.hcl
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = true
    }
  }
}

variable "project" {
  type    = string
  default = "laundry"
}
variable "location" {
  type    = string
  default = "westeurope"
}
variable "admin_ssh_public_key" { type = string }
variable "admin_cidr" {
  type    = string
  default = ""
}
variable "alert_email" { type = string }
variable "acr_name" { type = string }

module "platform" {
  source               = "../../modules/platform"
  project              = var.project
  env                  = "staging"
  location             = var.location
  vnet_cidr            = "10.20.0.0/16"
  vm_size              = "Standard_B2s"
  admin_ssh_public_key = var.admin_ssh_public_key
  admin_cidr           = var.admin_cidr
  alert_email          = var.alert_email
  acr_name             = var.acr_name
  acr_resource_group   = "rg-${var.project}-shared"
}

output "resource_group" { value = module.platform.resource_group }
output "vm_name" { value = module.platform.vm_name }
output "url" { value = module.platform.url }
output "fqdn" { value = module.platform.fqdn }
output "key_vault_name" { value = module.platform.key_vault_name }
output "db_server_name" { value = module.platform.db_server_name }
