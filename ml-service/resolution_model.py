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
from sklearn.model_selection import GroupShuffleSplit
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
    holdout_evaluated: bool
    holdout_note: str | None = None


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
        groups = df["alert_id"] if "alert_id" in df.columns else None
        n_groups = groups.nunique() if groups is not None else 0

        # Held out by ALERT, not by random row: a single alert contributes
        # MANY rows (one per signal reading during its whole open window),
        # all describing the same event. A random row split would train and
        # test on rows from the SAME alert — the model doesn't have to
        # generalize at all, it just has to remember that alert. That's
        # exactly what produced 0.0 error / 100% coverage before this fix:
        # not genuine skill, just memorization made to look perfect.
        holdout_evaluated = False
        holdout_note = None
        mae, coverage = None, None

        if n_groups >= 5:
            splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
            train_idx, test_idx = next(splitter.split(X, y, groups=groups))
            X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
            y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

            eval_low = Pipeline([step for step in self.low_pipeline.steps]).fit(X_train, y_train)
            eval_med = Pipeline([step for step in self.median_pipeline.steps]).fit(X_train, y_train)
            eval_high = Pipeline([step for step in self.high_pipeline.steps]).fit(X_train, y_train)

            pred_low = eval_low.predict(X_test)
            pred_med = eval_med.predict(X_test)
            pred_high = eval_high.predict(X_test)

            mae = float(np.median(np.abs(pred_med - y_test.values)))
            lo = np.minimum(pred_low, pred_high)
            hi = np.maximum(pred_low, pred_high)
            coverage = float(((y_test.values >= lo) & (y_test.values <= hi)).mean())
            holdout_evaluated = True
            holdout_note = f"Evaluated on {groups.iloc[test_idx].nunique()} held-out alerts the model never trained on."
        else:
            holdout_note = (
                f"Only {n_groups} closed alerts available — too few for a meaningful held-out split "
                "(need >= 5). Metrics below are training-fit only and almost certainly overstate real "
                "performance (a model this size can memorize a few dozen examples). Treat this model's "
                "predictions as provisional until more alerts have closed."
            )

        # Final model shipped to production trains on ALL available data.
        self.low_pipeline.fit(X, y)
        self.median_pipeline.fit(X, y)
        self.high_pipeline.fit(X, y)

        if not holdout_evaluated:
            pred_low = self.low_pipeline.predict(X)
            pred_med = self.median_pipeline.predict(X)
            pred_high = self.high_pipeline.predict(X)
            mae = float(np.median(np.abs(pred_med - y.values)))
            lo = np.minimum(pred_low, pred_high)
            hi = np.maximum(pred_low, pred_high)
            coverage = float(((y.values >= lo) & (y.values <= hi)).mean())

        metrics = ResolutionTrainMetrics(
            n_samples=len(df),
            n_alerts=int(df["alert_id"].nunique()) if "alert_id" in df.columns else -1,
            median_abs_error_hours=round(mae, 2),
            coverage_within_interval=round(coverage, 3),
            holdout_evaluated=holdout_evaluated,
            holdout_note=holdout_note,
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
