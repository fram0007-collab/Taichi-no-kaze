"""
Feature engineering for the early-warning risk-prediction model.

Two entry points:
  build_training_dataset()          -> pandas.DataFrame, one row per (zone, anchor_time)
  build_live_features(zone_id)      -> dict, one row for "right now"

Both produce the SAME feature columns (see FEATURE_COLUMNS below), so a
model trained on one lines up with the other at inference time.

The training label is NOT the rule-engine's own composite score (that would
just be distillation — the model would learn to reproduce arithmetic).
Instead it's grounded in worker/engine.py's actual output: did a HIGH/MEDIUM
severity risk_alert get raised for this zone in the next PREDICTION_HORIZON_HOURS?
That makes this a genuine *early-warning* model — trained to anticipate the
alert before the raw signals fully cross the rule-based thresholds, using
patterns (trends, combinations across hazard types, time-of-day) the
fixed-weight formula in engine.py doesn't look at.

See resolution_features.py for the sibling model — same signal features,
different label — that predicts how long an ALREADY-OPEN alert will take
to clear.
"""
from datetime import datetime

import pandas as pd

from config import PREDICTION_HORIZON_HOURS
from database import run_query
from signal_features import (
    SIGNAL_FEATURE_COLUMNS,
    SEVERITY_ORDINAL,
    build_signal_feature_row,
    load_zone_series,
)

FEATURE_COLUMNS = SIGNAL_FEATURE_COLUMNS  # kept as its own name for backward compat / clarity


def _label_for_window(alerts_df: pd.DataFrame, anchor: datetime, horizon_hours: int) -> int:
    window_end = anchor + pd.Timedelta(hours=horizon_hours)
    hit = alerts_df[
        (alerts_df["alert_timestamp"] > anchor) & (alerts_df["alert_timestamp"] <= window_end)
    ]
    if hit.empty:
        return 0
    max_sev = hit["severity"].map(lambda s: SEVERITY_ORDINAL.get(str(s).upper(), 0)).max()
    return int(max_sev)


def build_training_dataset(horizon_hours: int = None) -> pd.DataFrame:
    horizon_hours = horizon_hours or PREDICTION_HORIZON_HOURS

    zones = run_query("SELECT * FROM zones")
    quakes = run_query("SELECT * FROM earthquake_events")

    rows = []
    for zone in zones:
        zid = zone["zone_id"]
        series = load_zone_series(run_query, zid)
        traffic, weather, crowd, waterway = series["traffic"], series["weather"], series["crowd"], series["waterway"]

        alerts = pd.DataFrame(run_query(
            "SELECT alert_timestamp, severity FROM risk_alerts WHERE zone_id=:z",
            {"z": zid}))

        if traffic.empty and weather.empty and crowd.empty:
            continue  # no history for this zone at all — nothing to learn from

        if not alerts.empty:
            alerts["alert_timestamp"] = pd.to_datetime(alerts["alert_timestamp"])
        else:
            alerts = pd.DataFrame(columns=["alert_timestamp", "severity"])

        # Anchor points: every timestamp we actually have a traffic OR weather
        # OR crowd reading at, per zone (as-of joins fill in the other series).
        anchors = sorted(set(
            list(traffic["timestamp"]) if not traffic.empty else []
            + list(weather["timestamp"]) if not weather.empty else []
            + list(crowd["timestamp"]) if not crowd.empty else []
        )) if not (traffic.empty and weather.empty and crowd.empty) else []

        for anchor in anchors:
            feat = build_signal_feature_row(zone, anchor, traffic, weather, crowd, waterway, quakes)
            feat["zone_id"] = zid
            feat["anchor_time"] = anchor
            feat["label"] = _label_for_window(alerts, anchor, horizon_hours)
            rows.append(feat)

    return pd.DataFrame(rows)


def build_live_features(zone_id: int) -> dict:
    zone_rows = run_query("SELECT * FROM zones WHERE zone_id=:z", {"z": zone_id})
    if not zone_rows:
        raise ValueError(f"zone_id {zone_id} not found")
    zone = zone_rows[0]
    quakes = run_query("SELECT * FROM earthquake_events")

    series = load_zone_series(run_query, zone_id)
    now = datetime.utcnow()
    return build_signal_feature_row(
        zone, now, series["traffic"], series["weather"], series["crowd"], series["waterway"], quakes
    )
