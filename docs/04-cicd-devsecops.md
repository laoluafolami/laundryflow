# Module 4: CI/CD with DevSecOps (GitHub Actions)

**Goal:** `git push` is the *only* way code reaches production, and every push is tested, scanned, deployed to staging
automatically, then waits for **your approval** before production, with automatic rollback if it's unhealthy.

## Concepts
* **CI (Continuous Integration):** every change is automatically built and tested.
* **CD (Continuous Delivery/Deployment):** every passing change is automatically *released* (we add a human approval gate for production: that's *delivery*).
* **Build once, promote the same artifact.** The Docker image is built once, tagged with the git commit (`a1b2c3d`), and **the exact same image** goes to staging then production. What you tested is what you ship.
* **DevSecOps / "shift left":** security checks run *early and automatically*, in the pipeline, not as a final audit.
* **Environment:** a GitHub feature: a named target (staging, production) with its own variables and protection rules (required reviewers).
* **Reusable workflow:** `deploy.yml` is written once and called twice (staging, production).

### The security layers in this pipeline
| Layer | Tool | Catches |
|---|---|---|
| Secrets in code | **gitleaks** | passwords/keys accidentally committed (scans history too) |
| Vulnerable libraries (SCA) | **npm audit**, **Dependabot** | known CVEs in dependencies; weekly update PRs |
| Insecure code (SAST) | **CodeQL** | injection, unsafe patterns in our JavaScript |
| Dockerfile mistakes | **hadolint** | bad practices (e.g. unpinned, root) |
| Infrastructure mistakes | **Checkov** (in the infra workflow) | missing encryption, risky network rules in Terraform |
| Vulnerable files & committed secrets | **Trivy fs** | CVEs in lock files, secrets in any file |
| Vulnerable image | **Trivy image scan** | OS-level CVEs in the final container; **blocks the push** |
| Supply chain transparency | **SBOM** (CycloneDX) | an inventory of everything inside the image |
| No stored credentials | **OIDC** to Azure | nothing to steal from GitHub secrets |
| Least privilege at runtime | managed identity, Key Vault, private DB, closed SSH | limits damage if the VM is breached |
| Human control | **required reviewer** on `production` | no unreviewed production change |

## Step 1: GitHub *repository* variables and secret
GitHub → your repo → **Settings → Secrets and variables → Actions**.

**Variables** tab → **New repository variable** (one by one):
| Name | Value |
|---|---|
| `AZURE_CLIENT_ID` | printed by bootstrap |
| `AZURE_TENANT_ID` | printed by bootstrap |
| `AZURE_SUBSCRIPTION_ID` | printed by bootstrap |
| `ACR_NAME` | from `terraform output acr_name` |
| `ALERT_EMAIL` | your email |

**Secrets** tab → **New repository secret**: name `ADMIN_SSH_PUBLIC_KEY`, value = output of `cat ~/.ssh/laundryflow.pub`.

> None of these are passwords. IDs are not secrets; the SSH key is the *public* half.

## Step 2: Environments
**Settings → Environments → New environment**
1. Create **`staging`**: no rules. Under *Environment variables* add:
   `APP_URL` = staging url (e.g. `https://laundry-staging-ab12.westeurope.cloudapp.azure.com`), `AZURE_RG` = `rg-laundry-staging`, `AZURE_VM` = `vm-laundry-staging`.
2. Create **`production`**: tick **Required reviewers** → add yourself → **Save protection rules**. Optionally *Deployment branches → Selected branches → main*.
   Variables are added after production exists (Step 4): `APP_URL`, `AZURE_RG` = `rg-laundry-production`, `AZURE_VM` = `vm-laundry-production`.

**Concept: the approval gate.** When a job names `environment: production`, GitHub *pauses* it and emails reviewers. Nothing
runs until someone clicks **Approve**. That is your "capability to approve into production".

## Step 3: Protect the main branch
**Settings → Branches → Add branch ruleset/rule** for `main`: *Require a pull request before merging*, *Require status checks* (`test`, `security`).
Now nobody (including you) can push untested code straight to main.

## Step 4: First run
1. Push to `main` (if not already): the **infra** workflow starts (Actions tab): `validate` → `apply-shared` → `apply-staging` → `apply-production` (**waiting for approval**: click *Review deployments → production → Approve*). Production infrastructure takes ~15 min.
2. Get production values and fill the `production` environment variables:
   ```bash
   cd infra/envs/prod && cp terraform.tfvars.example terraform.tfvars   # edit the same 3 values
   terraform init -backend-config=../../backend.hcl && terraform output
   ```
3. Open the **app** workflow run → if `deploy-production` failed (variables didn't exist yet), click **Re-run failed jobs**.
4. Watch the stages go green. Staging deploys automatically; production **waits**. Open the staging URL, test it, then approve production.

Login passwords come from each environment's Key Vault (`admin-password`, Module 3 Step 8).

## Step 5: Read the pipeline like an engineer
Open `.github/workflows/app.yml` and follow it:

1. **test**: starts a *real PostgreSQL* beside the job, runs the API tests, builds the frontend.
2. **security**: gitleaks → npm audit → hadolint → Trivy. Any failure stops the pipeline.
3. **build** (main only): logs into Azure via OIDC, builds the image, **scans it before pushing**, generates the SBOM, pushes to the registry.
4. **deploy-staging** → calls `deploy.yml`: runs `deploy.sh <tag>` on the VM via `az vm run-command`, then `smoke.sh` hits the public URL and checks it reports *this* version and that the API requires login.
5. **deploy-production** → same, after approval. If the smoke test fails, the final step runs `rollback.sh` automatically.

Open `infra/modules/platform/files/deploy.sh`: this is the blue/green mechanism (details in Module 5).

## Step 6: Break it on purpose (this is where the learning happens)
Use a **branch** and a pull request for each (`git checkout -b experiment`, push, open PR on GitHub).

| Experiment | Do this | Expected result |
|---|---|---|
| **Failing test** | In `backend/test/api.test.js` change `200` to `201` in the first test | `test` job red; PR cannot merge |
| **Leaked secret** | Add a file `leak.txt` containing `AWS_KEY=AKIAIOSFODNN7EXAMPLE` and `ghp_` + 36 random letters/digits | `security` job red (gitleaks). **Delete the branch afterwards**: a pushed secret stays in git history |
| **Bad release** | Create `backend/migrations/002_bad.sql` containing `SELECT * FROM table_that_does_not_exist;`, merge to main | staging deploy prints `NEW VERSION NEVER BECAME READY… DEPLOY_FAILED`; the **old version keeps serving**; production is never attempted |
| **Approval gate** | Merge any harmless change | staging goes live, production sits at *Waiting*; **Reject** it once to see the flow |
| **Manual rollback** | Run: `az vm run-command invoke -g rg-laundry-staging -n vm-laundry-staging --command-id RunShellScript --scripts "/opt/laundryflow/rollback.sh" --query "value[0].message" -o tsv` | previous version is back in ~30 seconds |

Clean up the bad migration by deleting `002_bad.sql` in a new commit.

## What I would add in a real company (say this in the interview)
* Pin every action to a commit SHA (not `@v4`) to resist supply-chain attacks; Dependabot keeps them updated.
* Sign images (cosign) and verify the signature on the VM before running.
* A DAST scan (OWASP ZAP) against staging.
* Make Checkov blocking (`soft_fail: false`) after triaging findings.
* Terraform plan posted as a PR comment; drift detection on a nightly schedule.
* Deployment metrics (DORA): deploy frequency, lead time, change-failure rate, time-to-restore.

✅ **Done when:** a commit flows test → scan → build → staging → *your approval* → production, and you have watched at least the "Bad release" experiment protect production.
