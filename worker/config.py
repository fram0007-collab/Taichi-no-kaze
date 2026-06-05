import os
from pathlib import Path
from dotenv import load_dotenv

# Explicit path — works regardless of where the worker is launched from
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
TRAFFIC_PROVIDER = os.getenv("TRAFFIC_PROVIDER", "tomtom").lower().strip()
MOCK_SERVER_URL = os.getenv("MOCK_SERVER_URL", "").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", "")
