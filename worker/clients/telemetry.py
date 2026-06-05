import logging
import random
from datetime import datetime

logger = logging.getLogger(__name__)

class JabodetabekTelemetryClient:
    """
    Mock hooks mimicking real-time ingestion from PetaBencana.id GeoJSON API
    and BPBD DKI Jabodetabek river gate telemetry sensors.
    """
    def __init__(self):
        pass

    def get_petabencana_active_floods(self) -> list:
        """
        Simulates parsing PetaBencana.id active flood reporting points.
        Returns a list of polygons/coordinates with active reports.
        """
        # Returns simple coordinates of active flood reports to match geofences
        # PetaBencana aggregates crowdsourced reports.
        logger.debug("[PetaBencana Hook] Ingesting active flood layers...")
        return [
            {
                "id": "PB-9428",
                "lat": -6.275,
                "lon": 106.815,
                "status": "confirmed_flood",
                "depth_cm": 45
            },
            {
                "id": "PB-1122",
                "lat": -6.160,
                "lon": 106.785,
                "status": "confirmed_flood",
                "depth_cm": 60
            }
        ]

    def get_river_gate_levels(self) -> dict:
        """
        Simulates retrieving BPBD DKI water level telemetry for main monitoring gates.
        Returns water levels (cm) and alert levels ('Normal', 'Siaga 4', 'Siaga 3', 'Siaga 2', 'Siaga 1').
        
        To trigger the Upstream Cascade Rule in dev, we introduce high water level events.
        """
        # Katulampa (Upstream Bogor)
        # Scale:
        # < 80cm: Normal
        # 80 - 120cm: Siaga 4 (Caution)
        # 120 - 150cm: Siaga 3 (Warning)
        # 150 - 200cm: Siaga 2 (Severe)
        # > 200cm: Siaga 1 (Critical)
        
        now = datetime.now()
        # Introduce a cycle where every few hours the upstream levels surge (simulating heavy mountain rain in Bogor)
        cycle_hour = now.hour % 6
        
        if cycle_hour == 3:
            # Simulate heavy rainfall in Bogor causing a sudden Upstream Cascade
            katulampa_level = random.randint(210, 260)  # Siaga 1 (Critical)
            manggarai_level = random.randint(780, 840)  # High level downstream
        elif cycle_hour == 4:
            # Receding but still severe upstream cascade
            katulampa_level = random.randint(160, 195)  # Siaga 2 (Severe)
            manggarai_level = random.randint(850, 920)  # Downstream peaks as water arrives!
        else:
            # Normal sunny weather upstream water levels
            katulampa_level = random.randint(40, 75)
            manggarai_level = random.randint(580, 640)

        # Classify alert levels
        katulampa_alert = self._classify_katulampa(katulampa_level)
        manggarai_alert = self._classify_manggarai(manggarai_level)

        logger.debug(f"[BPBD Telemetry Hook] Katulampa Level: {katulampa_level}cm ({katulampa_alert}), Manggarai: {manggarai_level}cm ({manggarai_alert})")

        return {
            "katulampa": {
                "water_level_cm": katulampa_level,
                "alert_level": katulampa_alert,
                "timestamp": now
            },
            "manggarai": {
                "water_level_cm": manggarai_level,
                "alert_level": manggarai_alert,
                "timestamp": now
            }
        }

    def _classify_katulampa(self, level: int) -> str:
        if level >= 200:
            return "Siaga 1"
        elif level >= 150:
            return "Siaga 2"
        elif level >= 120:
            return "Siaga 3"
        elif level >= 80:
            return "Siaga 4"
        return "Normal"

    def _classify_manggarai(self, level: int) -> str:
        # Manggarai gate (inside Jakarta core)
        # Normal < 750cm, Siaga 4 (750-800cm), Siaga 3 (800-850cm), Siaga 2 (850-950cm), Siaga 1 (>950cm)
        if level >= 950:
            return "Siaga 1"
        elif level >= 850:
            return "Siaga 2"
        elif level >= 800:
            return "Siaga 3"
        elif level >= 750:
            return "Siaga 4"
        return "Normal"
