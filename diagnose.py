"""
diagnose.py — Run this FIRST from the project root to verify everything works.
Usage:
    cd dis_rupture_neon
    python diagnose.py

It will:
1. Check .env files exist in the right places
2. Test the database connection
3. Show table counts
4. Seed zones if the zones table is empty
5. Run one manual ingestion cycle
"""

import os
import sys
from pathlib import Path

print("=" * 60)
print("DIS-RUPTURE Diagnostic & Auto-Fix Tool")
print("=" * 60)

# ── 1. Check .env files ───────────────────────────────────────────────────────
project_root = Path(__file__).parent

missing_envs = []
for path in [
    project_root / "backend" / ".env",
    project_root / "worker" / ".env",
]:
    if not path.exists():
        missing_envs.append(str(path))
        print(f"[MISSING] {path}")
    else:
        print(f"[OK] {path} exists")

if missing_envs:
    print("\nFATAL: Missing .env files. Copy them from the fix zip into place.")
    sys.exit(1)

# ── 2. Load worker env and test DB ───────────────────────────────────────────
from dotenv import load_dotenv
load_dotenv(project_root / "worker" / ".env")

DB_URL = os.getenv("DATABASE_URL", "")
if not DB_URL:
    print("FATAL: DATABASE_URL not set in worker/.env")
    sys.exit(1)

# Strip asyncpg for sync connection
sync_url = DB_URL.replace("postgresql+asyncpg://", "postgresql://")
print(f"\n[DB] Connecting to: {sync_url[:60]}...")

try:
    import psycopg2
    conn = psycopg2.connect(sync_url, connect_timeout=15)
    conn.autocommit = True
    cur = conn.cursor()
    print("[DB] Connected successfully!")
except Exception as e:
    print(f"[DB] Connection FAILED: {e}")
    print("\nCheck that:")
    print("  - Your Neon database is active (not sleeping)")
    print("  - The DATABASE_URL in worker/.env is correct")
    sys.exit(1)

# ── 3. Show table counts ──────────────────────────────────────────────────────
print("\n[DB] Table counts:")
tables = ["zones", "zone_status", "traffic_snapshots", "weather_snapshots",
          "crowd_snapshots", "earthquake_events", "risk_alerts", "poi_master"]

counts = {}
for table in tables:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        counts[table] = cur.fetchone()[0]
        print(f"  {table}: {counts[table]}")
    except Exception as e:
        print(f"  {table}: ERROR - {e} (table may not exist, run db/init.sql first)")
        counts[table] = -1

# ── 4. Seed zones if empty ────────────────────────────────────────────────────
if counts.get("zones", 0) == 0:
    print("\n[SEED] zones table is EMPTY — seeding now...")
    seed_sql = (project_root / "db" / "seed.sql").read_text()
    try:
        cur.execute(seed_sql)
        cur.execute("SELECT COUNT(*) FROM zones")
        n = cur.fetchone()[0]
        print(f"[SEED] Done. {n} zones inserted.")
    except Exception as e:
        print(f"[SEED] ERROR: {e}")
        print("Try running db/seed.sql manually in the Neon console.")
else:
    print(f"\n[SEED] Zones already seeded ({counts['zones']} zones). Skipping.")

# ── 5. Show zones ────────────────────────────────────────────────────────────
cur.execute("SELECT zone_id, name, latitude, longitude FROM zones ORDER BY zone_id")
rows = cur.fetchall()
print("\n[DB] Zones in database:")
for r in rows:
    print(f"  [{r[0]}] {r[1]} ({r[2]}, {r[3]})")

# ── 6. Run one manual ingestion sweep ─────────────────────────────────────────
print("\n[WORKER] Running one manual ingestion sweep...")
print("  (This will ingest traffic, weather, and score all zones)")

sys.path.insert(0, str(project_root))
os.chdir(project_root)

# Reload env for worker context
load_dotenv(project_root / "worker" / ".env", override=True)

try:
    from worker.main import IngestionWorker
    worker = IngestionWorker()
    worker.run_earthquake_ingestion()
    print("  [OK] Earthquake ingestion done")
    worker.run_traffic_ingestion()
    print("  [OK] Traffic ingestion done")
    worker.run_weather_ingestion()
    print("  [OK] Weather ingestion done")
    worker.run_crowd_ingestion()
    print("  [OK] Crowd ingestion done")
    worker.run_scoring_cycle()
    print("  [OK] Scoring cycle done")
except Exception as e:
    import traceback
    print(f"  [ERROR] {e}")
    traceback.print_exc()

# ── 7. Final status ───────────────────────────────────────────────────────────
print("\n[DB] Final counts after ingestion:")
for table in ["zone_status", "traffic_snapshots", "risk_alerts"]:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    print(f"  {table}: {cur.fetchone()[0]}")

cur.execute("SELECT zone_id, overall_risk_score, dominant_risk, severity FROM zone_status JOIN risk_alerts USING(zone_id) LIMIT 5")
rows = cur.fetchall()
if rows:
    print("\n[OK] Sample risk alerts generated:")
    for r in rows:
        print(f"  Zone {r[0]}: score={r[1]} dominant={r[2]} severity={r[3]}")
else:
    print("\n[WARN] No risk alerts yet — zones may have low scores (normal if no real disruptions)")

conn.close()
print("\n[DONE] Diagnostic complete. If all counts > 0, your system is working.")
print("Now start backend: uvicorn backend.main:app --reload --port 8000")
print("And worker:        python -m worker.main")
