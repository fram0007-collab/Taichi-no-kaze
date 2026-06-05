"""
DIS-RUPTURE Backend API — Neon PostgreSQL Edition
==================================================
Migrated from Oracle ATP + SDO_GEOMETRY to Neon PostgreSQL with flat lat/lon zones.

Key changes from Oracle version:
  - SDO_UTIL.TO_GEOJSON → not needed; geometry computed from lat/lon + radius_m
  - CLOB / LOB reading → standard Python strings
  - DisruptionPrediction table → risk_alerts (zone_status holds scores)
  - Zone geometry served as GeoJSON Polygon derived from lat/lon/radius_m
  - SELECT 1 FROM DUAL → SELECT 1
  - All Oracle wallet connection args → DATABASE_URL with sslmode=require
"""

import json
import logging
import os
import secrets
import math
import asyncio
import time
from datetime import datetime, timedelta
from typing import List, Optional, Any

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func, text, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db, TTLCache, get_sql_ops_metrics, AsyncSessionLocal
from backend.models import (
    Zone, ZoneStatus, TrafficSnapshot, WeatherSnapshot,
    CrowdSnapshot, EarthquakeEvent, RiskAlert, PoiMaster,
    JabodetabekWaterway,
)

# ── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend")

# ── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="DIS-RUPTURE Early Warning API — Neon PostgreSQL Edition",
    description=(
        "Real-time urban disruption detection for Jabodetabek. "
        "Migrated from Oracle ATP to Neon PostgreSQL."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_APP_START_TIME: datetime = datetime.now()
DISPLAY_ALL_EARTHQUAKES = os.getenv("DISPLAY_ALL_EARTHQUAKES", "false").lower() == "true"

# ── TTL Caches ───────────────────────────────────────────────────────────────
predictions_cache = TTLCache(ttl_seconds=60)
rivers_cache = TTLCache(ttl_seconds=300)
timelines_cache = TTLCache(ttl_seconds=120)
stats_cache = TTLCache(ttl_seconds=600)
zone_status_cache = TTLCache(ttl_seconds=90)


# ── Geometry Helper ──────────────────────────────────────────────────────────
def zone_to_geojson_polygon(lat: float, lon: float, radius_m: float) -> dict:
    """
    Approximates a zone circle as a 36-point GeoJSON Polygon.
    Replaces Oracle SDO_UTIL.TO_GEOJSON(SDO_GEOMETRY).
    """
    points = []
    steps = 36
    for i in range(steps + 1):
        angle = math.radians(360.0 * i / steps)
        delta_lat = (radius_m / 111_000) * math.cos(angle)
        delta_lon = (radius_m / (111_000 * math.cos(math.radians(lat)))) * math.sin(angle)
        points.append([round(lon + delta_lon, 6), round(lat + delta_lat, 6)])
    return {"type": "Polygon", "coordinates": [points]}


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Spherical law of cosines distance in metres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    lam1, lam2 = math.radians(lon1), math.radians(lon2)
    cos_a = max(-1.0, min(1.0,
        math.sin(phi1) * math.sin(phi2)
        + math.cos(phi1) * math.cos(phi2) * math.cos(lam2 - lam1)
    ))
    return 6_371_000 * math.acos(cos_a)


# ── Zone In-Memory Cache ─────────────────────────────────────────────────────
class ZoneCache:
    """
    In-memory cache of zone records with pre-computed GeoJSON polygons.
    Eliminates repeated DB round-trips for the spatial endpoint.
    """
    _zones: dict[int, dict] = {}
    _last_synced: Optional[datetime] = None

    @classmethod
    async def sync(cls, db: AsyncSession):
        logger.info("[ZoneCache] Syncing zones from Neon...")
        result = await db.execute(select(Zone))
        zones = result.scalars().all()

        cls._zones = {}
        for z in zones:
            geometry = zone_to_geojson_polygon(z.latitude, z.longitude, float(z.radius_m))
            cls._zones[z.zone_id] = {
                "zone_id": z.zone_id,
                "name": z.name,
                "latitude": float(z.latitude),
                "longitude": float(z.longitude),
                "radius_m": int(z.radius_m),
                "capacity": int(z.capacity or 100),
                "historical_flood_vulnerability": float(z.historical_flood_vulnerability or 0.5),
                "traffic_speed_baseline": float(z.traffic_speed_baseline or 40.0),
                "geometry": geometry,
            }

        cls._last_synced = datetime.now()
        logger.info(f"[ZoneCache] Synced {len(cls._zones)} zones.")

    @classmethod
    def get_all(cls) -> list[dict]:
        return list(cls._zones.values())

    @classmethod
    def get(cls, zone_id: int) -> Optional[dict]:
        return cls._zones.get(zone_id)


# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    async with AsyncSessionLocal() as session:
        try:
            await ZoneCache.sync(session)
        except Exception as e:
            logger.error(f"[Startup] ZoneCache sync failed: {e}")

    # Start background cache refresh loops
    asyncio.create_task(predictions_refresh_loop())
    asyncio.create_task(rivers_refresh_loop())
    asyncio.create_task(stats_refresh_loop())
    logger.info("[Startup] Background cache loops started.")


# ── Background Refresh Loops ─────────────────────────────────────────────────
async def predictions_refresh_loop():
    while True:
        await asyncio.sleep(120)
        try:
            async with AsyncSessionLocal() as session:
                await _fetch_active_alerts(session, force=True)
        except Exception as e:
            logger.error(f"[Cache] Predictions refresh failed: {e}")


async def rivers_refresh_loop():
    while True:
        await asyncio.sleep(300)
        try:
            async with AsyncSessionLocal() as session:
                await _fetch_rivers(session, force=True)
        except Exception as e:
            logger.error(f"[Cache] Rivers refresh failed: {e}")


async def stats_refresh_loop():
    while True:
        await asyncio.sleep(600)
        try:
            async with AsyncSessionLocal() as session:
                result = await _compute_db_stats(session)
                await stats_cache.set("db_stats", result)
        except Exception as e:
            logger.error(f"[Cache] Stats refresh failed: {e}")


# ── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "db": "neon-postgresql"}


# ── Earthquakes ──────────────────────────────────────────────────────────────
@app.get("/earthquakes")
async def get_recent_earthquakes(db: AsyncSession = Depends(get_db)):
    try:
        if DISPLAY_ALL_EARTHQUAKES:
            stmt = select(EarthquakeEvent).order_by(EarthquakeEvent.event_timestamp.desc())
        else:
            stmt = select(EarthquakeEvent).order_by(
                EarthquakeEvent.event_timestamp.desc()
            ).limit(5)
        result = await db.execute(stmt)
        quakes = result.scalars().all()
        return [
            {
                "event_id": q.event_id,
                "magnitude": float(q.magnitude) if q.magnitude else None,
                "depth_km": float(q.depth_km) if q.depth_km else None,
                "latitude": q.latitude,
                "longitude": q.longitude,
                "event_timestamp": q.event_timestamp.isoformat() if q.event_timestamp else None,
                "location": q.location,
                "impact_radius_km": float(q.impact_radius_km) if q.impact_radius_km else None,
            }
            for q in quakes
        ]
    except Exception as e:
        logger.error(f"[API] Earthquakes error: {e}")
        return []


# ── Rivers / Waterways ───────────────────────────────────────────────────────
async def _fetch_rivers(db: AsyncSession, force: bool = False):
    if not force:
        cached = await rivers_cache.get("global_rivers")
        if cached:
            return cached

    result = await db.execute(select(JabodetabekWaterway))
    waterways = result.scalars().all()
    data = [
        {
            # ===== Existing fields =====
            "hyriv_id": w.hyriv_id,
            "main_riv": w.main_riv,
            "length_km": w.length_km,
            "catch_skm": w.catch_skm,
            "upland_skm": w.upland_skm,
            "average_discharge_cms": w.dis_av_cms,
            "current_discharge_cms": w.current_discharge_cms,
            "discharge_ratio": w.discharge_ratio,
            "alert_level": w.alert_level or "Normal",
            "last_updated": w.last_updated,

            # ===== Frontend compatibility =====
            "name": f"Waterway {w.hyriv_id}",
            "category": "river",

            "current_level":
                w.current_discharge_cms
                if w.current_discharge_cms is not None
                else w.dis_av_cms,

            "max_capacity":
                round(w.dis_av_cms * 2, 2),

            "capacity_percentage":
                round(
                    (
                        (
                            w.current_discharge_cms
                            if w.current_discharge_cms is not None
                            else w.dis_av_cms
                        )
                        /
                        (w.dis_av_cms * 2)
                    ) * 100,
                    1
                ),

            "coordinates": json.loads(w.coordinates_json)
        }
        for w in waterways
    ]
    await rivers_cache.set("global_rivers", data)
    return data


@app.get("/rivers")
async def get_all_rivers(db: AsyncSession = Depends(get_db), force_refresh: bool = False):
    return await _fetch_rivers(db, force=force_refresh)


# ── Active Risk Alerts ────────────────────────────────────────────────────────
async def _fetch_active_alerts(db: AsyncSession, force: bool = False):
    if not force:
        cached = await predictions_cache.get("global_active")
        if cached:
            logger.info("[Cache Hit] Active alerts from cache.")
            return cached

    if not ZoneCache.get_all():
        await ZoneCache.sync(db)

    logger.info("[Cache Miss] Fetching active alerts from Neon...")
    try:
        stmt = (
            select(RiskAlert)
            .where(RiskAlert.status == "OPEN")
            .where(RiskAlert.probability_percentage >= 20)
            .order_by(RiskAlert.estimated_time_to_peak.asc())
        )
        result = await db.execute(stmt)
        alerts = result.scalars().all()

        response = []
        for a in alerts:
            zone_data = ZoneCache.get(a.zone_id)
            if not zone_data:
                continue
            response.append({
                "alert_id": a.alert_id,
                "disruption_type": a.disruption_type,
                "severity": a.severity,
                "probability_percentage": float(a.probability_percentage or 0),
                "estimated_time_to_peak": (
                    a.estimated_time_to_peak.isoformat() if a.estimated_time_to_peak else None
                ),
                "message": a.message,
                "status": a.status,
                "alert_timestamp": a.alert_timestamp.isoformat() if a.alert_timestamp else None,
                "zone": {
                    "zone_id": zone_data["zone_id"],
                    "name": zone_data["name"],
                    "latitude": zone_data["latitude"],
                    "longitude": zone_data["longitude"],
                    "radius_m": zone_data["radius_m"],
                    "historical_flood_vulnerability": zone_data["historical_flood_vulnerability"],
                    "traffic_speed_baseline": zone_data["traffic_speed_baseline"],
                    "geometry": zone_data["geometry"],
                },
            })

        await predictions_cache.set("global_active", response)
        return response
    except Exception as e:
        logger.error(f"[API] Active alerts error: {e}")
        return []


@app.get("/predictions/active")
async def get_active_predictions(
    db: AsyncSession = Depends(get_db), force_refresh: bool = False
):
    return await _fetch_active_alerts(db, force=force_refresh)


# ── Zone Status ───────────────────────────────────────────────────────────────

@app.get("/zone-status/all")
async def get_all_zone_statuses_with_zones(db: AsyncSession = Depends(get_db)):
    """
    Returns ALL zones with their current status, not just alert zones.
    Used by the frontend MapView to show every zone on the map
    (green=low risk, yellow=medium, red=high) regardless of whether
    an alert has fired. This gives users full situational awareness.
    """
    if not ZoneCache.get_all():
        await ZoneCache.sync(db)

    result = await db.execute(select(ZoneStatus))
    statuses = result.scalars().all()
    status_map = {s.zone_id: s for s in statuses}

    response = []
    for zone_data in ZoneCache.get_all():
        zid = zone_data["zone_id"]
        s = status_map.get(zid)

        overall = float(s.overall_risk_score or 0) if s else 0.0
        waterway = float(s.waterway_score or 0) if s and hasattr(s, 'waterway_score') and s.waterway_score is not None else 0.0
        traffic = float(s.traffic_score or 0) if s else 0.0
        weather = float(s.weather_score or 0) if s else 0.0
        crowd = float(s.crowd_score or 0) if s else 0.0
        earthquake = float(s.earthquake_score or 0) if s else 0.0

        # Derive display severity from the dominant dimension score
        # (not the composite — so waterway=37 shows as MEDIUM not LOW)
        dom = s.dominant_risk if s else "weather"
        dim_scores = {
            "traffic": traffic, "weather": weather, "crowd": crowd,
            "earthquake": earthquake, "waterway": waterway,
        }
        dominant_score = dim_scores.get(dom, overall)

        if dominant_score >= 65 or overall >= 65:
            display_severity = "HIGH"
        elif dominant_score >= 25 or overall >= 25:
            display_severity = "MEDIUM"
        else:
            display_severity = "LOW"

        response.append({
            "zone_id": zid,
            "zone": zone_data,
            "traffic_score": traffic,
            "weather_score": weather,
            "crowd_score": crowd,
            "earthquake_score": earthquake,
            "waterway_score": waterway,
            "overall_risk_score": overall,
            "display_severity": display_severity,
            "dominant_risk": dom,
            "recommended_action": s.recommended_action if s else "No data yet.",
            "last_updated": s.last_updated.isoformat() if s and s.last_updated else None,
        })

    return response

@app.get("/zone-status/{zone_id}")
async def get_zone_status(zone_id: int, db: AsyncSession = Depends(get_db)):
    cache_key = f"zone_status_{zone_id}"
    cached = await zone_status_cache.get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(ZoneStatus).where(ZoneStatus.zone_id == zone_id)
    )
    status = result.scalars().first()
    if not status:
        raise HTTPException(status_code=404, detail="Zone status not found")

    data = {
        "zone_id": status.zone_id,
        "traffic_score": float(status.traffic_score or 0),
        "weather_score": float(status.weather_score or 0),
        "crowd_score": float(status.crowd_score or 0),
        "earthquake_score": float(status.earthquake_score or 0),
        "overall_risk_score": float(status.overall_risk_score or 0),
        "last_updated": status.last_updated.isoformat() if status.last_updated else None,
        "dominant_risk": status.dominant_risk,
        "recommended_action": status.recommended_action,
    }
    await zone_status_cache.set(cache_key, data)
    return data


@app.get("/zone-status")
async def get_all_zone_statuses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneStatus))
    statuses = result.scalars().all()
    return [
        {
            "zone_id": s.zone_id,
            "traffic_score": float(s.traffic_score or 0),
            "weather_score": float(s.weather_score or 0),
            "crowd_score": float(s.crowd_score or 0),
            "earthquake_score": float(s.earthquake_score or 0),
            "overall_risk_score": float(s.overall_risk_score or 0),
            "last_updated": s.last_updated.isoformat() if s.last_updated else None,
            "dominant_risk": s.dominant_risk,
            "recommended_action": s.recommended_action,
            "zone": ZoneCache.get(s.zone_id),
        }
        for s in statuses
    ]


# ── Predictions Timeline ─────────────────────────────────────────────────────
@app.get("/predictions/zone/{zone_id}")
async def get_zone_predictions_timeline(
    zone_id: int,
    hours: int = Query(default=12, ge=3, le=24),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"timeline_{zone_id}_{hours}"
    cached = await timelines_cache.get(cache_key)
    if cached:
        return cached

    zone_data = ZoneCache.get(zone_id)
    if not zone_data:
        raise HTTPException(status_code=404, detail="Zone not found")

    now = datetime.utcnow()
    time_limit = now + timedelta(hours=hours)

    weather_res = await db.execute(
        select(WeatherSnapshot)
        .where(WeatherSnapshot.zone_id == zone_id)
        .where(WeatherSnapshot.timestamp >= now)
        .where(WeatherSnapshot.timestamp <= time_limit)
        .order_by(WeatherSnapshot.timestamp.asc())
    )
    forecasts = weather_res.scalars().all()

    traffic_res = await db.execute(
        select(TrafficSnapshot)
        .where(TrafficSnapshot.zone_id == zone_id)
        .order_by(TrafficSnapshot.timestamp.desc())
        .limit(1)
    )
    latest_traffic = traffic_res.scalars().first()

    baseline = zone_data["traffic_speed_baseline"]
    timeline = []

    if not forecasts:
        for i in range(hours):
            seg_time = now + timedelta(hours=i)
            speed = latest_traffic.speed if (i == 0 and latest_traffic) else baseline
            timeline.append({
                "timestamp": seg_time.isoformat(),
                "rainfall": 0.0,
                "humidity": 70.0,
                "expected_speed": float(speed or baseline),
                "risk_level": "Low",
            })
    else:
        for idx, f in enumerate(forecasts):
            rain = float(f.rainfall or 0)
            speed_mod = 1.0
            risk = "Low"
            if rain > 10.0:
                speed_mod, risk = 0.55, "Critical"
            elif rain > 5.0:
                speed_mod, risk = 0.70, "High"
            elif rain > 1.0:
                speed_mod, risk = 0.85, "Medium"

            hr = f.timestamp.hour
            if (7 <= hr <= 9) or (17 <= hr <= 19):
                speed_mod = max(0.40, speed_mod * 0.80)
                risk = {"Low": "Medium", "Medium": "High"}.get(risk, risk)

            expected = (
                float(latest_traffic.speed or baseline)
                if idx == 0 and latest_traffic
                else round(baseline * speed_mod, 2)
            )
            timeline.append({
                "timestamp": f.timestamp.isoformat(),
                "rainfall": rain,
                "humidity": float(f.humidity or 70),
                "expected_speed": expected,
                "risk_level": risk,
            })

    result = {
        "zone_id": zone_id,
        "zone_name": zone_data["name"],
        "timeline": timeline,
    }
    await timelines_cache.set(cache_key, result)
    return result


# ── Nearest Zones (Spatial) ──────────────────────────────────────────────────
@app.get("/zones/spatial")
async def get_zones_by_spatial_proximity(
    lon: float = Query(..., description="User longitude"),
    lat: float = Query(..., description="User latitude"),
    db: AsyncSession = Depends(get_db),
):
    """Haversine-sorted nearest 3 zones with their active alerts."""
    if not ZoneCache.get_all():
        await ZoneCache.sync(db)

    zones_dist = sorted(
        [
            (z, haversine_m(lat, lon, z["latitude"], z["longitude"]))
            for z in ZoneCache.get_all()
        ],
        key=lambda x: x[1],
    )[:3]

    response = []
    for zone, dist in zones_dist:
        alerts_res = await db.execute(
            select(RiskAlert)
            .where(RiskAlert.zone_id == zone["zone_id"])
            .where(RiskAlert.status == "OPEN")
            .where(RiskAlert.probability_percentage >= 20)
            .order_by(RiskAlert.alert_timestamp.desc())
        )
        alerts = alerts_res.scalars().all()

        # Fetch nearest safe zone via poi_master
        safe_res = await db.execute(
            select(PoiMaster).where(PoiMaster.is_safe_zone == True)
        )
        safe_zones = safe_res.scalars().all()
        nearest_safe_km = None
        if safe_zones:
            nearest_safe_km = round(
                min(
                    haversine_m(
                        zone["latitude"], zone["longitude"],
                        float(s.latitude), float(s.longitude)
                    ) / 1000
                    for s in safe_zones
                    if s.latitude and s.longitude
                ),
                3,
            )

        response.append({
            "zone": {**zone},
            "distance_meters": round(dist, 2),
            "nearest_safe_zone_km": nearest_safe_km,
            "active_alerts": [
                {
                    "alert_id": a.alert_id,
                    "disruption_type": a.disruption_type,
                    "severity": a.severity,
                    "probability_percentage": float(a.probability_percentage or 0),
                    "estimated_time_to_peak": (
                        a.estimated_time_to_peak.isoformat()
                        if a.estimated_time_to_peak else None
                    ),
                    "message": a.message,
                }
                for a in alerts
            ],
        })

    return response


# ── Safe Zones ────────────────────────────────────────────────────────────────
@app.get("/safe-zones")
async def get_safe_zones(
    lat: float = Query(None, description="Filter by proximity (optional)"),
    lon: float = Query(None, description="Filter by proximity (optional)"),
    db: AsyncSession = Depends(get_db),
):
    """Returns all POIs marked as safe zones, optionally sorted by proximity."""
    result = await db.execute(
        select(PoiMaster).where(PoiMaster.is_safe_zone == True)
    )
    pois = result.scalars().all()

    data = [
        {
            "poi_id": p.poi_id,
            "name": p.name,
            "category": p.category,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "zone_id": p.zone_id,
        }
        for p in pois
        if p.latitude and p.longitude
    ]

    if lat is not None and lon is not None:
        data.sort(
            key=lambda p: haversine_m(lat, lon, p["latitude"], p["longitude"])
        )

    return data


# ── Admin ─────────────────────────────────────────────────────────────────────
@app.post("/admin/login")
async def admin_login(payload: dict):
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "disrupt_admin_2026")
    if secrets.compare_digest(str(payload.get("password", "")), ADMIN_PASSWORD):
        return {"authenticated": True, "token": "authenticated-session-token-2026"}
    raise HTTPException(status_code=401, detail="Unauthorized")


@app.post("/admin/cache/clear")
async def clear_all_caches():
    await predictions_cache.clear()
    await rivers_cache.clear()
    await timelines_cache.clear()
    await stats_cache.clear()
    await zone_status_cache.clear()
    logger.info("[Cache] All caches cleared.")
    return {"message": "All caches cleared"}


@app.post("/admin/zones/sync")
async def sync_zones(db: AsyncSession = Depends(get_db)):
    """Re-syncs ZoneCache from Neon and clears stale caches."""
    await ZoneCache.sync(db)
    await predictions_cache.clear()
    await zone_status_cache.clear()
    return {"message": "Zones re-synced", "count": len(ZoneCache.get_all())}


async def _compute_db_stats(db: AsyncSession) -> dict:
    counts = {}
    for model, name in [
        (Zone, "zones"), (RiskAlert, "risk_alerts"),
        (TrafficSnapshot, "traffic_snapshots"),
        (WeatherSnapshot, "weather_snapshots"),
        (CrowdSnapshot, "crowd_snapshots"),
        (EarthquakeEvent, "earthquake_events"),
    ]:
        try:
            res = await db.execute(select(func.count()).select_from(model))
            counts[name] = res.scalar()
        except Exception:
            counts[name] = "error"
    return counts


@app.get("/admin/status")
async def get_admin_status(db: AsyncSession = Depends(get_db)):
    from backend.database import get_sql_ops_metrics

    t0 = time.time()
    try:
        await db.execute(text("SELECT 1"))
        db_latency = round((time.time() - t0) * 1000, 2)
        db_status = "healthy"
    except Exception as e:
        db_latency = 0.0
        db_status = f"unreachable ({e})"

    now = datetime.now()
    _JOB_REGISTRY = {
        "traffic_ingestion": {"name": "TomTom Traffic", "interval_minutes": 15},
        "weather_ingestion": {"name": "Open-Meteo Weather", "interval_minutes": 30},
        "crowd_ingestion": {"name": "Crowd Density", "interval_minutes": 15},
        "predictive_scoring": {"name": "Scoring Engine", "interval_minutes": 15},
        "earthquake_ingestion": {"name": "BMKG Earthquakes", "interval_minutes": 15},
    }
    jobs = []
    for job_id, job in _JOB_REGISTRY.items():
        interval_s = job["interval_minutes"] * 60
        elapsed_s = (now - _APP_START_TIME).total_seconds()
        intervals_done = max(0, int(elapsed_s // interval_s))
        last_run = _APP_START_TIME + timedelta(seconds=intervals_done * interval_s)
        next_run = last_run + timedelta(seconds=interval_s)
        sec_left = max(0, int((next_run - now).total_seconds()))
        jobs.append({
            "id": job_id,
            "name": job["name"],
            "interval_minutes": job["interval_minutes"],
            "last_run": last_run.isoformat(),
            "next_run": next_run.isoformat(),
            "next_run_mmss": f"{sec_left // 60:02d}:{sec_left % 60:02d}",
            "status": "running",
        })

    sql_ops = get_sql_ops_metrics()
    zone_count = len(ZoneCache.get_all())

    return {
        "database": {"status": db_status, "latency_ms": db_latency, "provider": "neon-postgresql"},
        "cache": {"zones_loaded": zone_count},
        "sql_ops": sql_ops,
        "jobs": jobs,
    }


@app.get("/admin/db-stats")
async def get_db_stats(db: AsyncSession = Depends(get_db)):
    cached = await stats_cache.get("db_stats")
    if cached:
        return cached
    result = await _compute_db_stats(db)
    await stats_cache.set("db_stats", result)
    return result


# ── /pois — POI catalog for MapView ──────────────────────────────────────────
# Frontend expects: { name, category, lat, lon, is_suppressed }
@app.get("/pois")
async def get_pois(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PoiMaster))
    pois = result.scalars().all()
    return [
        {
            "name": p.name,
            "category": p.category or "other",
            "lat": float(p.latitude) if p.latitude else 0.0,
            "lon": float(p.longitude) if p.longitude else 0.0,
            "is_suppressed": False,
            "is_safe_zone": p.is_safe_zone,
            "zone_id": p.zone_id,
        }
        for p in pois
        if p.latitude and p.longitude
    ]


# ── /admin/scoring-debug — AdminDashboard scoring trace ──────────────────────
@app.get("/admin/scoring-debug")
async def get_scoring_debug(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ZoneStatus))
    statuses = result.scalars().all()
    return [
        {
            "zone_id": s.zone_id,
            "zone_name": (ZoneCache.get(s.zone_id) or {}).get("name", f"Zone {s.zone_id}"),
            "traffic_score": float(s.traffic_score or 0),
            "weather_score": float(s.weather_score or 0),
            "crowd_score": float(s.crowd_score or 0),
            "earthquake_score": float(s.earthquake_score or 0),
            "overall_risk_score": float(s.overall_risk_score or 0),
            "dominant_risk": s.dominant_risk,
            "recommended_action": s.recommended_action,
            "last_updated": s.last_updated.isoformat() if s.last_updated else None,
        }
        for s in statuses
    ]


# ── /admin/sla-metrics — AdminDashboard SLA chart ────────────────────────────
@app.get("/admin/sla-metrics")
async def get_sla_metrics(
    range_hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func as sqlfunc
    cutoff = datetime.utcnow() - timedelta(hours=range_hours)

    traffic_count = (await db.execute(
        select(sqlfunc.count()).select_from(TrafficSnapshot)
        .where(TrafficSnapshot.timestamp >= cutoff)
    )).scalar()

    weather_count = (await db.execute(
        select(sqlfunc.count()).select_from(WeatherSnapshot)
        .where(WeatherSnapshot.timestamp >= cutoff)
    )).scalar()

    alert_count = (await db.execute(
        select(sqlfunc.count()).select_from(RiskAlert)
        .where(RiskAlert.alert_timestamp >= cutoff)
    )).scalar()

    return {
        "range_hours": range_hours,
        "traffic_snapshots": traffic_count,
        "weather_snapshots": weather_count,
        "risk_alerts_generated": alert_count,
        "data_freshness_ok": traffic_count > 0 or weather_count > 0,
    }
