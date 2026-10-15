# ------------------------------------------------------------------ Observability
resource "azurerm_log_analytics_workspace" "law" {
  name                = "log-${local.name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "ai" {
  name                = "appi-${local.name}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  workspace_id        = azurerm_log_analytics_workspace.law.id
  application_type    = "web"
  tags                = local.tags
}

# Audit who reads secrets (valuable evidence if something is ever compromised)
resource "azurerm_monitor_diagnostic_setting" "kv" {
  name                       = "kv-audit"
  target_resource_id         = azurerm_key_vault.kv.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.law.id
  enabled_log {
    category = "AuditEvent"
  }
}

resource "azurerm_monitor_action_group" "oncall" {
  name                = "ag-${local.name}-oncall"
  resource_group_name = azurerm_resource_group.rg.name
  short_name          = "laundry"
  email_receiver {
    name                    = "primary"
    email_address           = var.alert_email
    use_common_alert_schema = true
  }
  tags = local.tags
}

# 1) Synthetic check: Azure probes /readyz from 3 regions every 5 minutes
resource "azurerm_application_insights_standard_web_test" "ready" {
  name                    = "webtest-${local.name}-readyz"
  resource_group_name     = azurerm_resource_group.rg.name
  location                = azurerm_resource_group.rg.location
  application_insights_id = azurerm_application_insights.ai.id
  geo_locations           = ["emea-nl-ams-azr", "emea-gb-db3-azr", "us-va-ash-azr"]
  frequency               = 300
  timeout                 = 30
  enabled                 = true
  retry_enabled           = true
  request {
    url = "https://${azurerm_public_ip.ip.fqdn}/readyz"
  }
  tags = merge(local.tags, { "hidden-link:${azurerm_application_insights.ai.id}" = "Resource" })
}

resource "azurerm_monitor_metric_alert" "availability" {
  name                = "alert-${local.name}-availability"
  resource_group_name = azurerm_resource_group.rg.name
  scopes              = [azurerm_application_insights.ai.id]
  description         = "Site is failing the /readyz probe from multiple regions"
  severity            = 1
  frequency           = "PT5M"
  window_size         = "PT15M"
  criteria {
    metric_namespace = "microsoft.insights/components"
    metric_name      = "availabilityResults/availabilityPercentage"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 90
  }
  action { action_group_id = azurerm_monitor_action_group.oncall.id }
}

# 2) Symptom alert: more than 5% of requests failing (the "20% of searches fail" scenario)
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "errors" {
  name                 = "alert-${local.name}-error-rate"
  resource_group_name  = azurerm_resource_group.rg.name
  location             = azurerm_resource_group.rg.location
  scopes               = [azurerm_application_insights.ai.id]
  severity             = 2
  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"
  description          = "More than 5% of requests failed in the last 5 minutes"
  criteria {
    query                   = <<-KQL
      requests
      | summarize total = count(), failed = countif(success == false)
      | extend rate = todouble(failed) / todouble(total) * 100
      | where total > 10 and rate > 5
    KQL
    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }
  action { action_groups = [azurerm_monitor_action_group.oncall.id] }
  tags = local.tags
}

# 3) Cause alerts: saturation of VM and database
resource "azurerm_monitor_metric_alert" "vm_cpu" {
  name                = "alert-${local.name}-vm-cpu"
  resource_group_name = azurerm_resource_group.rg.name
  scopes              = [azurerm_linux_virtual_machine.vm.id]
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  criteria {
    metric_namespace = "Microsoft.Compute/virtualMachines"
    metric_name      = "Percentage CPU"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }
  action { action_group_id = azurerm_monitor_action_group.oncall.id }
}

resource "azurerm_monitor_metric_alert" "db" {
  for_each            = { cpu_percent = 80, storage_percent = 80, memory_percent = 90 }
  name                = "alert-${local.name}-db-${replace(each.key, "_", "-")}"
  resource_group_name = azurerm_resource_group.rg.name
  scopes              = [azurerm_postgresql_flexible_server.pg.id]
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = each.key
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = each.value
  }
  action { action_group_id = azurerm_monitor_action_group.oncall.id }
}
