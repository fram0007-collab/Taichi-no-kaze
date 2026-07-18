"""
Feature engineering for the resolution-time model: "given an alert that's
currently OPEN, how many more hours until it resolves?"

Trained on REAL outcomes — risk_alerts rows where resolved_at is set (see
worker/engine.py, which now stamps resolved_at whenever it flips an alert's
status to CLOSED; and db-migration/001_add_resolved_at.sql for existing
databases that predate this column).

Training approach: for every alert that has actually closed, walk every
signal-reading anchor time DURING that alert's open window
(alert_timestamp <= anchor < resolved_at) and compute:
  - the same signal features features.py uses (current conditions at that
    moment — not just conditions at the moment the alert opened, since
    conditions evolve and a model that only ever saw "opening conditions"
    couldn't tell a fast-clearing storm from a slow one partway through)
  - remaining_hours = (resolved_at - anchor) in hours  ← regression target
  - the alert's disruption_type (one-hot) and severity (ordinal) — these
    matter a lot for duration and cost nothing to include

This means one closed alert contributes MANY training rows (one per anchor
during its open window), which helps a lot given alerts will be relatively
rare compared to raw snapshots.
"""
from datetime import datetime

import numpy as np
import pandas as pd

from database import run_query
from signal_features import (
    SIGNAL_FEATURE_COLUMNS,
    SEVERITY_ORDINAL,
    build_signal_feature_row,
    load_zone_series,
)

DISRUPTION_TYPES = ["traffic", "weather", "crowd", "earthquake", "waterway", "flood"]

RESOLUTION_FEATURE_COLUMNS = SIGNAL_FEATURE_COLUMNS + ["severity_ordinal"] + [
    f"disruption_is_{d}" for d in DISRUPTION_TYPES
]

MIN_REMAINING_HOURS = 1 / 60  # floor at 1 minute to avoid zero/negative targets from clock skew


def _disruption_one_hot(disruption_type: str) -> dict:
    dtype = (disruption_type or "").lower()
    return {f"disruption_is_{d}": 1.0 if dtype == d else 0.0 for d in DISRUPTION_TYPES}


def _alert_categorical_features(disruption_type: str, severity: str) -> dict:
    feat = {"severity_ordinal": float(SEVERITY_ORDINAL.get(str(severity).upper(), 1))}
    feat.update(_disruption_one_hot(disruption_type))
    return feat


def build_resolution_training_dataset() -> pd.DataFrame:
    zones = run_query("SELECT * FROM zones")
    quakes = run_query("SELECT * FROM earthquake_events")
    zones_by_id = {z["zone_id"]: z for z in zones}

    rows = []
    for zone in zones:
        zid = zone["zone_id"]

        closed_alerts = run_query(
            """SELECT alert_id, disruption_type, severity, alert_timestamp, resolved_at
               FROM risk_alerts
               WHERE zone_id = :z AND resolved_at IS NOT NULL AND alert_timestamp IS NOT NULL
               ORDER BY alert_timestamp""",
            {"z": zid},
        )
        if not closed_alerts:
            continue

        series = load_zone_series(run_query, zid)
        traffic, weather, crowd, waterway = series["traffic"], series["weather"], series["crowd"], series["waterway"]
        if traffic.empty and weather.empty and crowd.empty:
            continue

        for alert in closed_alerts:
            opened = pd.to_datetime(alert["alert_timestamp"])
            closed = pd.to_datetime(alert["resolved_at"])
            if pd.isna(opened) or pd.isna(closed) or closed <= opened:
                continue

            # Anchor points: every raw-signal reading that fell inside this
            # alert's open window (same as-of philosophy as features.py).
            anchors = sorted(set(
                [t for t in traffic["timestamp"] if opened <= t < closed] if not traffic.empty else []
                + [t for t in weather["timestamp"] if opened <= t < closed] if not weather.empty else []
                + [t for t in crowd["timestamp"] if opened <= t < closed] if not crowd.empty else []
            ))
            # Always include the opening moment itself, even if no reading
            # landed exactly then — gives every alert at least one training row.
            anchors = sorted(set(anchors) | {opened})

            for anchor in anchors:
                feat = build_signal_feature_row(zone, anchor, traffic, weather, crowd, waterway, quakes)
                feat.update(_alert_categorical_features(alert["disruption_type"], alert["severity"]))
                feat["zone_id"] = zid
                feat["alert_id"] = alert["alert_id"]
                feat["anchor_time"] = anchor
                remaining_hours = (closed - anchor).total_seconds() / 3600.0
                feat["label"] = max(MIN_REMAINING_HOURS, remaining_hours)
                rows.append(feat)

    return pd.DataFrame(rows)


def build_live_features_for_alert(alert_id: int) -> dict:
    """Live features for one currently-OPEN alert, using CURRENT conditions
    (not conditions frozen at the moment it opened)."""
    alert_rows = run_query(
        "SELECT alert_id, zone_id, disruption_type, severity FROM risk_alerts WHERE alert_id=:a",
        {"a": alert_id},
    )
    if not alert_rows:
        raise ValueError(f"alert_id {alert_id} not found")
    alert = alert_rows[0]

    zone_rows = run_query("SELECT * FROM zones WHERE zone_id=:z", {"z": alert["zone_id"]})
    if not zone_rows:
        raise ValueError(f"zone_id {alert['zone_id']} not found")
    zone = zone_rows[0]
    quakes = run_query("SELECT * FROM earthquake_events")

    series = load_zone_series(run_query, alert["zone_id"])
    now = datetime.utcnow()
    feat = build_signal_feature_row(
        zone, now, series["traffic"], series["weather"], series["crowd"], series["waterway"], quakes
    )
    feat.update(_alert_categorical_features(alert["disruption_type"], alert["severity"]))
    return feat
