"""
Predicts hours-remaining-until-resolution for a currently OPEN alert.

Trains THREE GradientBoostingRegressor models at different quantiles
(0.1 / 0.5 / 0.9) rather than one point-estimate regressor, so we get a real
predictive interval instead of a single number pretending to be precise:
  - median   -> the headline estimate (like the existing rule-based ETA)
  - low/high -> a confidence band; a wide gap = "this one's genuinely hard
    to call," a narrow gap = "the model's seen this pattern before and it's
    consistent." That gap is converted into a 0-100 confidence score using
    the same convention the existing rule-based `resolution_confidence`
    field already uses, so the frontend badge logic doesn't need to change.
"""
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

from config import RESOLUTION_MODEL_PATH
from resolution_features import RESOLUTION_FEATURE_COLUMNS


def _make_pipeline(alpha: float) -> Pipeline:
    return Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("reg", GradientBoostingRegressor(
            loss="quantile",
            alpha=alpha,
            n_estimators=150,
            max_depth=3,
            learning_rate=0.05,
            random_state=42,
        )),
    ])


@dataclass
class ResolutionTrainMetrics:
    n_samples: int
    n_alerts: int
    median_abs_error_hours: float
    coverage_within_interval: float  # fraction of true values that fell inside [low, high]


@dataclass
class ResolutionPredictor:
    low_pipeline: Pipeline = field(default_factory=lambda: _make_pipeline(0.1))
    median_pipeline: Pipeline = field(default_factory=lambda: _make_pipeline(0.5))
    high_pipeline: Pipeline = field(default_factory=lambda: _make_pipeline(0.9))
    feature_columns: list = field(default_factory=lambda: list(RESOLUTION_FEATURE_COLUMNS))
    trained_at: str | None = None
    metrics: dict | None = None

    def fit(self, df: pd.DataFrame) -> ResolutionTrainMetrics:
        X = df[self.feature_columns].astype(float)
        y = df["label"].astype(float)  # remaining hours

        self.low_pipeline.fit(X, y)
        self.median_pipeline.fit(X, y)
        self.high_pipeline.fit(X, y)

        pred_low = self.low_pipeline.predict(X)
        pred_med = self.median_pipeline.predict(X)
        pred_high = self.high_pipeline.predict(X)

        mae = float(np.median(np.abs(pred_med - y.values)))
        # Guard against quantile crossover (low > high) before checking coverage
        lo = np.minimum(pred_low, pred_high)
        hi = np.maximum(pred_low, pred_high)
        coverage = float(((y.values >= lo) & (y.values <= hi)).mean())

        metrics = ResolutionTrainMetrics(
            n_samples=len(df),
            n_alerts=int(df["alert_id"].nunique()) if "alert_id" in df.columns else -1,
            median_abs_error_hours=round(mae, 2),
            coverage_within_interval=round(coverage, 3),
        )
        self.metrics = metrics.__dict__
        return metrics

    def predict(self, feature_row: dict) -> dict:
        X = pd.DataFrame([{c: feature_row.get(c, np.nan) for c in self.feature_columns}]).astype(float)
        low = float(self.low_pipeline.predict(X)[0])
        med = float(self.median_pipeline.predict(X)[0])
        high = float(self.high_pipeline.predict(X)[0])

        # Guard against quantile crossover
        low, high = min(low, high), max(low, high)
        med = min(max(med, low), high)

        hours_median = max(1 / 60, med)
        interval_width = max(0.0, high - low)
        # Wider interval relative to the estimate itself = lower confidence.
        # Same 0-100 scale, same rough shape as the rule-based confidence
        # values already used elsewhere (45-90 for well-understood cases).
        relative_spread = interval_width / max(1.0, hours_median)
        confidence = max(30.0, min(90.0, 90.0 - relative_spread * 25.0))

        return {
            "hours_remaining_low": round(low, 2),
            "hours_remaining_median": round(hours_median, 2),
            "hours_remaining_high": round(high, 2),
            "resolution_confidence": round(confidence, 1),
        }

    def to_artifact(self) -> dict:
        return {
            "low_pipeline": self.low_pipeline,
            "median_pipeline": self.median_pipeline,
            "high_pipeline": self.high_pipeline,
            "feature_columns": self.feature_columns,
            "trained_at": self.trained_at,
            "metrics": self.metrics,
        }

    def save(self, path=RESOLUTION_MODEL_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.to_artifact(), path)

    @staticmethod
    def load(path=RESOLUTION_MODEL_PATH) -> "ResolutionPredictor":
        artifact = joblib.load(path)
        predictor = ResolutionPredictor(
            low_pipeline=artifact["low_pipeline"],
            median_pipeline=artifact["median_pipeline"],
            high_pipeline=artifact["high_pipeline"],
            feature_columns=artifact["feature_columns"],
        )
        predictor.trained_at = artifact["trained_at"]
        predictor.metrics = artifact["metrics"]
        return predictor
