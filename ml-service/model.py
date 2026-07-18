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
from sklearn.model_selection import GroupShuffleSplit
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
    holdout_evaluated: bool
    holdout_note: str | None = None


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
        groups = df["zone_id"]
        n_groups = groups.nunique()

        # Held out by ZONE, not by random row: consecutive anchor rows from
        # the same zone are ~15 minutes apart and nearly identical, so a
        # random row split would let the model "cheat" by seeing near-copies
        # of test rows during training. Holding out whole zones instead
        # gives an honest read on how the model does on a zone/situation
        # it hasn't seen — closer to what matters in production.
        holdout_evaluated = False
        holdout_note = None
        acc, precision, recall = None, None, None

        if n_groups >= 5:
            splitter = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42)
            train_idx, test_idx = next(splitter.split(X, y, groups=groups))
            X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
            y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

            eval_pipeline = Pipeline([step for step in self.pipeline.steps])
            eval_pipeline.fit(X_train, y_train)
            preds = eval_pipeline.predict(X_test)

            acc = float((preds == y_test).mean())
            high_true = (y_test == 3)
            high_pred = (preds == 3)
            tp = int((high_true & high_pred).sum())
            precision = tp / max(1, int(high_pred.sum()))
            recall = tp / max(1, int(high_true.sum()))
            holdout_evaluated = True
            holdout_note = f"Evaluated on {groups.iloc[test_idx].nunique()} held-out zones the model never trained on."
        else:
            holdout_note = (
                f"Only {n_groups} zones have data — too few for a meaningful held-out split "
                "(need >= 5). Metrics below are training-fit only and likely overstate real "
                "performance. Treat them as provisional until more zones have accumulated history."
            )

        # Final model shipped to production trains on ALL available data —
        # holding data back permanently would waste it. The split above is
        # purely to get an honest metric; it doesn't change what gets saved.
        self.pipeline.fit(X, y)

        if not holdout_evaluated:
            preds_train = self.pipeline.predict(X)
            acc = float((preds_train == y).mean())
            high_true = (y == 3)
            high_pred = (preds_train == 3)
            tp = int((high_true & high_pred).sum())
            precision = tp / max(1, int(high_pred.sum()))
            recall = tp / max(1, int(high_true.sum()))

        metrics = TrainMetrics(
            n_samples=len(df),
            n_zones=int(df["zone_id"].nunique()),
            class_balance={SEVERITY_LABELS[k]: int(v) for k, v in y.value_counts().to_dict().items()},
            accuracy=round(acc, 4),
            high_precision=round(precision, 4),
            high_recall=round(recall, 4),
            holdout_evaluated=holdout_evaluated,
            holdout_note=holdout_note,
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
