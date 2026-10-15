# LaundryFlow: a hands-on DevOps / SRE practice project on Azure

You will build, ship, monitor and *recover* a real web app, using the same ideas the
**Expert Listing take-home challenge** tests:

| Challenge part | What you practise here |
|---|---|
| **A**: replace "SSH in and `git pull`" with CI/CD + Infrastructure-as-Code, no downtime | Modules 2, 3, 4, 5 |
| **B**: 2am incident, search failing for ~20% of requests | Module 5 (fault-injection drill) |
| **C**: 5x traffic spike next month | Module 7 |
| Incident response / "turn outages into permanent fixes" | Module 6 (compromised VM) |

## What you get

```
laundryflow/
├── backend/            Node.js + Express API, PostgreSQL, tests, SQL migrations
├── frontend/           React + Vite + Tailwind (login, dashboard, orders, customers)
├── Dockerfile          one image containing API + built website
├── docker-compose.yml  local Postgres + app in one command
├── infra/              Terraform: bootstrap script, shared registry, platform module, staging/prod
├── .github/workflows/  CI/CD (test, security scans, build, staging, approval, production, rollback)
├── dr/                 disaster-recovery scripts (isolate, rebuild, redeploy)
├── scripts/smoke.sh    post-deploy health check
└── docs/               THE GUIDE: read these in order
```

## Architecture

```
 Developer ── git push ──► GitHub ──► Actions: test → scan → build image ──► Azure Container Registry
                                                              │
                         staging (auto) ──► smoke test ──► ✋ human approval ──► production ──► smoke test
                                                              │ (az vm run-command, no SSH)         └─ auto-rollback on failure
 Users ──HTTPS──► Caddy (auto TLS) ──► app-blue | app-green (Docker, blue/green) ──► Azure PostgreSQL (private)
                        VM + managed identity ──► Key Vault (secrets)        Azure Monitor + App Insights ──► email alerts
```

## The guide (do it in this order)

| # | File | You will |
|---|---|---|
| 0 | `docs/00-prerequisites.md` | install tools, create accounts |
| 1 | `docs/01-build-the-app.md` | run and understand the laundry app locally |
| 2 | `docs/02-deploy-to-azure-manually.md` | deploy the "old way" once, feel the pain (this *is* the challenge's starting point) |
| 3 | `docs/03-terraform-infrastructure.md` | provision everything as code |
| 4 | `docs/04-cicd-devsecops.md` | GitHub Actions pipeline with security scans + approval gate |
| 5 | `docs/05-monitoring-and-zero-downtime.md` | monitoring from scratch, zero-downtime deploys, incident drill |
| 6 | `docs/06-disaster-recovery.md` | VM compromised → clean recovery with minimal downtime |
| 7 | `docs/07-challenge-answers.md` | turn what you learned into your Part A/B/C answers |

## Money and cleanup

Running staging + production (two VMs, two managed databases) costs real money. Set a budget alert first
(Azure portal → *Cost Management* → *Budgets*). When you finish a session:

```bash
cd infra/envs/prod    && terraform destroy
cd ../staging         && terraform destroy
cd ../../shared       && terraform destroy
```

## Honest limits

* I tested the API (automated tests against real PostgreSQL), the production frontend build, the deploy
  scripts' syntax, and the workflow YAML syntax. I could **not** run `terraform validate/apply` or the
  pipeline against a real Azure subscription from here, so expect to fix the odd typo or provider-version
  detail on first run. The guide tells you where to look. That debugging is part of the learning.
