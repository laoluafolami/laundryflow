# Module 2: Deploy to Azure the "old way" (on purpose)

The challenge describes today's setup: *"deployed manually to a single cloud server… SSH-ing in and pulling the latest code,
with a managed Postgres database."* You will build exactly that, once, in a throwaway resource group, so you
can feel its problems and understand what Modules 3-5 fix.

## Concepts
* **Resource group:** a folder in Azure that holds related resources. Deleting the folder deletes everything inside (easy cleanup).
* **VM (virtual machine):** a Linux computer you rent. **You** must patch and secure it.
* **Managed PostgreSQL:** Azure runs the database for you: backups, patching, failover options.
* **NSG / firewall:** rules for which network traffic may reach a resource.

## Step 1: Create the infrastructure by hand (az CLI)
Paste block by block. Pick your own strong password in `DBPASS` (letters+digits, 16+ chars).
```bash
RG=rg-laundry-manual
LOC=westeurope
DBPASS='ChangeMe-UseALongRandomPassw0rd'
SUFFIX=$RANDOM

az group create -n $RG -l $LOC

# 1) the VM (Ubuntu 22.04), using your SSH key
az vm create -g $RG -n vm-manual --image Ubuntu2204 --size Standard_B2s \
  --admin-username azureuser --ssh-key-values ~/.ssh/laundryflow.pub --public-ip-sku Standard

# 2) open the web port
az vm open-port -g $RG -n vm-manual --port 80

# 3) find the VM's public IP
IP=$(az vm show -d -g $RG -n vm-manual --query publicIps -o tsv); echo $IP

# 4) the managed database; allow ONLY the VM's IP through its firewall
az postgres flexible-server create -g $RG -n psql-manual-$SUFFIX -l $LOC \
  --admin-user laundryadmin --admin-password "$DBPASS" \
  --sku-name Standard_B1ms --tier Burstable --storage-size 32 --version 16 \
  --public-access $IP --yes
az postgres flexible-server db create -g $RG --server-name psql-manual-$SUFFIX --database-name laundry
echo "DB host: psql-manual-$SUFFIX.postgres.database.azure.com"
```
The create commands take a few minutes. Note the **IP** and **DB host**.

## Step 2: SSH in and install Docker
```bash
ssh -i ~/.ssh/laundryflow azureuser@$IP
```
(type `yes` to the fingerprint question). You are now **inside the server**. Paste:
```bash
sudo apt-get update && sudo apt-get install -y docker.io git
sudo systemctl enable --now docker
```

## Step 3: Pull the code and run it (the classic way)
Still inside the server (replace `YOUR-USER` and the DB host/password):
```bash
git clone https://github.com/YOUR-USER/laundryflow.git
cd laundryflow
sudo docker build -t laundryflow .
sudo docker run -d --name app --restart unless-stopped -p 80:3000 \
  -e DATABASE_URL='postgresql://laundryadmin:YOUR_DB_PASSWORD@psql-manual-NNNN.postgres.database.azure.com:5432/laundry' \
  -e DB_SSL=true -e JWT_SECRET="$(openssl rand -hex 24)" -e ADMIN_PASSWORD='pick-a-password' laundryflow
sudo docker logs -f app      # Ctrl+C to leave the logs; look for "server started"
```
On your own computer open `http://<the IP>`. The app is live on Azure.

## Step 4: Experience a "deployment"
Change something visible (e.g. a heading in `frontend/src/App.jsx`), push to GitHub, then on the server:
```bash
cd ~/laundryflow && git pull
sudo docker build -t laundryflow .          # ~1-2 minutes
sudo docker rm -f app                        # <-- site is DOWN from here
sudo docker run -d --name app ...            # (the long command again)  <-- ...until here
```

## Step 5: Write down the problems (this is Part A of the challenge)
| Problem you just felt | Risk | Fixed by |
|---|---|---|
| Site is down between `rm` and `run` | downtime on every deploy | blue/green deploy (Module 5) |
| Anyone with SSH can change prod; no record of who did what | no audit trail | pipeline-only deploys (Module 4) |
| Secrets typed into a shell command, saved in shell history | leaked passwords | Key Vault + managed identity (Module 3) |
| Build happens on the production server | prod CPU/RAM stolen, build tools on prod | build once in CI, deploy the image (Module 4) |
| No tests ran before it went live | bugs reach users | CI tests + security scans (Module 4) |
| Server was configured by hand; can anyone rebuild it? | "snowflake server", no DR | Terraform + cloud-init (Module 3) |
| Rollback = "remember what the old code was and repeat all this" | slow recovery | tagged images + rollback script |
| Port 22 open to the world, DB reachable from the internet | attack surface | closed SSH, private DB (Module 3) |
| Nobody knows it's broken until a user complains | slow detection | monitoring + alerts (Module 5) |

## Step 6: Clean up (stops the billing)
Leave the SSH session with `exit`, then:
```bash
az group delete -n rg-laundry-manual --yes --no-wait
```

✅ **Done when:** you saw the app running on a cloud VM, felt the downtime window, and can explain the table above in your own words.
