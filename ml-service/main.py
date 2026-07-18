"""
Standalone ML microservice for DIS-RUPTURE.

Reads the SAME database as backend/worker (read-only) and serves early-warning
predictions: "how likely is a HIGH-severity disruption in this zone in the
next N hours?" It sits ALONGSIDE the existing rule-based engine (worker/engine.py),
not instead of it — see README.md for how to blend the two.

Endpoints:
  GET  /health              liveness check
  GET  /model/info          when the current model was trained, its metrics
  GET  /predict/{zone_id}   live prediction for one zone
  POST /train                retrain from current DB history (needs X-Train-Secret header)
"""
import logging

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import MODEL_PATH, RESOLUTION_MODEL_PATH, TRAIN_SECRET
from features import build_live_features
from resolution_features import build_live_features_for_alert
from model import RiskPredictor
from resolution_model import ResolutionPredictor
from train import run_training
from train_resolution import run_training as run_resolution_training

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ml_service.main")

app = FastAPI(title="DIS-RUPTURE ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your backend's origin in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_predictor: RiskPredictor | None = None
_resolution_predictor: ResolutionPredictor | None = None


def _get_predictor() -> RiskPredictor:
    global _predictor
    if _predictor is None:
        if not MODEL_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail="No trained model yet. Run `python train.py` or POST /train first.",
            )
        _predictor = RiskPredictor.load()
    return _predictor


def _get_resolution_predictor() -> ResolutionPredictor:
    global _resolution_predictor
    if _resolution_predictor is None:
        if not RESOLUTION_MODEL_PATH.exists():
            raise HTTPException(
                status_code=503,
                detail="No trained resolution model yet. Run `python train_resolution.py` or POST /train first.",
            )
        _resolution_predictor = ResolutionPredictor.load()
    return _resolution_predictor


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": MODEL_PATH.exists(),
        "resolution_model_loaded": RESOLUTION_MODEL_PATH.exists(),
    }


@app.get("/model/info")
def model_info():
    predictor = _get_predictor()
    return {
        "trained_at": predictor.trained_at,
        "horizon_hours": predictor.horizon_hours,
        "metrics": predictor.metrics,
        "feature_columns": predictor.feature_columns,
    }


@app.get("/model/resolution/info")
def resolution_model_info():
    predictor = _get_resolution_predictor()
    return {
        "trained_at": predictor.trained_at,
        "metrics": predictor.metrics,
        "feature_columns": predictor.feature_columns,
    }


@app.get("/predict/{zone_id}")
def predict(zone_id: int):
    predictor = _get_predictor()
    try:
        feature_row = build_live_features(zone_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    result = predictor.predict(feature_row)
    result["zone_id"] = zone_id
    return result


@app.get("/predict/resolution/{alert_id}")
def predict_resolution(alert_id: int):
    predictor = _get_resolution_predictor()
    try:
        feature_row = build_live_features_for_alert(alert_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    result = predictor.predict(feature_row)
    result["alert_id"] = alert_id
    return result


@app.post("/train")
def train(x_train_secret: str = Header(default="")):
    if not TRAIN_SECRET or x_train_secret != TRAIN_SECRET:
        raise HTTPException(status_code=401, detail="Missing or invalid X-Train-Secret header")
    global _predictor, _resolution_predictor
    metrics = run_training()
    _predictor = None  # force reload of the freshly-saved model on next request

    resolution_metrics = None
    resolution_error = None
    try:
        resolution_metrics = run_resolution_training()
        _resolution_predictor = None
    except Exception as e:
        # Early-warning training succeeding shouldn't be blocked by the
        # resolution model not having enough closed-alert data yet.
        resolution_error = str(e)

    return {
        "status": "trained",
        "metrics": metrics,
        "resolution_metrics": resolution_metrics,
        "resolution_training_skipped_reason": resolution_error,
    }
