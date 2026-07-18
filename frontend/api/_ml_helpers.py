"""
Feature engineering + model loading for the ML prediction endpoint, kept
dependency-light (psycopg2 + numpy only, no pandas) since this runs inside a
Vercel Python serverless function with a bundle-size budget.

Feature definitions here MUST match ml-service/features.py exactly — that's
what train.py (run in GitHub Actions) uses to build the training set. If you
change one, change the other.
"""
import math
import os
from datetime import datetime, timezone

import joblib
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "ml_models", "risk_predictor.joblib")

SEVERITY_LABELS = {0: "NONE", 1: "LOW", 2: "MEDIUM", 3: "HIGH"}

FEATURE_COLUMNS = [
    "traffic_speed", "traffic_congestion", "traffic_drop_ratio",
    "rainfall", "rainfall_trend_3", "humidity", "wind_speed",
    "crowd_score", "poi_count", "hazard_count",
    "waterway_level_cm", "waterway_capacity_pct", "waterway_trend_3",
    "quake_energy_score",
    "flood_vulnerability", "traffic_baseline",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
]

# Module-level cache: survives across warm invocations of the same Vercel
# function instance, so we don't re-read+unpickle the model on every request.
_cached_artifact = None


def load_artifact() -> dict:
    global _cached_artifact
    if _cached_artifact is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                "No trained model bundled at frontend/api/ml_models/risk_predictor.joblib. "
                "The ml-training-cron.yml workflow needs to run at least once first."
            )
        _cached_artifact = joblib.load(MODEL_PATH)
    return _cached_artifact


def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def _quake_energy_score(zone_lat, zone_lon, quakes: list) -> float:
    total = 0.0
    for eq in quakes:
        dist = _haversine_km(zone_lat, zone_lon, eq["latitude"] or 0.0, eq["longitude"] or 0.0)
        if dist > 300.0:
            continue
        mag = float(eq["magnitude"] or 0.0)
        dist_factor = max(0.0, 1.0 - dist / 300.0)
        mag_factor = max(0.0, min(1.0, (mag - 3.0) / 6.0))
        total += dist_factor * mag_factor * 100.0
    return round(min(100.0, total), 2)


def _trend(rows: list, value_key: str, window_n: int = 3) -> float:
    """rows must be sorted ascending by timestamp already. Simple slope over
    the last `window_n` readings. 0.0 if not enough history."""
    tail = [r for r in rows[-window_n:] if r.get(value_key) is not None]
    if len(tail) < 2:
        return 0.0
    y = np.array([float(r[value_key]) for r in tail])
    x = np.arange(len(y))
    if np.all(y == y[0]):
        return 0.0
    return float(np.polyfit(x, y, 1)[0])


def _time_features(ts: datetime) -> dict:
    hour_wib = (ts.hour + 7) % 24
    dow = ts.weekday()
    return {
        "hour_sin": math.sin(2 * math.pi * hour_wib / 24),
        "hour_cos": math.cos(2 * math.pi * hour_wib / 24),
        "dow_sin": math.sin(2 * math.pi * dow / 7),
        "dow_cos": math.cos(2 * math.pi * dow / 7),
    }


def build_live_features(cur, zone_id: int) -> dict:
    """cur is an open psycopg2 RealDictCursor (see frontend/api/_helpers.get_conn)."""
    cur.execute(
        "SELECT * FROM zones WHERE zone_id = %s", (zone_id,)
    )
    zone = cur.fetchone()
    if not zone:
        raise ValueError(f"zone_id {zone_id} not found")

    cur.execute(
        "SELECT timestamp, speed, congestion FROM traffic_snapshots "
        "WHERE zone_id = %s ORDER BY timestamp DESC LIMIT 5", (zone_id,)
    )
    traffic = list(reversed(cur.fetchall()))

    cur.execute(
        "SELECT timestamp, rainfall, humidity, wind_speed FROM weather_snapshots "
        "WHERE zone_id = %s ORDER BY timestamp DESC LIMIT 5", (zone_id,)
    )
    weather = list(reversed(cur.fetchall()))

    cur.execute(
        "SELECT timestamp, crowd_score, poi_count, hazard_count FROM crowd_snapshots "
        "WHERE zone_id = %s ORDER BY timestamp DESC LIMIT 5", (zone_id,)
    )
    crowd = list(reversed(cur.fetchall()))

    cur.execute(
        """SELECT wt.timestamp, wt.water_level_cm, wt.capacity_percentage
           FROM waterway_telemetry wt
           JOIN zone_waterway_mapping m ON m.hyriv_id = wt.hyriv_id
           WHERE m.zone_id = %s ORDER BY wt.timestamp DESC LIMIT 5""", (zone_id,)
    )
    waterway = list(reversed(cur.fetchall()))

    cur.execute("SELECT latitude, longitude, magnitude FROM earthquake_events")
    quakes = cur.fetchall()

    feat = {}

    latest_traffic = traffic[-1] if traffic else {}
    speed = latest_traffic.get("speed")
    baseline = float(zone.get("traffic_speed_baseline") or 40.0)
    feat["traffic_speed"] = float(speed) if speed is not None else np.nan
    feat["traffic_congestion"] = (
        float(latest_traffic["congestion"]) if latest_traffic.get("congestion") is not None else np.nan
    )
    feat["traffic_drop_ratio"] = (
        max(0.0, (baseline - float(speed)) / baseline) if speed is not None and baseline > 0 else np.nan
    )

    latest_weather = weather[-1] if weather else {}
    feat["rainfall"] = float(latest_weather["rainfall"]) if latest_weather.get("rainfall") is not None else np.nan
    feat["humidity"] = float(latest_weather["humidity"]) if latest_weather.get("humidity") is not None else np.nan
    feat["wind_speed"] = float(latest_weather["wind_speed"]) if latest_weather.get("wind_speed") is not None else np.nan
    feat["rainfall_trend_3"] = _trend(weather, "rainfall")

    latest_crowd = crowd[-1] if crowd else {}
    feat["crowd_score"] = float(latest_crowd["crowd_score"]) if latest_crowd.get("crowd_score") is not None else np.nan
    feat["poi_count"] = float(latest_crowd["poi_count"]) if latest_crowd.get("poi_count") is not None else np.nan
    feat["hazard_count"] = float(latest_crowd["hazard_count"]) if latest_crowd.get("hazard_count") is not None else np.nan

    latest_ww = waterway[-1] if waterway else {}
    feat["waterway_level_cm"] = float(latest_ww["water_level_cm"]) if latest_ww.get("water_level_cm") is not None else np.nan
    feat["waterway_capacity_pct"] = float(latest_ww["capacity_percentage"]) if latest_ww.get("capacity_percentage") is not None else np.nan
    feat["waterway_trend_3"] = _trend(waterway, "water_level_cm")

    feat["quake_energy_score"] = _quake_energy_score(zone["latitude"], zone["longitude"], quakes)

    feat["flood_vulnerability"] = float(zone.get("historical_flood_vulnerability") or 0.5)
    feat["traffic_baseline"] = baseline

    feat.update(_time_features(datetime.now(timezone.utc)))
    return feat


def predict(feature_row: dict) -> dict:
    artifact = load_artifact()
    pipeline = artifact["pipeline"]
    columns = artifact["feature_columns"]

    X = np.array([[feature_row.get(c, np.nan) for c in columns]], dtype=float)
    proba = pipeline.predict_proba(X)[0]
    classes = pipeline.named_steps["clf"].classes_
    proba_by_class = {SEVERITY_LABELS[int(c)]: round(float(p), 4) for c, p in zip(classes, proba)}
    pred_class = int(classes[np.argmax(proba)])

    return {
        "predicted_severity": SEVERITY_LABELS[pred_class],
        "probability_high": proba_by_class.get("HIGH", 0.0),
        "probabilities": proba_by_class,
        "horizon_hours": artifact["horizon_hours"],
        "model_trained_at": artifact["trained_at"],
    }
