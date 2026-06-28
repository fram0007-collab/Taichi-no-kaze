# DIS-RUPTURE — Local Setup Guide

This guide covers everything you need to change to run the project locally,
and what to do later when deploying to production (Render + Vercel + GitHub Actions).

---

## 1. Prerequisites

Install these if you haven't already:

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12 | https://www.python.org/downloads/ |
| Node.js | 20+ | https://nodejs.org |
| pip | latest | comes with Python |

---

## 2. What You Need to Get (Credentials)

You will need credentials for **two** external services. Both have free tiers.

### A. Database — Supabase (recommended replacement for Neon)

1. Go to https://supabase.com → sign up → "New project"
2. Choose a region close to Jakarta (e.g. **Singapore** or **Mumbai**)
3. After project is created, go to: **Settings → Database → Connection string**
4. Copy two versions of the URL:
   - **URI** tab: looks like `postgresql://postgres.xxxx:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
   - For `backend/.env`: add `+asyncpg` after `postgresql` and use `?sslmode=require`
   - For `worker/.env`: use it as-is (no `+asyncpg`), add `?sslmode=require` if not present

**backend/.env format:**
```
DATABASE_URL=postgresql+asyncpg://postgres.xxxx:PASSWORD@aws-0-....supabase.com:6543/postgres?sslmode=require
```

**worker/.env format:**
```
DATABASE_URL=postgresql://postgres.xxxx:PASSWORD@aws-0-....supabase.com:6543/postgres?sslmode=require
```

> ⚠️ The only difference is `+asyncpg` — backend needs it (async FastAPI), worker does NOT (sync psycopg2).

---

### B. Traffic Data — TomTom API

1. Go to https://developer.tomtom.com → sign up (free)
2. Dashboard → "My Apps" → "Create a new app" → enable **Traffic Flow** product
3. Copy the API key

Use this same key in **both** `backend/.env` and `worker/.env` as `TOMTOM_API_KEY`.

---

### C. Admin Password

Pick any string for `ADMIN_PASSWORD` in both `backend/.env` and `worker/.env`.
This is what you type into the admin dashboard in the UI. Can be anything.

---

## 3. Fill In the .env Files

After getting the credentials above, open each file and replace every `CHANGE_ME`:

### `backend/.env`
```env
DATABASE_URL=postgresql+asyncpg://postgres.xxxx:YOUR_PASSWORD@host.supabase.com:6543/postgres?sslmode=require
TOMTOM_API_KEY=your_tomtom_key_here
TRAFFIC_PROVIDER=tomtom
ADMIN_PASSWORD=any_password_you_choose
DISPLAY_ALL_EARTHQUAKES=false
MOCK_SERVER_URL=
```

### `worker/.env`
```env
DATABASE_URL=postgresql://postgres.xxxx:YOUR_PASSWORD@host.supabase.com:6543/postgres?sslmode=require
TOMTOM_API_KEY=your_tomtom_key_here
TRAFFIC_PROVIDER=tomtom
ADMIN_PASSWORD=any_password_you_choose
DISPLAY_ALL_EARTHQUAKES=false
MOCK_SERVER_URL=
CRON_SECRET=
```

### `frontend/.env`
```env
VITE_API_URL=http://localhost:8000
```
No changes needed for local testing — leave it as-is.

---

## 4. Install Dependencies

Run these from the **project root folder**.

### Backend
```bash
cd backend
pip install -r requirements.txt
cd ..
```

### Worker
```bash
pip install -r worker/requirements.txt
```

### Frontend
```bash
cd frontend
npm install
cd ..
```

---

## 5. Set Up the Database Schema

Supabase gives you a blank Postgres database. You need to create the tables.

**Option A — run diagnose.py (easiest):**
```bash
python diagnose.py
```
This script checks your .env files, tests the DB connection, and seeds the
`zones` table automatically if it is empty. Run this first before starting
any servers — it will tell you if anything is wrong.

**Option B — if the tables don't exist yet:**
The project uses SQLAlchemy models to describe the schema. Run this once from
the project root to create all tables:
```bash
python - << 'EOF'
import asyncio, os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path("backend/.env"))
os.environ["DATABASE_URL"] = os.environ["DATABASE_URL"]

import sys; sys.path.insert(0, "backend")
from database import engine, Base
import models  # registers all table classes

async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created.")

asyncio.run(init())
EOF
```
Then run `python diagnose.py` to seed zones.

---

## 6. Run the Project Locally

Open **three terminal windows** from the project root.

### Terminal 1 — Backend API
```bash
cd backend
uvicorn main:app --reload --port 8000
```
API is now at: http://localhost:8000
Docs (Swagger) at: http://localhost:8000/docs

### Terminal 2 — Worker (ingestion loop)
```bash
python -m worker.main
```
This starts the APScheduler loop that polls traffic/weather/earthquake every
15-30 minutes. You will see log output as jobs run.

### Terminal 3 — Frontend
```bash
cd frontend
npm run dev
```
App is now at: http://localhost:5173

---

## 7. Verify Everything Is Working

1. Open http://localhost:5173 — the map should load
2. Open http://localhost:8000/docs — Swagger UI should appear
3. In the terminal running the worker, you should see ingestion logs within ~1 minute
4. Run `python diagnose.py` any time to check DB row counts

---

## 8. Deploying to Production (after local test passes)

### Render (replaces Railway for backend + worker)

1. Push this project to a GitHub repo (private is fine)
2. Sign up at https://render.com
3. "New +" → "Blueprint" → connect your GitHub repo → Render reads `render.yaml`
4. It creates two services: `dis-rupture-backend` and `dis-rupture-worker`
5. In the Render dashboard, set these env vars for **each service** (marked `sync: false` in render.yaml):

**Backend service env vars:**
- `DATABASE_URL` — postgresql+asyncpg:// version
- `TOMTOM_API_KEY`
- `ADMIN_PASSWORD`

**Worker service env vars:**
- `DATABASE_URL` — postgresql:// version (no +asyncpg)
- `TOMTOM_API_KEY`
- `CRON_SECRET` — generate with: `python -c "import secrets; print(secrets.token_urlsafe(32))"`

### GitHub Actions (replaces the APScheduler loop in production)

The worker on Render runs as an HTTP-triggered app (`worker/app.py`), not the
scheduler loop. GitHub Actions calls it every 15 minutes instead.

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**

Add these two secrets:
- `WORKER_URL` — your worker's Render URL, e.g. `https://dis-rupture-worker.onrender.com`
- `CRON_SECRET` — same value you set in Render

The workflow file (`.github/workflows/ingestion-cron.yml`) is already included
and will activate automatically once pushed.

### Vercel (frontend — already deployed)

Just update one environment variable in your Vercel project settings:
- `VITE_API_URL` → your backend's Render URL, e.g. `https://dis-rupture-backend.onrender.com`

Then trigger a redeploy.

---

## 9. Quick Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `asyncpg` connection error | Wrong DATABASE_URL format in backend/.env | Make sure it has `+asyncpg` |
| `psycopg2` connection error | Wrong DATABASE_URL format in worker/.env | Make sure it has NO `+asyncpg` |
| Map loads but no zone data | Tables empty or zones not seeded | Run `python diagnose.py` |
| Worker logs show 0 zones | Zones table empty | diagnose.py will seed it automatically |
| Frontend shows "network error" | Backend not running | Start Terminal 1 first |
| Supabase project paused | 7 days with no DB activity | GitHub Actions cron prevents this in prod; locally, resume from Supabase dashboard |

---

## Summary of All Values You Need to Change

| File | Key | Where to get it |
|------|-----|----------------|
| `backend/.env` | `DATABASE_URL` | Supabase → Settings → Database → Connection string (add +asyncpg) |
| `backend/.env` | `TOMTOM_API_KEY` | developer.tomtom.com |
| `backend/.env` | `ADMIN_PASSWORD` | Make one up |
| `worker/.env` | `DATABASE_URL` | Same Supabase URL, no +asyncpg |
| `worker/.env` | `TOMTOM_API_KEY` | Same TomTom key |
| `worker/.env` | `ADMIN_PASSWORD` | Same password as backend |
| `worker/.env` | `CRON_SECRET` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `frontend/.env` | `VITE_API_URL` | `http://localhost:8000` for local; Render backend URL for production |
| Render dashboard | `DATABASE_URL` (backend) | Supabase URL with +asyncpg |
| Render dashboard | `DATABASE_URL` (worker) | Supabase URL without +asyncpg |
| Render dashboard | `CRON_SECRET` | Same as worker/.env |
| GitHub Secrets | `WORKER_URL` | Render worker URL after deploy |
| GitHub Secrets | `CRON_SECRET` | Same value everywhere |
| Vercel | `VITE_API_URL` | Render backend URL after deploy |
