# Module 6: Disaster recovery: "the VM is compromised"

**Scenario.** Monitoring or a report tells you the production VM may be under an attacker's control (strange
processes, unknown outbound traffic, a leaked key). The application has one VM. You must **contain** the threat,
**keep the evidence**, **rebuild a clean server**, and **bring the app back with minimal downtime**, without forgetting any part of the system.

## Concepts
* **RTO** (Recovery Time Objective): how long you may be down. **RPO** (Recovery Point Objective): how much *data* you may lose. Our targets: RTO ≈ 30 min, RPO ≈ minutes (the managed database keeps continuous backups with point-in-time restore for 7 days).
* **Incident phases:** *Detect → Contain → Eradicate → Recover → Learn.*
* **Contain first, investigate second.** Cut the attacker off, but *preserve evidence* (snapshot the disk; don't reboot/wipe yet).
* **Never "clean" a compromised server, replace it.** You can't prove you removed everything. This is why Module 3 made the VM disposable.
* **Assume secrets are stolen.** Anything the VM could read (database password, JWT key, admin password) is rotated.
* **Stateless compute, stateful services elsewhere.** Nothing irreplaceable lives on the VM: it is *cattle, not a pet*.

## Why nothing gets "missed": every part has a recorded home
| Part of the system | Where it lives (outside the VM) | How it returns |
|---|---|---|
| VM, network, firewall, identity | Terraform code + remote state | `terraform apply` recreates identical |
| Docker, Caddy, Azure CLI, deploy scripts, HTTPS config | `cloud-init.yaml.tftpl` + `files/` | run automatically on first boot |
| Application code/version | image in **Container Registry** (tagged by commit) | `deploy.sh <tag>` |
| Data (customers, orders) | **managed PostgreSQL** (separate from VM, backed up, PITR) | untouched (or restored, Scenario B) |
| Secrets | **Key Vault** | rotated by Terraform, re-read at deploy |
| Public IP + DNS name | separate Terraform resource | survives VM replacement → **no DNS change** |
| TLS certificate | Caddy requests a new Let's Encrypt cert on first start | automatic (~30-60 s) |
| Monitoring + alerts | Terraform (Log Analytics, App Insights, alerts) | unaffected (VM CPU alert re-points to the new VM on apply) |
| CI/CD | GitHub workflows (OIDC, no stored credentials) | unaffected |

## Before a disaster (prep, do once)
1. You can log in with `az login` and have **Owner/Contributor** on the subscription.
2. `infra/envs/prod/terraform.tfvars` exists on the machine you'd use (or `TF_VAR_*` set), and `export ACR_NAME=...`.
3. `./dr/*.sh` are executable (`chmod +x dr/*.sh`) and you've **practised on staging** (below).
4. The on-call list (who to call for DB, security, CEO/CTO) is written down somewhere that's *not* on the compromised system.

## The runbook: copy-paste, in order
Open a terminal in the repo root. Start a stopwatch. Use `staging` for practice, `production` for real.

### T+0: Declare the incident
Note the time. Tell the CTO/team: *"Suspected compromise of production VM; containing now; expect downtime ~20-30 min."* Open an incident document and **write every action with a timestamp**.

### T+2: CONTAIN: isolate the VM and keep the evidence
```bash
./dr/01-isolate.sh production
```
This script (read it!): (1) attaches a *quarantine firewall* that denies all traffic in and out, (2) **removes the VM's Azure permissions** so an attacker can't ask Azure for secrets as the VM, (3) takes a **forensic snapshot** of the OS disk, (4) prints the isolation time (UTC). **Write that time down:** it matters for Scenario B.
Users now see errors. That is intentional: a compromised server must not keep serving.

### T+6: REBUILD: new clean VM + rotated secrets
```bash
./dr/02-rebuild.sh production
```
It deletes the compromised VM (the snapshot remains), frees the network card from quarantine, and runs `terraform apply`. Terraform sees the VM is missing and recreates it from the same code, and the three `-replace` flags **generate brand-new database, JWT and admin passwords**, update the database server, and rewrite Key Vault. Expect ~8-12 minutes. The public IP and DNS name are unchanged.

### T+18: RESTORE SERVICE: deploy the last known-good app
```bash
export ACR_NAME=acrlaundryxxxxx          # your registry
./dr/03-redeploy.sh production           # or add a tag: ./dr/03-redeploy.sh production a1b2c3d
```
It waits for first-boot to finish, runs `deploy.sh` (fresh secrets from Key Vault, image from the registry), then the smoke test against the public HTTPS address. The final line says **SERVICE RESTORED**.
> Which tag? Use the last version you *trust*, ideally the previous release before the suspected compromise window (GitHub → Actions → last green *production* deploy shows the tag). The script's default is the newest image.

### T+25: VERIFY
* Open the site over HTTPS, log in with the **new** admin password (`az keyvault secret show --vault-name <kv> --name admin-password --query value -o tsv`), create a test order, search.
* Portal → Application Insights → *Availability* is green; alerts quiet.
* Tell stakeholders: service restored; investigation continues.

**Typical downtime: ~20-25 minutes** (about 8-12 of which is VM provisioning). 

## After recovery (eradicate + learn): the checklist that prevents repeat incidents
- [ ] **How did they get in?** Examine the forensic snapshot (attach a copy to an isolated analysis VM): auth logs, new users/SSH keys, cron jobs, unknown containers, outbound connections. *The attacker's entry point must be fixed or the new VM falls the same way.*
- [ ] **What did they touch?** Key Vault audit log (query in Log Analytics):
  `AzureDiagnostics | where ResourceProvider == "MICROSOFT.KEYVAULT" | where OperationName has "Secret" | order by TimeGenerated desc` (look for reads from unfamiliar IPs/times).
- [ ] **Database integrity:** check for unknown DB roles, unexpected changes or bulk exports in the compromise window. If tampering is suspected → Scenario B.
- [ ] **Image integrity:** was the *image* malicious? Compare registry digests with CI build logs; rebuild from a known-good commit if unsure.
- [ ] **Customers:** if personal data may have been accessed, follow your legal/notification obligations (involve the CTO and legal).
- [ ] Delete the quarantine NSG and orphaned OS disk **after** forensics are done.
- [ ] **Blameless post-mortem** within 72 hours: timeline, root cause, what worked, what didn't, **action items with owners and dates**.
- [ ] Permanent fixes (examples): turn on Microsoft Defender for Cloud, restrict VM *outbound* traffic to what's needed, automatic OS patching, add VM logs via Azure Monitor Agent, rotate any credential that ever touched the VM, pin and sign images.

## Scenario B: the database may be tampered with too
Restore the database to just *before* the compromise (point-in-time restore creates a **new** server):
```bash
RG=rg-laundry-production
OLD=$(az postgres flexible-server list -g $RG --query "[0].name" -o tsv)
SUBNET=$(az network vnet subnet show -g $RG --vnet-name vnet-laundry-production -n snet-db --query id -o tsv)
ZONE=$(az network private-dns zone list -g $RG --query "[0].id" -o tsv)
az postgres flexible-server restore -g $RG -n ${OLD}-restored \
  --source-server $OLD --restore-time "2026-10-13T09:30:00Z" \
  --subnet $SUBNET --private-dns-zone $ZONE
```
(Use a UTC time **before** the earliest sign of compromise. Anything written after it is lost: that's your RPO, so pick carefully and tell the business.)
Then point the app at it: set the Key Vault secret `database-url` to the new server host (same user/password pattern as the old URL but the new host name) and re-run `./dr/03-redeploy.sh production`.
*Honest note:* an emergency restore like this creates something Terraform doesn't know about. Afterwards reconcile with `terraform import`/`terraform state` (or rebuild cleanly in a calm moment) and record it in the post-mortem. Emergencies first, tidiness second.

## Practice on staging (do this: untested recovery plans fail)
1. **Simulate evidence:**
   ```bash
   az vm run-command invoke -g rg-laundry-staging -n vm-laundry-staging --command-id RunShellScript \
     --scripts 'echo "attacker was here" > /root/backdoor.txt; useradd -m evil || true' --query "value[0].message" -o tsv
   ```
2. Start a timer and run `01-isolate.sh staging` → `02-rebuild.sh staging` → `03-redeploy.sh staging`.
3. Prove it's clean: `az vm run-command invoke ... --scripts 'ls /root; id evil'` → no `backdoor.txt`, no user `evil`.
4. Prove it's recovered: log in with the **new** password; the old data (orders) is still there.
5. Record: total downtime, the slowest step, what surprised you. Improve the scripts. **Repeat quarterly.**

## Cutting downtime further (what you'd propose to a CTO)
| Option | Result | Cost / trade-off |
|---|---|---|
| **Pre-baked VM image** (Azure Compute Gallery) with Docker/Caddy/CLI installed | VM ready in ~3 min instead of ~10 | image pipeline to maintain |
| **Two VMs behind a load balancer / Front Door** | no downtime: isolate one VM, the other serves | 2x compute; needs shared nothing-on-disk (we already are) |
| **Warm standby VM + low-TTL DNS** | recovery ≈ a DNS switch (1-2 min) | pay for an idle VM |
| **Automated runbook** (a pipeline job that runs 01-03) | fewer human errors at 3am | needs careful authorisation controls |

For a *small* platform with a single VM, the sensible path is: this runbook (now) → pre-baked image → second VM when revenue justifies it. **Match the solution to the business; don't over-engineer.** That judgement is exactly what the challenge says it is evaluating.

✅ **Done when:** you completed the staging drill, measured your own recovery time, and can explain the table "why nothing gets missed".
