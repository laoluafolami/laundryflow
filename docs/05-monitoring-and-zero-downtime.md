# Module 5: Monitoring, observability and zero-downtime releases

**Goal:** know the site is broken *before a user tells you*, and release without anyone noticing.

## Concepts
* **Monitoring** = watching known signals (is CPU high? is the site up?). **Observability** = being able to answer *new* questions from the data you collect ("why do only searches by phone number fail?").
* **Three data types:** **metrics** (numbers over time: CPU, request rate), **logs** (events: one JSON line per request), **traces** (the path of one request through the system).
* **The four golden signals** (Google SRE): **latency**, **traffic**, **errors**, **saturation** (how "full" CPU/DB/disk is).
* **SLI / SLO / error budget.** SLI = a measurement ("% of requests that succeed"). SLO = the promise ("99.9% per month"). Error budget = what you may fail (0.1% ≈ 43 minutes a month). Spend it deliberately: risky releases when budget is healthy, freeze when it's burnt.
* **Alert on symptoms, investigate causes.** Page a human for *user pain* (error rate, site down), not for every high-CPU blip. Cause alerts (CPU, disk) are early warnings, lower severity.
* **Alert fatigue:** if alerts fire too often people ignore them. Every alert must be actionable.

## What Terraform already built for you (`monitoring.tf`)
| Piece | Purpose |
|---|---|
| **Log Analytics workspace** | central store for logs and metrics (30-day retention) |
| **Application Insights** | the app sends request, failure and timing data (the Node SDK starts when `APPLICATIONINSIGHTS_CONNECTION_STRING` exists) |
| **Availability test** | Azure probes `/readyz` from 3 regions every 5 min (catches "site down", DNS/TLS expiry) |
| **Alert: availability < 90%** | severity 1: the site is down |
| **Alert: >5% requests failing** | severity 2: *the 20%-search-errors scenario* |
| **Alerts: VM CPU, DB CPU/memory/storage** | saturation early-warning |
| **Action group** | emails you (add SMS/Teams/PagerDuty in real life) |
| **Key Vault audit logs → Log Analytics** | who read which secret (forensics, Module 6) |

## Step 1: Confirm alert delivery
Azure portal → *Monitor* → *Alerts* → *Action groups* → `ag-laundry-staging-oncall` → **Test** → pick *Sample type* → **Test**. Check your inbox (and spam).
**An alert that never reached anyone is not an alert.** Always test the path.

## Step 2: Explore the data
Portal → resource group `rg-laundry-staging` → **Application Insights** (`appi-laundry-staging`). Click through: **Live metrics**, **Failures**, **Performance**, **Availability**.
Click **Logs** and run these (KQL: Kusto Query Language):
```kusto
// error rate by endpoint, last 30 minutes
requests
| where timestamp > ago(30m)
| summarize total = count(), failed = countif(success == false) by name
| extend failed_pct = round(100.0 * failed / total, 1)
| order by failed desc
```
```kusto
// p95 latency per 5 minutes
requests | where timestamp > ago(6h)
| summarize p95_ms = percentile(duration, 95) by bin(timestamp, 5m) | render timechart
```
```kusto
// application log lines (our JSON logs); if empty, read them from the VM instead (Step 5)
traces | where timestamp > ago(1h) | order by timestamp desc | take 50
```
Generate some traffic first (log in, click around the staging site).

## Step 3: Incident drill: *"search is failing for 20% of requests"* (challenge Part B)
The app has a **fault-injection switch** (`CHAOS_SEARCH_FAIL_RATE`). Switch it on in **staging**:
```bash
az vm run-command invoke -g rg-laundry-staging -n vm-laundry-staging --command-id RunShellScript \
  --scripts 'echo CHAOS_SEARCH_FAIL_RATE=0.2 > /opt/laundryflow/extra.env; /opt/laundryflow/deploy.sh $(cat /opt/laundryflow/current_tag)' \
  --query "value[0].message" -o tsv
```
Now create traffic like users would (replace URL and password; needs `jq`):
```bash
URL=https://YOUR-STAGING-FQDN ; PASS='the-admin-password'
TOKEN=$(curl -s -X POST $URL/api/auth/login -H 'content-type: application/json' -d "{\"password\":\"$PASS\"}" | jq -r .token)
for i in $(seq 1 300); do
  curl -s -o /dev/null -w "%{http_code}\n" "$URL/api/orders?q=a" -H "Authorization: Bearer $TOKEN"; sleep 0.3
done | sort | uniq -c
```
You should see roughly 80% `200` and 20% `500`, while `/readyz` stays green ("the site itself is up"). **Now pretend you don't know why** and triage like it's 2am. Within ~5-10 minutes the error-rate alert should email you.

### The triage order (rehearse saying this out loud)
1. **Acknowledge and scope (first 2 minutes).** Ack the alert so others know someone is on it. *How bad?* Which endpoint, what percentage, since when, which users? (query above: only `GET /api/orders` with a search term fails; login and order creation are fine → partial degradation, not an outage.)
2. **Check what changed.** Last deploy time and tag (`cat /opt/laundryflow/current_tag`, GitHub Actions run history), config/feature-flag changes, a promo or traffic spike. *Most incidents are caused by a change.* Did the errors start exactly at a deploy? → **roll back first, investigate later.**
3. **Look at the error itself.** Failures blade → the exception text (`simulated search failure`) or `docker logs app-blue` on the VM via run-command. Is it one error message or many?
4. **Check dependencies and saturation.** Database CPU, connections, storage, slow queries; VM CPU/memory/disk; any Azure service health notice (portal → *Service Health*).
5. **Mitigate before you root-cause.** Fastest safe action that stops user pain: rollback (`rollback.sh`), disable the feature/flag, scale up, restart. Write down what you did and when.
6. **Decide whether to page.** Page someone else when: you can't find or contain the cause within ~15 minutes; **customer impact is growing or data may be wrong/lost**; it needs expertise or access you don't have (database owner, the developer of the search code); a security signal appears (Module 6). Page the **CTO** for customer-visible impact beyond ~30 min, data loss, or a security incident. *Over-paging costs sleep; under-paging costs customers; when in doubt about data or security, page.*
7. **Communicate** a short status update every 30 minutes (what we know, what we're doing, next update time).
8. **After:** fix the root cause (not just the symptom), add a test/alert that would have caught it, write a blameless post-mortem.

### Fix the drill
```bash
az vm run-command invoke -g rg-laundry-staging -n vm-laundry-staging --command-id RunShellScript \
  --scripts 'rm -f /opt/laundryflow/extra.env; /opt/laundryflow/deploy.sh $(cat /opt/laundryflow/current_tag)' \
  --query "value[0].message" -o tsv
```
Re-run the traffic loop: all `200`. Notice the fix itself was a zero-downtime blue/green swap.

## Step 4: Total outage drill
```bash
az vm run-command invoke -g rg-laundry-staging -n vm-laundry-staging --command-id RunShellScript \
  --scripts 'docker stop app-blue app-green' --query "value[0].message" -o tsv
```
Watch the site return 502. The availability alert should email you in roughly 5-15 minutes (3 regions × retries).
Fix with the redeploy command above (or `docker start app-blue app-green`).

## Step 5: Read logs on the VM when you need to
```bash
az vm run-command invoke -g rg-laundry-staging -n vm-laundry-staging --command-id RunShellScript \
  --scripts 'docker ps; docker logs --tail 50 app-$(cat /opt/laundryflow/active_color)' --query "value[0].message" -o tsv
```

## Zero-downtime releases: the sequence
This is **Part A's "without downtime"**. The mechanics in `deploy.sh`, in order:

1. **Pull** the new image while the old version keeps serving.
2. **Fetch secrets** from Key Vault (never stored in git).
3. **Start the new colour** (green) on another port next to the old one (blue). Both run at the same time.
4. **Migrate the database** (the new container applies new migrations, with a lock).
5. **Wait for `/readyz`** (needs DB connection). *Not ready in 60 s → abort; the old version never stopped.*
6. **Switch traffic**: Caddy `reload` is graceful; in-flight requests finish.
7. **Drain 10 s, then stop the old colour.** Keep its tag as `previous_tag` for instant rollback.
8. **Smoke test the public URL.** Failure → automatic rollback to the previous tag.

**The rules that make it safe**
* Migrations must be **backwards compatible** (add, don't rename/drop) because old and new code run together. Rename a column in 3 releases: add new → write both → switch reads → (later) drop old.
* Always **graceful shutdown** (`SIGTERM` handler in `index.js`) so no request is cut mid-flight.
* Deploy **small and often**: small changes are easy to understand and roll back.
* **Staging first**, same image, same scripts; approval gate for production.
* **Never deploy during an active incident** unless the deploy *is* the fix.

### Prove it yourself
In one terminal, hammer the production URL while another deploys:
```bash
while true; do curl -s -o /dev/null -w "%{http_code} " https://YOUR-URL/readyz; sleep 0.3; done
```
Merge a small change and approve the deploy. You should see only `200` through the switch. (A single hiccup is possible on a single-VM design; seeing none is the goal, and a second VM + load balancer removes the last risk. See Module 6.)

## SLO exercise (10 minutes)
Write in a note: *SLI*: % of non-5xx responses to `/api/*` over 30 days. *SLO*: 99.5% (≈ 3.6 hours of budget/month). Then answer: which of today's alerts protect this SLO? What's the *next* alert you'd add? (Typical answer: a fast-burn alert on error rate, plus slow-burn on a 6-hour window.)

✅ **Done when:** you received an alert email, resolved both drills, and watched a deployment go through with no failed requests.
