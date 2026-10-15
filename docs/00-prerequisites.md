# Module 0: Prerequisites

## Accounts
1. **Azure**: open <https://azure.microsoft.com/free> and sign up. You need a subscription where you are **Owner**
   (a personal/free one is). Terraform will create role assignments, which needs Owner.
2. **GitHub**: <https://github.com>. *Tip:* a **public** repo lets you use "required reviewers" (the production approval gate) for free.
   Private repos need a paid plan for that feature. Nothing sensitive is in this repo (secrets live in Azure Key Vault).

## Install (Windows / macOS / Linux)
| Tool | Why | Download |
|---|---|---|
| **VS Code** | editor | code.visualstudio.com |
| **Git** | version control | git-scm.com |
| **Node.js 20 LTS** | runs the API / builds the site | nodejs.org |
| **Docker Desktop** | runs containers locally | docker.com/products/docker-desktop |
| **Azure CLI** | control Azure from the terminal | learn.microsoft.com/cli/azure/install-azure-cli |
| **Terraform** | infrastructure-as-code | developer.hashicorp.com/terraform/install |

> **Windows users:** the scripts are Bash. Do the DevOps parts inside **WSL2 (Ubuntu)** (`wsl --install` in an admin
> PowerShell, then reboot) **or** use **Azure Cloud Shell** (the `>_` icon in the Azure portal, choose Bash).
> Cloud Shell already has `az` and `terraform`: the easiest option for Modules 3-6.

## VS Code extensions (open VS Code → Extensions icon → search → Install)
*HashiCorp Terraform*, *Docker*, *GitHub Actions*, *YAML*.

## Verify (open a terminal, paste each line, you should see a version number)
```bash
git --version
node --version      # v20.x
docker --version
az --version
terraform --version
```

## Log in to Azure
```bash
az login
az account show --query "{name:name, id:id}" -o table
```
`az login` opens a browser. After sign-in, `az account show` prints your subscription.

## Create an SSH key (for emergency access to VMs)
```bash
ssh-keygen -t ed25519 -C "laundryflow" -f ~/.ssh/laundryflow
cat ~/.ssh/laundryflow.pub
```
Press Enter twice for no passphrase (or set one). The `.pub` file is your **public** key (safe to share).
The file without `.pub` is **private**: never share or commit it.

## Budget alert (do this now)
Azure portal → search **Cost Management + Billing** → **Budgets** → **Add** → set e.g. 30 USD/month → add your email at 80%.

**Concept: why a budget in a DevOps role?** The challenge says you own *"scaling, security, and cost"*. Cost
guardrails are part of the job.
