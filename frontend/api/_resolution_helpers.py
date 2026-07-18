"""
Serving-side counterpart to ml-service/resolution_features.py +
resolution_model.py. Reuses _ml_helpers.build_live_features() for the raw
signal features (traffic/weather/crowd/waterway/quake — identical formulas,
kept in one place) and adds the alert's disruption_type/severity encoding on
top, exactly matching ml-service/resolution_features.py's
RESOLUTION_FEATURE_COLUMNS order.
"""
import os

import joblib
import numpy as np

from _ml_helpers import build_live_features

MODEL_PATH = os.path.join(os.path.dirname(__file__), "ml_models", "resolution_predictor.joblib")

DISRUPTION_TYPES = ["traffic", "weather", "crowd", "earthquake", "waterway", "flood"]
SEVERITY_ORDINAL = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}

_cached_artifact = None


def load_artifact() -> dict:
    global _cached_artifact
    if _cached_artifact is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                "No trained resolution model bundled at "
                "frontend/api/ml_models/resolution_predictor.joblib. "
                "The ml-training-cron.yml workflow needs enough closed "
                "alerts (with resolved_at set) to train on first."
            )
        _cached_artifact = joblib.load(MODEL_PATH)
    return _cached_artifact


def build_live_features_for_alert(cur, alert_id: int) -> dict:
    """cur is an open psycopg2 RealDictCursor (see frontend/api/_helpers.get_conn)."""
    cur.execute(
        "SELECT alert_id, zone_id, disruption_type, severity FROM risk_alerts WHERE alert_id = %s",
        (alert_id,),
    )
    alert = cur.fetchone()
    if not alert:
        raise ValueError(f"alert_id {alert_id} not found")

    feat = build_live_features(cur, alert["zone_id"])

    dtype = (alert["disruption_type"] or "").lower()
    for d in DISRUPTION_TYPES:
        feat[f"disruption_is_{d}"] = 1.0 if dtype == d else 0.0
    feat["severity_ordinal"] = float(SEVERITY_ORDINAL.get(str(alert["severity"]).upper(), 1))

    return feat


def predict(feature_row: dict) -> dict:
    artifact = load_artifact()
    columns = artifact["feature_columns"]
    X = np.array([[feature_row.get(c, np.nan) for c in columns]], dtype=float)

    low = float(artifact["low_pipeline"].predict(X)[0])
    med = float(artifact["median_pipeline"].predict(X)[0])
    high = float(artifact["high_pipeline"].predict(X)[0])

    low, high = min(low, high), max(low, high)
    med = min(max(med, low), high)
    hours_median = max(1 / 60, med)

    interval_width = max(0.0, high - low)
    relative_spread = interval_width / max(1.0, hours_median)
    confidence = max(30.0, min(90.0, 90.0 - relative_spread * 25.0))

    return {
        "hours_remaining_low": round(low, 2),
        "hours_remaining_median": round(hours_median, 2),
        "hours_remaining_high": round(high, 2),
        "resolution_confidence": round(confidence, 1),
        "model_trained_at": artifact["trained_at"],
    }
