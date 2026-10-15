# Module 7: Turn the practice into your challenge answers

The challenge says it values **judgement and clarity over polish or length**. Below are *model outlines* based on exactly what you built.
**Rewrite them in your own words** and use your own numbers from the drills: interviewers can tell, and you'll be able to defend every line because you've done it.

---
## Part A: Infrastructure design (CI/CD + IaC, no downtime)

**Principles:** keep it small and boring; fix the biggest risk first (manual SSH deploys); every step reversible; no big-bang migration.

**Target setup (single server stays; process changes):**
* **Source control + CI (GitHub Actions):** on every PR: tests, lint, dependency/secret scans, build a Docker image once, tagged with the commit.
* **Registry:** push the image to a private registry (Azure/ECR/GCR). **Artifact = image, not "latest code".**
* **CD:** staging deploys automatically; production deploys on manual approval; same image promoted unchanged. The server never builds code or pulls git.
* **Zero-downtime deploy:** blue/green (or rolling) containers behind a reverse proxy: start new → wait for health check → switch traffic → drain old → keep old for instant rollback. Smoke test after switch; automatic rollback on failure.
* **IaC (Terraform):** network, firewall, VM, managed DB references, secrets store, monitoring. Remote state with locking. Changes via PR → plan reviewed → apply. First, *import* the existing server and database into state (don't recreate them).
* **Secrets:** move from the server's shell/env files into a secrets manager; CI uses short-lived OIDC credentials.
* **Database changes:** backwards-compatible (expand/contract) migrations so old and new versions can run together.

**Sequence (each step shippable alone, none needs downtime):**
1. *Week 1: Safety net:* snapshot/backup check; add health endpoint + basic uptime alert; write down how a deploy is done today.
2. *Week 1-2: Containerise* the app and run it **beside** the current process on another port. No customer impact.
3. *Week 2-3: CI* (tests + build + push + scans). Still deploy manually using the new image to prove it.
4. *Week 3-4: Reverse proxy + blue/green script;* move traffic with a graceful reload; keep the old setup as fallback for a week.
5. *Week 4-6: CD* to staging, then production with approval; **disable SSH deploys** (close port 22, keyed access only for break-glass).
6. *Week 6-8: Terraform:* import existing resources, then codify the rest (monitoring, secrets); drift check in CI.
7. *Then:* second environment parity, runbooks, DR drill, cost review.

**Risks and mitigations:** unknown config on the hand-built server → audit/document first, bake into IaC; DB migrations breaking old version → expand/contract; team adoption → pair on the first few deploys, keep the pipeline simple.

*(Your evidence: Modules 2-5. Say "I built this end to end and rehearsed the failure modes.")*

---
## Part B: Incident: 2am, search errors ~20%, site up
Write it as ordered steps with the *reason* for each (see Module 5, "The triage order"). Keep it to ~10 lines:
1. **Acknowledge, scope:** which endpoint(s), % errors, since when, any user-visible effect? *Partial degradation, not full outage.*
2. **What changed?** recent deploy/config/flag/traffic. If errors began at a deploy → **roll back now**, investigate in daylight.
3. **Read the actual error** (logs/APM): one error or many? Same stack trace?
4. **Check dependencies:** database (CPU, connections, slow queries, locks), search backend/index, third-party APIs, disk/memory on the server, cloud status page.
5. **Why ~20%?** A fraction usually means *one of N* things is bad: one bad instance/replica, one shard, one query pattern, a cache miss path, a pool exhausted under load, a bad feature-flag cohort. Segment errors by host, endpoint, query, customer.
6. **Mitigate first:** rollback, disable/degrade the search feature gracefully, restart the bad instance, scale. Then root-cause.
7. **Page rule:** I'd escalate if I can't contain it in ~15 min, if impact grows, if data correctness or security is in question, or if I need the owner of the failing component. CTO gets a heads-up for sustained customer impact; sooner for data/security.
8. **Close the loop:** status updates, post-mortem, permanent fix, *and an alert/test that would have caught it earlier* (e.g. per-endpoint error-rate alert, synthetic search check).

---
## Part C: Scaling judgement (a few sentences)
**Do:** *Measure first:* load-test staging to ~2x the expected peak (5x current) to find the **real** bottleneck: likely the database or the unindexed search query, not CPU. Quick wins: add the missing database indexes (e.g. a trigram index for the `ILIKE '%term%'` search), cache hot read paths, serve static assets via CDN, raise DB/VM size **temporarily** for the week (vertical scale is fast, reversible, simple), add a second app instance behind the proxy if the single server is a risk, tune connection pool limits, tighten alert thresholds, and set up a **change freeze** with a rollback plan and a named on-call. Check backups and test a restore before the campaign. Scale back down afterwards to save cost.

**Deliberately not:** no migration to Kubernetes, microservices, a new database engine or multi-region *one month* before a big event: high risk, little payoff for a one-week 5x spike. No complex autoscaling or new tools nobody on the team has operated, and no untested, last-minute architecture changes. *Boring and reversible beats clever.*

---
## How to present your work
* Link your repository and say "I built the whole thing; here is the pipeline run with the approval gate and the DR drill timings."
* Quote your own drill numbers ("recovered staging in 21 minutes; slowest step was VM provisioning, so next I'd bake an image").
* Be honest about limits (single VM, soft Checkov, no WAF yet) and say what you'd do next. **Judgement beats exhaustiveness.**
