#!/usr/bin/env bash
# ONE-TIME setup. Creates (1) storage for Terraform state and (2) a passwordless identity
# for GitHub Actions (OIDC). Run in Azure Cloud Shell (bash) or WSL after:  az login
# Usage: GITHUB_REPO="your-user/laundryflow" ./infra/bootstrap/bootstrap.sh
set -euo pipefail
: "${GITHUB_REPO:?set GITHUB_REPO like your-user/laundryflow}"
LOCATION="${LOCATION:-westeurope}"
STATE_RG="rg-laundry-tfstate"
SUB_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
ME=$(az ad signed-in-user show --query id -o tsv)
SA="stlaundrytf$(echo "$SUB_ID" | tr -d '-' | cut -c1-8)"

echo "==> Registering resource providers (one-time, can take a minute)"
for p in Microsoft.Compute Microsoft.Network Microsoft.Storage Microsoft.KeyVault Microsoft.DBforPostgreSQL \
         Microsoft.ContainerRegistry Microsoft.OperationalInsights Microsoft.Insights Microsoft.Authorization; do
  az provider register --namespace "$p" --output none
done

echo "==> Terraform state storage: $SA"
az group create -n "$STATE_RG" -l "$LOCATION" --output none
az storage account create -n "$SA" -g "$STATE_RG" -l "$LOCATION" --sku Standard_LRS \
  --min-tls-version TLS1_2 --allow-blob-public-access false --output none
az storage account blob-service-properties update --account-name "$SA" -g "$STATE_RG" \
  --enable-versioning true --enable-delete-retention true --delete-retention-days 14 --output none
SA_ID=$(az storage account show -n "$SA" -g "$STATE_RG" --query id -o tsv)
az role assignment create --assignee "$ME" --role "Storage Blob Data Contributor" --scope "$SA_ID" --output none || true
sleep 20
az storage container create --account-name "$SA" -n tfstate --auth-mode login --output none

cat > "$(dirname "$0")/../backend.hcl" <<HCL
resource_group_name  = "$STATE_RG"
storage_account_name = "$SA"
container_name       = "tfstate"
use_azuread_auth     = true
HCL
echo "==> wrote infra/backend.hcl (commit this file, it contains no secrets)"

echo "==> GitHub Actions identity (OIDC, no passwords stored anywhere)"
APP_ID=$(az ad app create --display-name "sp-laundryflow-github" --query appId -o tsv)
az ad sp create --id "$APP_ID" --output none || true
SP_OBJ=$(az ad sp show --id "$APP_ID" --query id -o tsv)
for SUBJECT in "ref:refs/heads/main" "pull_request" "environment:staging" "environment:production"; do
  NAME=$(echo "$SUBJECT" | tr ':/' '--')
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"gh-$NAME\", \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:${GITHUB_REPO}:${SUBJECT}\", \"audiences\": [\"api://AzureADTokenExchange\"] }" --output none
done
SCOPE="/subscriptions/$SUB_ID"
for ROLE in "Contributor" "User Access Administrator"; do
  az role assignment create --assignee-object-id "$SP_OBJ" --assignee-principal-type ServicePrincipal \
    --role "$ROLE" --scope "$SCOPE" --output none || true
done
az role assignment create --assignee-object-id "$SP_OBJ" --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" --scope "$SA_ID" --output none || true

cat <<OUT

============ DONE. Add these as GitHub *repository variables* (Settings > Secrets and variables > Actions > Variables) ============
AZURE_CLIENT_ID       = $APP_ID
AZURE_TENANT_ID       = $TENANT_ID
AZURE_SUBSCRIPTION_ID = $SUB_ID
==========================================================================================================================
OUT
