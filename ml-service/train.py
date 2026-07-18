"""
Trains the risk-predictor model from live database history and saves it to
models/risk_predictor.joblib.

Run manually:
    python train.py

Or triggered via POST /train on the running service (see main.py) — e.g.
from a nightly GitHub Actions cron, same pattern the worker already uses.
"""
import logging
import sys
from datetime import datetime, timezone

from features import build_training_dataset
from model import RiskPredictor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ml_service.train")

MIN_SAMPLES = 30  # below this, the model would just be memorizing noise


def run_training() -> dict:
    logger.info("Pulling training data from database...")
    df = build_training_dataset()

    if len(df) < MIN_SAMPLES:
        raise RuntimeError(
            f"Only {len(df)} training rows available (need >= {MIN_SAMPLES}). "
            "Let the worker collect more snapshot history first — it needs enough "
            "traffic/weather/crowd snapshots plus some risk_alerts history to learn "
            "the relationship between conditions and disruptions."
        )

    logger.info(f"Training on {len(df)} rows across {df['zone_id'].nunique()} zones")
    predictor = RiskPredictor()
    metrics = predictor.fit(df)
    predictor.trained_at = datetime.now(timezone.utc).isoformat()

    predictor.save()
    logger.info(f"Saved model to models/risk_predictor.joblib")
    logger.info(f"Metrics: {metrics}")
    return metrics.__dict__


if __name__ == "__main__":
    try:
        run_training()
    except Exception as e:
        logger.error(f"Training failed: {e}")
        sys.exit(1)
