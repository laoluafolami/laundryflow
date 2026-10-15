#!/usr/bin/env bash
# STEP 1 of the disaster-recovery runbook: CONTAIN. Cut the suspect VM off, keep the evidence.
# Usage: ./dr/01-isolate.sh production        (or: staging)
set -euo pipefail
ENV="${1:?usage: 01-isolate.sh <staging|production>}"
RG="rg-laundry-${ENV}"; VM="vm-laundry-${ENV}"; NIC="nic-laundry-${ENV}"; TS=$(date +%Y%m%d-%H%M%S)

echo "==> 1/4 Quarantine network rules (deny ALL in and out) on the VM's network card"
az network nsg create -g "$RG" -n "nsg-quarantine-$TS" --output none
az network nsg rule create -g "$RG" --nsg-name "nsg-quarantine-$TS" -n deny-all-in  --priority 100 \
  --direction Inbound  --access Deny --protocol '*' --source-address-prefixes '*' --source-port-ranges '*' \
  --destination-address-prefixes '*' --destination-port-ranges '*' --output none
az network nsg rule create -g "$RG" --nsg-name "nsg-quarantine-$TS" -n deny-all-out --priority 100 \
  --direction Outbound --access Deny --protocol '*' --source-address-prefixes '*' --source-port-ranges '*' \
  --destination-address-prefixes '*' --destination-port-ranges '*' --output none
az network nic update -g "$RG" -n "$NIC" --network-security-group "nsg-quarantine-$TS" --output none

echo "==> 2/4 Revoke the VM's cloud permissions (an attacker on the VM could ask Azure for secrets as the VM)"
PRINCIPAL=$(az vm show -g "$RG" -n "$VM" --query identity.principalId -o tsv)
az role assignment list --assignee "$PRINCIPAL" --all --query "[].id" -o tsv | xargs -r -n1 az role assignment delete --ids

echo "==> 3/4 Snapshot the OS disk as forensic evidence (read-only copy)"
DISK_ID=$(az vm show -g "$RG" -n "$VM" --query storageProfile.osDisk.managedDisk.id -o tsv)
az snapshot create -g "$RG" -n "snap-forensics-$VM-$TS" --source "$DISK_ID" --tags purpose=forensics --output none

echo "==> 4/4 Record the time (needed for the incident timeline and for DB point-in-time restore)"
echo "ISOLATED_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Next: ./dr/02-rebuild.sh $ENV"
