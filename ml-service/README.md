# DIS-RUPTURE ML Service

Adds a **learned early-warning model** on top of the existing rule-based risk
engine (`worker/engine.py`). It doesn't replace that engine — it reads from
the same database and answers a different question:

> "Given current traffic/weather/crowd/quake/waterway readings and how
> they've been trending, how likely is a HIGH-severity `risk_alert` in this
> zone in the next few hours?"

The rule engine tells you today's score. This tells you where it's headed.

## Architecture: training here, serving on Vercel

This project deploys on **Vercel** (frontend + Python serverless functions in
`frontend/api/`) with **GitHub Actions** doing scheduled work (see
`worker-ingestion.yml`). Vercel functions are stateless per-request and have
a bundle-size budget, so this ML feature is split into two pieces instead of
running as its own always-on server:

| Piece | Where it runs | What it does |
|---|---|---|
| **Training** (`ml-service/`, this folder) | GitHub Actions, on a schedule (`.github/workflows/ml-training-cron.yml`) | Pulls history from Postgres, trains a `GradientBoostingClassifier`, commits the resulting `.joblib` file into `frontend/api/ml_models/` |
| **Serving** (`frontend/api/predict_zone_risk.py` + `_ml_helpers.py`) | Vercel serverless function, same as your other `/api/*` endpoints | Loads the committed model, builds live features for one zone from a couple of DB queries, returns a prediction |

Committing the trained model into `frontend/api/ml_models/` means the
artifact ships as part of the normal Vercel deploy — pushing the retrained
model **is** the deploy. No second hosting platform, no external model
storage, nothing new to keep running.

```
GitHub Actions (cron, daily)          Vercel (on every push)
┌────────────────────────┐            ┌──────────────────────────┐
│ ml-service/train.py     │  commits   │ frontend/api/             │
│  - reads DB history     │ ────────►  │   predict_zone_risk.py    │
│  - trains model          │  model     │   _ml_helpers.py          │
│  - saves .joblib         │  file      │   ml_models/*.joblib ◄────┤ reads at request time
└────────────────────────┘            └──────────────────────────┘
```

**Why training and serving use separate feature-building code**
(`ml-service/features.py` vs. `frontend/api/_ml_helpers.py`): the serving
function needs to stay small to fit Vercel's function size limit, so it skips
pandas and uses plain psycopg2 + numpy instead. Both implement the exact same
formulas — if you change one, change the other. `FEATURE_COLUMNS` in both
files must stay identical (there's a check for this in `test_offline.py`-style
testing; see below).

## What's in this folder vs. what's in the main repo

- **`ml-service/`** (this folder) — training only. Not deployed as a running
  service. `pip install -r requirements.txt`, then `python train.py` locally
  or via the GitHub Actions workflow.
- **`frontend/api/predict_zone_risk.py`**, **`frontend/api/_ml_helpers.py`**,
  **`frontend/api/ml_models/`** — the serving side, already added to your repo.
  Deploys automatically with the rest of `frontend/` on Vercel.
- **`.github/workflows/ml-training-cron.yml`** — the cron job that ties them
  together.

## Setup

**1. Local training / sanity check (optional but recommended first):**
```bash
cd ml-service
pip install -r requirements.txt
cp .env.example .env   # fill in the SAME DATABASE_URL as worker/.env (sync driver, no +asyncpg)
python test_offline.py   # validates model.py end-to-end with synthetic data, no DB needed
python train.py          # trains on real history — needs enough accumulated snapshots + risk_alerts
```

**2. GitHub Actions secret:**
Add `DATABASE_URL` under Settings → Secrets and variables → Actions (same
value as the worker's `DATABASE_URL` secret already used by
`worker-ingestion.yml`).

**3. First run:**
Trigger `.github/workflows/ml-training-cron.yml` manually from the Actions
tab ("Run workflow") rather than waiting for the daily schedule. If training
succeeds, it commits `frontend/api/ml_models/risk_predictor.joblib`, Vercel
picks up the push and redeploys, and `GET /api/predict/zone/:zoneId` starts
returning real predictions instead of a 503.

**4. Vercel env vars:** none needed beyond what already exists —
`predict_zone_risk.py` reuses the same `DATABASE_URL` your other
`frontend/api/*.py` functions already read via `_helpers.get_conn()`.

## Using it from the frontend

```
GET /api/predict/zone/14
```
```json
{
  "zone_id": 14,
  "predicted_severity": "MEDIUM",
  "probability_high": 0.18,
  "probabilities": {"NONE": 0.31, "LOW": 0.29, "MEDIUM": 0.22, "HIGH": 0.18},
  "horizon_hours": 3,
  "model_trained_at": "2026-07-16T03:00:00+00:00"
}
```

Add a small `useMlPrediction(zoneId)` hook (same pattern as the existing
`usePredictions.js`) and surface it as an "early warning" badge next to the
zone's current rule-based score — don't feed it back into
`overall_risk_score` until you've watched its `high_precision`/`high_recall`
(see `GET` on `/model/info` equivalent — check `metrics` inside the
`.joblib`, or log them from the training workflow) for a while. A bad
early-warning model that's wired into the number everyone relies on is worse
than no early-warning model.

## Local development server (optional)

`main.py` in this folder is a small FastAPI app (`GET /predict/{zone_id}`,
`POST /train`) that wraps the same code, useful for local development/testing
without needing Vercel's dev server, or if you ever add a platform that isn't
Vercel (Render, Fly, etc.) and want a real always-on endpoint instead of the
git-commit-triggers-deploy flow above. It is **not** part of the Vercel
deployment — nothing calls it in production as configured here.

```bash
uvicorn main:app --reload --port 8000
curl http://localhost:8000/predict/1
```

## Notes / next steps

- **Cold start**: `train.py` refuses to train on fewer than 30 rows rather
  than silently fitting noise. Let the worker run for a while first.
- **Class imbalance**: HIGH-severity alerts will likely be rare. Check
  `metrics.high_precision` / `high_recall` printed by the training workflow —
  if precision is very low (lots of false alarms), consider
  `class_weight="balanced"` on the classifier in `model.py`, or raise the
  probability threshold the frontend treats as "warn the user."
- **Retraining cadence**: daily is the default in `ml-training-cron.yml`.
  Bump it up once you're seeing `risk_alerts` accumulate fast enough for
  more frequent retraining to matter.
- **Feature ideas once more data exists**: distance-weighted traffic from
  neighboring zones, holiday/event calendar, longer rainfall accumulation
  windows (6h/24h) for flood risk specifically.
