# Self-Hosted Trigger.dev Setup

Run Trigger.dev entirely on your machine — no cloud account, no external dependencies.

---

## Prerequisites

- **Docker** and **Docker Compose** installed
- **Node.js** 20+

---

## Step 1 — Start the Trigger.dev platform

```bash
# Clone the official Docker setup
git clone https://github.com/triggerdotdev/docker.git trigger-dev-local
cd trigger-dev-local

# Start all services (Postgres, Redis, Trigger.dev webapp + worker)
./start.sh

# Or in detached mode:
./start.sh -d
```

This starts:

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3040 |
| API | http://localhost:3040 |

Wait until you see the dashboard is ready in the logs.

---

## Step 2 — Create a project and get your secret key

1. Open **http://localhost:3040** in your browser
2. Create an account (this is your local instance — pick any email/password)
3. Create a new **project** (e.g., "framework-agents")
4. Go to **Project Settings → API Keys**
5. Copy the **Secret Key** — it looks like `tr_dev_...`

---

## Step 3 — Configure your .env

In the `framework-agents` project root, edit `.env`:

```bash
# Point the SDK at your local instance (not Trigger.dev cloud)
TRIGGER_API_URL=http://localhost:3040

# Paste the secret key from Step 2
TRIGGER_SECRET_KEY=tr_dev_your_key_here
```

---

## Step 4 — Update the project ref (if needed)

The `trigger.config.ts` has a `project` field:

```typescript
export default defineConfig({
  project: "proj_framework-agents",
  // ...
});
```

If your local dashboard created a different project ref, update it to match. You can find the project ref in the dashboard URL or project settings.

---

## Step 5 — Start the dev worker

```bash
# From the framework-agents directory
npm run trigger:dev
```

This connects the SDK to your **local** Trigger.dev instance (via `TRIGGER_API_URL`) and registers all tasks from `src/trigger/`.

You should see your tasks appear in the local dashboard at http://localhost:3040.

---

## Step 6 — Start the API server

```bash
npm run dev
```

Now you have three services running:

| Terminal | Command | What it does |
|----------|---------|-------------|
| 1 | `./start.sh` (in trigger-dev-local/) | Trigger.dev platform (Docker) |
| 2 | `npm run trigger:dev` | Task worker connected to local platform |
| 3 | `npm run dev` | API server on http://localhost:3000 |

---

## Step 7 — Verify

```bash
# Send a test message
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"userMessage": "How is our VIP cohort performing?"}'

# Check the run in the local dashboard
open http://localhost:3040
```

You should see the pipeline run appear in the dashboard with all 4 stages (Grounding → Cognition → Agency → Interface).

---

## Stopping services

```bash
# Stop Trigger.dev (from the trigger-dev-local directory)
docker compose down

# Or if you used ./start.sh -d:
docker compose down
```

Data is persisted in Docker volumes. Restarting `docker compose up` brings everything back.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Dashboard not loading | Wait 30-60 seconds for containers to fully start |
| `npm run trigger:dev` can't connect | Verify `TRIGGER_API_URL=http://localhost:3040` in `.env` |
| Tasks not appearing in dashboard | Check the `project` field in `trigger.config.ts` matches your dashboard project |
| Port 3040 in use | Change the port in the Docker Compose file and update `TRIGGER_API_URL` |

---

## Production self-hosting

For production, you can deploy the same Docker setup to any server:

- Use the official **Kubernetes Helm chart** for cluster deployments
- Or deploy the Docker Compose stack on a single VPS
- Configure a reverse proxy (nginx/Caddy) for HTTPS
- Set up proper Postgres backups

See the [official self-hosting docs](https://trigger.dev/docs/open-source-self-hosting) for more details.
