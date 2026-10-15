#!/usr/bin/env bash
# Usage: smoke.sh https://your-site  expected-version
# Polls /readyz until it reports the expected version, then checks the login page loads.
set -euo pipefail
URL="${1:?url}"; WANT="${2:-}"
for i in $(seq 1 30); do
  BODY=$(curl -fsS --max-time 5 "$URL/readyz" 2>/dev/null || true)
  if echo "$BODY" | grep -q '"status":"ready"' && { [ -z "$WANT" ] || echo "$BODY" | grep -q "\"version\":\"$WANT\""; }; then
    echo "readyz OK: $BODY"
    curl -fsS --max-time 5 -o /dev/null "$URL/" && echo "homepage OK"
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$URL/api/orders")
    [ "$code" = "401" ] && echo "API correctly requires auth (401)" || { echo "expected 401 got $code"; exit 1; }
    exit 0
  fi
  echo "attempt $i: not ready yet ($BODY)"; sleep 5
done
echo "SMOKE TEST FAILED"; exit 1
