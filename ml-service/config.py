import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL", "")
TRAIN_SECRET = os.getenv("TRAIN_SECRET", "")
PREDICTION_HORIZON_HOURS = int(os.getenv("PREDICTION_HORIZON_HOURS", "3"))

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_PATH = MODEL_DIR / "risk_predictor.joblib"
RESOLUTION_MODEL_PATH = MODEL_DIR / "resolution_predictor.joblib"
