#!/usr/bin/env bash
# STEP 2: REBUILD. Throw the compromised VM away and let Terraform build an identical clean one,
# rotating every secret on the way (we assume the attacker saw them).
# Needs: az login, terraform, and infra/envs/<env>/terraform.tfvars (or TF_VAR_* variables).
# Usage: ./dr/02-rebuild.sh production
set -euo pipefail
ENV="${1:?usage: 02-rebuild.sh <staging|production>}"
DIR=$([ "$ENV" = production ] && echo prod || echo staging)
RG="rg-laundry-${ENV}"; VM="vm-laundry-${ENV}"; NIC="nic-laundry-${ENV}"

echo "==> Deleting the compromised VM (the evidence snapshot from step 1 is kept)"
az vm delete -g "$RG" -n "$VM" --yes
echo "==> Detaching the quarantine rules so the NEW VM can reach the internet during first boot"
az network nic update -g "$RG" -n "$NIC" --remove networkSecurityGroup --output none

cd "$(dirname "$0")/../infra/envs/${DIR}"
terraform init -input=false -backend-config=../../backend.hcl
# Terraform notices the VM is gone and creates it again from the same code (cloud-init + scripts).
# -replace on the three random_password resources rotates DB password, JWT key and admin password.
terraform apply -auto-approve -input=false \
  -replace=module.platform.random_password.db \
  -replace=module.platform.random_password.jwt \
  -replace=module.platform.random_password.admin

echo "==> New VM created. Next: ./dr/03-redeploy.sh $ENV [image-tag]"
