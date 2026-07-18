"""
Sanity-checks resolution_model.py end-to-end (fit -> save -> load -> predict)
with synthetic data. No database needed.

Run:
    python test_resolution_offline.py
"""
import numpy as np
import pandas as pd

from resolution_features import RESOLUTION_FEATURE_COLUMNS, DISRUPTION_TYPES
from resolution_model import ResolutionPredictor


def make_synthetic_dataset(n=500, seed=0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({c: rng.normal(size=n) for c in RESOLUTION_FEATURE_COLUMNS})

    n_alerts = 40
    df["alert_id"] = rng.integers(1, n_alerts + 1, size=n)
    df["zone_id"] = rng.integers(1, 6, size=n)

    # Longer remaining time when rainfall/traffic-drop/severity are higher —
    # gives the regressor a real (if simple) pattern to learn.
    base_hours = (
        1.0
        + 1.5 * df["rainfall"].clip(lower=0)
        + 1.2 * df["traffic_drop_ratio"].clip(lower=0)
        + 0.8 * df["severity_ordinal"].clip(lower=0)
        + rng.normal(scale=0.3, size=n)
    )
    df["label"] = base_hours.clip(lower=1 / 60)
    return df


def main():
    df = make_synthetic_dataset()
    predictor = ResolutionPredictor()
    metrics = predictor.fit(df)
    print("Trained on synthetic data. Metrics:", metrics)

    predictor.save()
    print("Saved. Reloading from disk...")
    reloaded = ResolutionPredictor.load()

    sample_row = {c: 0.0 for c in RESOLUTION_FEATURE_COLUMNS}
    sample_row["rainfall"] = 3.0
    sample_row["traffic_drop_ratio"] = 1.5
    sample_row["severity_ordinal"] = 3.0
    sample_row["disruption_is_traffic"] = 1.0

    result = reloaded.predict(sample_row)
    print("Prediction on a synthetic high-severity row:", result)

    assert result["hours_remaining_low"] <= result["hours_remaining_median"] <= result["hours_remaining_high"]
    assert 0.0 <= result["resolution_confidence"] <= 100.0
    print("\nOK — resolution_model.py pipeline works end-to-end.")


if __name__ == "__main__":
    main()
