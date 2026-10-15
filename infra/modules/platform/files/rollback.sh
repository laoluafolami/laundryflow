#!/usr/bin/env bash
# Re-deploys the previous image tag. Usage: rollback.sh
set -euo pipefail
cd /opt/laundryflow
PREV=$(cat previous_tag 2>/dev/null || true)
[ -n "$PREV" ] || { echo "no previous_tag recorded - nothing to roll back to"; exit 1; }
echo "Rolling back to $PREV"
./deploy.sh "$PREV"
