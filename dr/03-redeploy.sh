#!/usr/bin/env bash
# STEP 3: RESTORE SERVICE. Put the last known-good application image on the fresh VM and verify.
# Usage: ./dr/03-redeploy.sh production [image-tag]      (tag defaults to the newest in the registry)
set -euo pipefail
ENV="${1:?usage: 03-redeploy.sh <staging|production> [tag]}"
RG="rg-laundry-${ENV}"; VM="vm-laundry-${ENV}"
ACR="${ACR_NAME:?export ACR_NAME=<your registry name> first}"
TAG="${2:-$(az acr repository show-tags -n "$ACR" --repository laundryflow --orderby time_desc --top 1 -o tsv)}"
echo "==> Deploying image tag: $TAG"
OUT=$(az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript \
  --scripts "cloud-init status --wait >/dev/null 2>&1 || true; /opt/laundryflow/deploy.sh $TAG" \
  --query "value[0].message" -o tsv)
echo "$OUT"; echo "$OUT" | grep -q "DEPLOY_OK $TAG"
FQDN=$(az network public-ip show -g "$RG" -n "pip-laundry-${ENV}" --query dnsSettings.fqdn -o tsv)
"$(dirname "$0")/../scripts/smoke.sh" "https://$FQDN" "$TAG"
echo "==> SERVICE RESTORED. Now work through docs/06-disaster-recovery.md 'After recovery' checklist."
