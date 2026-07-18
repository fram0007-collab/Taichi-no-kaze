"""
Low-level signal feature engineering shared by:
  - features.py              (early-warning classifier: risk_alerts occurrence)
  - resolution_features.py   (resolution-time regressor: risk_alerts duration)

Keeping this in one place means both models see identical traffic/weather/
crowd/waterway/quake feature definitions — only the label differs.
"""
import math
from datetime import datetime

import numpy as np
import pandas as pd

SIGNAL_FEATURE_COLUMNS = [
    "traffic_speed", "traffic_congestion", "traffic_drop_ratio",
    "rainfall", "rainfall_trend_3", "humidity", "wind_speed",
    "crowd_score", "poi_count", "hazard_count",
    "waterway_level_cm", "waterway_capacity_pct", "waterway_trend_3",
    "quake_energy_score",
    "flood_vulnerability", "traffic_baseline",
    "hour_sin", "hour_cos", "dow_sin", "dow_cos",
]

SEVERITY_ORDINAL = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}


def time_features(ts: datetime) -> dict:
    hour_wib = (ts.hour + 7) % 24
    dow = ts.weekday()
    return {
        "hour_sin": math.sin(2 * math.pi * hour_wib / 24),
        "hour_cos": math.cos(2 * math.pi * hour_wib / 24),
        "dow_sin": math.sin(2 * math.pi * dow / 7),
        "dow_cos": math.cos(2 * math.pi * dow / 7),
    }


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def quake_energy_score(zone_lat, zone_lon, quakes: list, as_of: datetime) -> float:
    """Same distance/magnitude decay engine.py uses, restricted to quakes
    that had already happened as of `as_of` (no leakage from the future)."""
    total = 0.0
    for eq in quakes:
        if eq["event_timestamp"] is None or eq["event_timestamp"] > as_of:
            continue
        dist = haversine_km(zone_lat, zone_lon, float(eq["latitude"] or 0.0), float(eq["longitude"] or 0.0))
        if dist > 300.0:
            continue
        mag = float(eq["magnitude"] or 0.0)
        dist_factor = max(0.0, 1.0 - dist / 300.0)
        mag_factor = max(0.0, min(1.0, (mag - 3.0) / 6.0))
        total += dist_factor * mag_factor * 100.0
    return round(min(100.0, total), 2)


def asof_row(df: pd.DataFrame, ts_col: str, anchor: datetime, value_cols: list) -> dict:
    """Most recent row at-or-before `anchor`. Returns NaNs if none exists yet."""
    past = df[df[ts_col] <= anchor]
    if past.empty:
        return {c: np.nan for c in value_cols}
    row = past.sort_values(ts_col).iloc[-1]
    return {c: row[c] for c in value_cols}


def trend(df: pd.DataFrame, ts_col: str, value_col: str, anchor: datetime, window_n: int = 3) -> float:
    """Simple slope over the last `window_n` readings at-or-before anchor.
    Positive = rising. 0.0 if not enough history."""
    past = df[df[ts_col] <= anchor].sort_values(ts_col).tail(window_n)
    if len(past) < 2:
        return 0.0
    y = past[value_col].astype(float).values
    x = np.arange(len(y))
    if np.all(y == y[0]):
        return 0.0
    slope = np.polyfit(x, y, 1)[0]
    return float(slope)


def zone_static(zone_row: dict) -> dict:
    return {
        "flood_vulnerability": float(zone_row.get("historical_flood_vulnerability") or 0.5),
        "traffic_baseline": float(zone_row.get("traffic_speed_baseline") or 40.0),
    }


def build_signal_feature_row(zone_row, anchor, traffic_df, weather_df, crowd_df, waterway_df, quakes) -> dict:
    feat = {}

    t_asof = asof_row(traffic_df, "timestamp", anchor, ["speed", "congestion"])
    speed = t_asof["speed"]
    baseline = float(zone_row.get("traffic_speed_baseline") or 40.0)
    feat["traffic_speed"] = speed
    feat["traffic_congestion"] = t_asof["congestion"]
    feat["traffic_drop_ratio"] = (
        max(0.0, (baseline - speed) / baseline) if pd.notna(speed) and baseline > 0 else np.nan
    )

    w_asof = asof_row(weather_df, "timestamp", anchor, ["rainfall", "humidity", "wind_speed"])
    feat["rainfall"] = w_asof["rainfall"]
    feat["humidity"] = w_asof["humidity"]
    feat["wind_speed"] = w_asof["wind_speed"]
    feat["rainfall_trend_3"] = trend(weather_df, "timestamp", "rainfall", anchor)

    c_asof = asof_row(crowd_df, "timestamp", anchor, ["crowd_score", "poi_count", "hazard_count"])
    feat["crowd_score"] = c_asof["crowd_score"]
    feat["poi_count"] = c_asof["poi_count"]
    feat["hazard_count"] = c_asof["hazard_count"]

    ww_asof = asof_row(waterway_df, "timestamp", anchor, ["water_level_cm", "capacity_percentage"])
    feat["waterway_level_cm"] = ww_asof["water_level_cm"]
    feat["waterway_capacity_pct"] = ww_asof["capacity_percentage"]
    feat["waterway_trend_3"] = trend(waterway_df, "timestamp", "water_level_cm", anchor)

    feat["quake_energy_score"] = quake_energy_score(
        zone_row["latitude"], zone_row["longitude"], quakes, anchor
    )

    feat.update(zone_static(zone_row))
    feat.update(time_features(anchor))
    return feat


def load_zone_series(run_query, zone_id: int) -> dict:
    """Fetches the 4 raw signal series for one zone as timestamp-sorted
    DataFrames. Shared by both training-set builders and both live-feature
    builders so the SQL lives in exactly one place."""
    traffic = pd.DataFrame(run_query(
        "SELECT timestamp, speed, congestion FROM traffic_snapshots WHERE zone_id=:z ORDER BY timestamp",
        {"z": zone_id}))
    weather = pd.DataFrame(run_query(
        "SELECT timestamp, rainfall, humidity, wind_speed FROM weather_snapshots WHERE zone_id=:z ORDER BY timestamp",
        {"z": zone_id}))
    crowd = pd.DataFrame(run_query(
        "SELECT timestamp, crowd_score, poi_count, hazard_count FROM crowd_snapshots WHERE zone_id=:z ORDER BY timestamp",
        {"z": zone_id}))
    waterway = pd.DataFrame(run_query(
        """SELECT wt.timestamp, wt.water_level_cm, wt.capacity_percentage
           FROM waterway_telemetry wt
           JOIN zone_waterway_mapping m ON m.hyriv_id = wt.hyriv_id
           WHERE m.zone_id = :z ORDER BY wt.timestamp""",
        {"z": zone_id}))

    for df in (traffic, weather, crowd, waterway):
        if not df.empty:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            # Postgres NUMERIC columns come back as Decimal via psycopg2/
            # SQLAlchemy — coerce to float64 here, once, so nothing downstream
            # (asof_row, trend, build_signal_feature_row) can ever mix a
            # Decimal into a float arithmetic op and blow up.
            for col in df.columns:
                if col != "timestamp":
                    df[col] = pd.to_numeric(df[col], errors="coerce")

    return {"traffic": traffic, "weather": weather, "crowd": crowd, "waterway": waterway}
