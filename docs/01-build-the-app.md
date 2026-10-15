# Module 1: The web app (LaundryFlow)

**Goal:** run a complete laundry-shop app on your laptop and understand how each part works. A DevOps engineer
must understand what they are deploying.

## Concepts first
* **Three tiers.** *Frontend* (what the browser shows: React), *API/backend* (rules and logic: Express), *database* (permanent storage: PostgreSQL).
* **REST API.** The browser talks to the server with URLs like `GET /api/orders`. Data travels as JSON.
* **Authentication (JWT).** You log in with a password; the server returns a signed token (a "JSON Web Token").
  The browser sends it on every request. If the signature is wrong or expired, the API answers `401`.
* **Environment variables (config outside code).** Passwords and database addresses are *not* written in code.
  They are injected at runtime (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`). In Azure they come from **Key Vault**.
* **Migrations.** Database structure lives in numbered SQL files (`backend/migrations/001_init.sql`). The app applies new ones on start-up and records them in a table so each runs once.
* **Health endpoints.** `/healthz` = "process is alive". `/readyz` = "alive *and* can reach the database". Load balancers, deploy scripts and monitors all use these.
* **Container.** A Docker image = your app + exactly the software it needs, frozen. The same image runs on your laptop, staging and production, which is what removes "works on my machine".

## Step 1: Get the project open
1. Unzip `laundryflow.zip` to a folder, e.g. `C:\dev\laundryflow` or `~/dev/laundryflow`.
2. Open **VS Code** → **File → Open Folder…** → choose `laundryflow`.
3. Open the terminal inside VS Code: **Terminal → New Terminal**.

## Step 2: Tour the code (open each file and read the comments)
| File | What it does |
|---|---|
| `backend/src/index.js` | start-up: checks env vars, runs migrations, starts server, shuts down gracefully |
| `backend/src/app.js` | all API routes, auth, validation, error handling |
| `backend/src/db.js` | PostgreSQL connection pool (TLS switched on by `DB_SSL=true`) |
| `backend/src/migrate.js` | migration runner with a lock so two containers can't migrate at once |
| `backend/migrations/001_init.sql` | tables: customers, services, orders, order_items |
| `backend/test/api.test.js` | automated tests (the pipeline runs these) |
| `frontend/src/App.jsx` + `components/` | the screens (Tailwind CSS for the look, Recharts for the chart) |
| `Dockerfile` | 3 stages: build site → install prod deps → small final image running as a non-root user |

**Concept: why the server (not the browser) calculates prices.** Open `app.js`, find `POST /api/orders`. It looks prices
up in the database. If the browser decided prices, a user could edit the request and pay 0. Never trust the client.

## Step 3: Run everything with one command
Make sure Docker Desktop is running, then paste:
```bash
docker compose up --build
```
Wait for `server started` in the logs. Open <http://localhost:3000>.

* **Login password:** `admin123` (set in `docker-compose.yml`, local only).
* Click **Customers** → add a customer.
* Click **Orders** → **New order** → pick the customer → add services → **Create order**.
* Type a customer name in the **search box**. (Remember this feature: in Module 5 it becomes your "2am incident".)
* Change an order's status with its dropdown, then open **Dashboard**.

Stop with `Ctrl+C`. Your data survives (it's in the `pgdata` volume). To wipe it: `docker compose down -v`.

## Step 4: Run the automated tests
The tests need a database. Leave one running and test against it:
```bash
docker compose up -d db
cd backend
npm install
DATABASE_URL=postgres://laundry:laundry@localhost:5432/laundry npm test
cd ..
```
(PowerShell: `$env:DATABASE_URL="postgres://laundry:laundry@localhost:5432/laundry"; npm test`.)
You should see `# pass 4`.

## Step 5: Make your first change the *right* way (a database migration)
Add a new service **without** touching old files:
1. In VS Code create `backend/migrations/002_add_shoe_cleaning.sql` and paste:
```sql
INSERT INTO services (name, unit, price) VALUES ('Shoe Cleaning', 'item', 8.00)
ON CONFLICT (name) DO NOTHING;
```
2. Restart: `docker compose up --build`. Create an order. **Shoe Cleaning** is in the list.

**Concept: expand / contract.** Migrations that only *add* things (tables, columns, rows) are safe: the old app version
keeps working while the new one starts. Dangerous ones (rename or drop a column) must be split over two releases.
This single rule is what makes zero-downtime deploys possible in Module 5.

## Step 6: Put it on GitHub
1. On github.com click **New repository** → name `laundryflow` → **Public** → **Create** (leave it empty).
2. Paste in the VS Code terminal (replace `YOUR-USER`):
```bash
git init
git add .
git commit -m "LaundryFlow: initial version"
git branch -M main
git remote add origin https://github.com/YOUR-USER/laundryflow.git
git push -u origin main
```
> Do **not** push yet if you want to run Modules 3-4 in order: the pipeline will start running and fail until Azure is set up. It's harmless, but noisy. It is fine to push now and ignore red runs until Module 4.

✅ **Done when:** the app runs locally, tests pass, and the code is on GitHub.
