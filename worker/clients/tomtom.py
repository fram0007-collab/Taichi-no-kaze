"""
TomTom Traffic Client — fixed field normalization
Returns:
  current_speed   : km/h
  congestion      : 0.0–1.0  (normalized from TomTom's 0–10 index)
  travel_time     : seconds delay (renamed from travel_delay for DB consistency)
"""
import requests
import logging
import random
import urllib3
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env", override=True)

from worker.clients.base import TrafficClient

logger = logging.getLogger(__name__)

TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "")
MOCK_SERVER_URL = os.getenv("MOCK_SERVER_URL", "").rstrip("/")

if MOCK_SERVER_URL:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class TomTomTrafficClient(TrafficClient):

    BASE_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

    def get_flow_data(
        self, zone_name: str, baseline_speed: float,
        latitude: float, longitude: float, db=None
    ) -> dict:
        if MOCK_SERVER_URL:
            url = f"{MOCK_SERVER_URL}/traffic/services/4/flowSegmentData/absolute/10/json"
        else:
            url = self.BASE_URL

        # Skip live call if no key configured
        if not TOMTOM_API_KEY and not MOCK_SERVER_URL:
            logger.debug(f"[TomTom] No API key — using simulator for {zone_name}")
            return self._simulate(zone_name, baseline_speed)

        try:
            params = {
                "key": TOMTOM_API_KEY,
                "point": f"{latitude},{longitude}",
                "unit": "KMPH",
                "thickness": 1,
            }
            resp = requests.get(
                url, params=params, timeout=10,
                verify=not bool(MOCK_SERVER_URL),
            )

            if resp.status_code == 200:
                seg = resp.json().get("flowSegmentData", {})
                current_speed = float(seg.get("currentSpeed", baseline_speed))
                free_flow = float(seg.get("freeFlowSpeed", baseline_speed))
                travel_delay = max(0.0, float(seg.get("currentTravelTime", 0))
                                   - float(seg.get("freeFlowTravelTime", 0)))

                # Normalize congestion to 0–1
                speed_ratio = current_speed / max(1.0, free_flow)
                congestion = round(max(0.0, min(1.0, 1.0 - speed_ratio)), 4)

                logger.info(f"[TomTom] {zone_name}: {current_speed:.1f} km/h  congestion={congestion:.2f}")
                return {
                    "current_speed": current_speed,
                    "congestion": congestion,       # 0–1, normalized
                    "travel_time": travel_delay,    # seconds
                }
            else:
                logger.warning(
                    f"[TomTom] HTTP {resp.status_code} for {zone_name} — "
                    f"using simulator (quota exceeded or invalid key)"
                )
                return self._simulate(zone_name, baseline_speed)

        except Exception as e:
            logger.error(f"[TomTom] Request failed for {zone_name}: {e} — using simulator")
            return self._simulate(zone_name, baseline_speed)

    def _simulate(self, zone_name: str, baseline_speed: float) -> dict:
        now = datetime.now()
        t = now.hour + now.minute / 60.0
        is_peak = (7.0 <= t <= 9.0) or (17.0 <= t <= 19.5)
        noise = random.uniform(-0.05, 0.05)

        if is_peak:
            drop = random.uniform(0.35, 0.55) - noise
            speed = max(5.0, baseline_speed * (1.0 - drop))
            delay = random.uniform(120.0, 240.0)
            congestion = round(random.uniform(0.60, 0.92), 4)
        else:
            drop = random.uniform(-0.10, 0.15) - noise
            speed = min(baseline_speed * 1.15, max(5.0, baseline_speed * (1.0 - drop)))
            delay = random.uniform(5.0, 30.0)
            congestion = round(max(0.0, min(0.50, 1.0 - speed / baseline_speed)), 4)

        # Zone-specific tweaks
        if "Kemang" in zone_name:
            speed *= 0.90
            congestion = min(1.0, congestion * 1.20)
        elif "Sudirman" in zone_name and is_peak:
            speed *= 0.80
            congestion = min(1.0, congestion * 1.10)
        elif "Tanah Abang" in zone_name:
            speed *= 0.85
            congestion = min(1.0, congestion * 1.15)

        speed = round(max(5.0, speed), 2)
        logger.debug(f"[TomTom Sim] {zone_name}: {speed} km/h  congestion={congestion}")
        return {
            "current_speed": speed,
            "congestion": congestion,   # 0–1
            "travel_time": round(delay, 1),
        }
