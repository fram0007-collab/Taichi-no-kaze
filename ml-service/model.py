"""
Thin wrapper around a scikit-learn pipeline that predicts, per zone, the
probability of a HIGH-severity disruption in the next N hours (see
features.PREDICTION_HORIZON_HOURS), plus the most likely severity class.

Model: GradientBoostingClassifier over an ordinal label {0,1,2,3} =
{no alert, LOW, MEDIUM, HIGH}. Missing sensor readings (e.g. a zone with no
nearby waterway) are median-imputed rather than dropped, since real rows
will often be missing one or two series.
"""
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

from config import MODEL_PATH, PREDICTION_HORIZON_HOURS
from features import FEATURE_COLUMNS

SEVERITY_LABELS = {0: "NONE", 1: "LOW", 2: "MEDIUM", 3: "HIGH"}


@dataclass
class TrainMetrics:
    n_samples: int
    n_zones: int
    class_balance: dict
    accuracy: float
    high_precision: float
    high_recall: float


@dataclass
class RiskPredictor:
    pipeline: Pipeline = field(default_factory=lambda: Pipeline([
        ("impute", SimpleImputer(strategy="median")),
        ("clf", GradientBoostingClassifier(
            n_estimators=200,
            max_depth=3,
            learning_rate=0.05,
            random_state=42,
        )),
    ]))
    feature_columns: list = field(default_factory=lambda: list(FEATURE_COLUMNS))
    horizon_hours: int = PREDICTION_HORIZON_HOURS
    trained_at: str | None = None
    metrics: dict | None = None

    def fit(self, df: pd.DataFrame) -> TrainMetrics:
        X = df[self.feature_columns].astype(float)
        y = df["label"].astype(int)
        self.pipeline.fit(X, y)

        preds = self.pipeline.predict(X)
        acc = float((preds == y).mean())
        high_mask_true = (y == 3)
        high_mask_pred = (preds == 3)
        tp = int((high_mask_true & high_mask_pred).sum())
        precision = tp / max(1, int(high_mask_pred.sum()))
        recall = tp / max(1, int(high_mask_true.sum()))

        metrics = TrainMetrics(
            n_samples=len(df),
            n_zones=int(df["zone_id"].nunique()),
            class_balance={SEVERITY_LABELS[k]: int(v) for k, v in y.value_counts().to_dict().items()},
            accuracy=round(acc, 4),
            high_precision=round(precision, 4),
            high_recall=round(recall, 4),
        )
        self.metrics = metrics.__dict__
        return metrics

    def predict(self, feature_row: dict) -> dict:
        X = pd.DataFrame([{c: feature_row.get(c, np.nan) for c in self.feature_columns}]).astype(float)
        proba = self.pipeline.predict_proba(X)[0]
        classes = self.pipeline.named_steps["clf"].classes_
        proba_by_class = {SEVERITY_LABELS[int(c)]: round(float(p), 4) for c, p in zip(classes, proba)}
        pred_class = int(classes[np.argmax(proba)])
        return {
            "predicted_severity": SEVERITY_LABELS[pred_class],
            "probability_high": proba_by_class.get("HIGH", 0.0),
            "probabilities": proba_by_class,
            "horizon_hours": self.horizon_hours,
        }

    def to_artifact(self) -> dict:
        """Plain-dict form (sklearn objects + primitives only, no custom
        classes). This is what actually gets saved — so anything unpickling
        it later (e.g. a Vercel serverless function) only needs scikit-learn
        installed, not this module's RiskPredictor class."""
        return {
            "pipeline": self.pipeline,
            "feature_columns": self.feature_columns,
            "horizon_hours": self.horizon_hours,
            "trained_at": self.trained_at,
            "metrics": self.metrics,
        }

    def save(self, path=MODEL_PATH):
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.to_artifact(), path)

    @staticmethod
    def load(path=MODEL_PATH) -> "RiskPredictor":
        artifact = joblib.load(path)
        predictor = RiskPredictor(
            pipeline=artifact["pipeline"],
            feature_columns=artifact["feature_columns"],
            horizon_hours=artifact["horizon_hours"],
        )
        predictor.trained_at = artifact["trained_at"]
        predictor.metrics = artifact["metrics"]
        return predictor
