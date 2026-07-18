"""
Sanity-checks model.py end-to-end (fit -> save -> load -> predict) using
synthetic data, so you can confirm the pipeline works before wiring up a
real database. Does NOT touch the network or config.DATABASE_URL.

Run:
    python test_offline.py
"""
import numpy as np
import pandas as pd

from features import FEATURE_COLUMNS
from model import RiskPredictor


def make_synthetic_dataset(n=400, seed=0) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    df = pd.DataFrame({c: rng.normal(size=n) for c in FEATURE_COLUMNS})
    df["zone_id"] = rng.integers(1, 6, size=n)

    # Make the label loosely depend on a few features so the model has
    # something real to learn (rather than pure noise).
    risk_signal = (
        2.0 * df["rainfall"].clip(lower=0)
        + 1.5 * df["traffic_drop_ratio"].clip(lower=0)
        + 1.0 * df["quake_energy_score"].clip(lower=0)
        + rng.normal(scale=0.5, size=n)
    )
    df["label"] = pd.cut(risk_signal, bins=[-np.inf, 0, 1.5, 3, np.inf], labels=[0, 1, 2, 3]).astype(int)
    return df


def main():
    df = make_synthetic_dataset()
    predictor = RiskPredictor()
    metrics = predictor.fit(df)
    print("Trained on synthetic data. Metrics:", metrics)

    predictor.save()
    print(f"Saved to {predictor.__class__}. Reloading from disk...")
    reloaded = RiskPredictor.load()

    sample_row = {c: 0.5 for c in FEATURE_COLUMNS}
    sample_row["rainfall"] = 3.0
    sample_row["traffic_drop_ratio"] = 2.0
    sample_row["quake_energy_score"] = 1.5
    result = reloaded.predict(sample_row)
    print("Prediction on a synthetic high-risk row:", result)

    assert result["predicted_severity"] in {"NONE", "LOW", "MEDIUM", "HIGH"}
    assert 0.0 <= result["probability_high"] <= 1.0
    print("\nOK — model.py pipeline works end-to-end.")


if __name__ == "__main__":
    main()
