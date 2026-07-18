"""
Trains the resolution-time model from real historical alert outcomes and
saves it to models/resolution_predictor.joblib.

Requires risk_alerts.resolved_at to be populated — see
db-migration/001_add_resolved_at.sql if your database predates that column,
and note that only alerts opened+closed AFTER that column started being
written will have usable data. This will report "not enough data" until then
— that's expected, not a bug.

Run manually:
    python train_resolution.py
"""
import logging
import sys
from datetime import datetime, timezone

from resolution_features import build_resolution_training_dataset
from resolution_model import ResolutionPredictor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ml_service.train_resolution")

MIN_SAMPLES = 30
MIN_ALERTS = 8  # need duration data from a handful of *distinct* real alerts, not just many anchors from one


def run_training() -> dict:
    logger.info("Pulling closed-alert history from database...")
    df = build_resolution_training_dataset()

    if len(df) < MIN_SAMPLES or ("alert_id" in df.columns and df["alert_id"].nunique() < MIN_ALERTS):
        n_alerts = df["alert_id"].nunique() if "alert_id" in df.columns and len(df) else 0
        raise RuntimeError(
            f"Only {len(df)} training rows from {n_alerts} closed alerts "
            f"(need >= {MIN_SAMPLES} rows and >= {MIN_ALERTS} distinct alerts). "
            "Alerts need to actually open and close with resolved_at populated "
            "(worker/engine.py sets this automatically once deployed) before "
            "there's real duration data to learn from."
        )

    logger.info(f"Training on {len(df)} rows from {df['alert_id'].nunique()} closed alerts")
    predictor = ResolutionPredictor()
    metrics = predictor.fit(df)
    predictor.trained_at = datetime.now(timezone.utc).isoformat()

    predictor.save()
    logger.info("Saved model to models/resolution_predictor.joblib")
    logger.info(f"Metrics: {metrics}")
    return metrics.__dict__


if __name__ == "__main__":
    try:
        run_training()
    except Exception as e:
        logger.error(f"Training failed: {e}")
        sys.exit(1)
