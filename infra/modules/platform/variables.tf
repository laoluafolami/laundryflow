variable "project" { type = string }
variable "env" { type = string }
variable "location" { type = string }
variable "app_name" {
  type    = string
  default = "laundryflow"
}
variable "vnet_cidr" {
  type    = string
  default = "10.10.0.0/16"
}
variable "vm_size" {
  type    = string
  default = "Standard_B2s"
}
variable "db_sku" {
  type    = string
  default = "B_Standard_B1ms"
}
variable "admin_ssh_public_key" {
  type        = string
  description = "Public key for emergency SSH. Port 22 stays CLOSED unless admin_cidr is set."
}
variable "admin_cidr" {
  type        = string
  default     = ""
  description = "Your public IP as CIDR (e.g. 203.0.113.7/32) to open SSH. Empty = SSH closed."
}
variable "alert_email" { type = string }
variable "acr_name" { type = string }
variable "acr_resource_group" { type = string }
