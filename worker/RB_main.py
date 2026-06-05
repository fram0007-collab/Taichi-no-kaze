"""
Background Ingestion Worker — Neon PostgreSQL Edition
======================================================
APScheduler jobs:
  - traffic_ingestion   : every 15 min → traffic_snapshots
  - weather_ingestion   : every 30 min → weather_snapshots
  - crowd_ingestion     : every 15 min → crowd_snapshots  (new dimension)
  - earthquake_ingestion: every 15 min → earthquake_events
  - scoring_cycle       : every 15 min → zone_status + risk_alerts

Oracle-specific calls removed:
  - SDO_UTIL.TO_GEOJSON  → not needed; zones use lat/lon
  - SELECT 1 FROM DUAL   → SELECT 1
  - oracledb wallet      → psycopg2 / asyncpg with sslmode=require
"""

import logging
import sys
import time
import math
import uuid
from datetime import datetime, timedelta
from apscheduler.schedulers.blocking import BlockingScheduler
from sqlalchemy import text

from worker.database import get_db_session
from worker.models import (
    Zone, TrafficSnapshot, WeatherSnapshot,
    CrowdSnapshot, EarthquakeEvent, PoiMaster
)
from worker.config import TRAFFIC_PROVIDER, GOOGLE_MAPS_API_KEY
from worker.clients.tomtom import TomTomTrafficClient
from worker.clients.google import GoogleTrafficClient
from worker.clients.openmeteo import OpenMeteoClient
from worker.clients.telemetry import JabodetabekTelemetryClient
from worker.clients.bmkg import BMKGClient
from worker.engine import PredictiveDisruptionEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("worker")


class IngestionWorker:
    def __init__(self):
        if TRAFFIC_PROVIDER == "google":
            self.traffic_client = GoogleTrafficClient(api_key=GOOGLE_MAPS_API_KEY)
            logger.info("[Traffic] Provider: Google Maps")
        else:
            self.traffic_client = TomTomTrafficClient()
            logger.info("[Traffic] Provider: TomTom")

        self.weather_client = OpenMeteoClient()
        self.telemetry_client = JabodetabekTelemetryClient()
        self.bmkg_client = BMKGClient()
        self.engine = PredictiveDisruptionEngine()

    # ── Traffic ────────────────────────────────────────────────────────────
    def run_traffic_ingestion(self):
        logger.info("[Ingestion] Traffic ingestion starting...")
        db = get_db_session()
        try:
            zones = db.query(Zone).all()
            now = datetime.utcnow()
            for zone in zones:
                try:
                    flow = self.traffic_client.get_flow_data(
                        zone.name,
                        float(zone.traffic_speed_baseline or 40.0),
                        float(zone.latitude),
                        float(zone.longitude),
                        db=db,
                    )
                    db.add(TrafficSnapshot(
                        zone_id=zone.zone_id,
                        timestamp=now,
                        speed=flow.get("current_speed", flow.get("speed")),
                        congestion=flow.get("congestion"),
                        travel_time=flow.get("travel_time"),
                    ))
                except Exception as ze:
                    logger.warning(f"[Traffic] Zone {zone.name} failed: {ze}")
            db.commit()
            logger.info(f"[Ingestion] Traffic done for {len(zones)} zones.")
        except Exception as e:
            db.rollback()
            logger.error(f"[Ingestion] Traffic error: {e}")
        finally:
            db.close()

    # ── Weather ────────────────────────────────────────────────────────────
    def run_weather_ingestion(self):
        logger.info("[Ingestion] Weather ingestion starting...")
        db = get_db_session()
        try:
            zones = db.query(Zone).all()
            for zone in zones:
                try:
                    forecasts = self.weather_client.get_24h_forecast(
                        zone.name, float(zone.latitude), float(zone.longitude)
                    )
                    # Replace existing future weather snapshots for this zone
                    now = datetime.utcnow()
                    db.query(WeatherSnapshot).filter(
                        WeatherSnapshot.zone_id == zone.zone_id,
                        WeatherSnapshot.timestamp >= now,
                    ).delete()

                    for hr in forecasts:
                        db.add(WeatherSnapshot(
                            zone_id=zone.zone_id,
                            timestamp=hr["timestamp"],
                            rainfall=hr.get("rainfall", 0.0),
                            humidity=hr.get("humidity", 70.0),
                            wind_speed=hr.get("wind_speed", 0.0),
                        ))
                except Exception as ze:
                    logger.warning(f"[Weather] Zone {zone.name} failed: {ze}")
            db.commit()
            logger.info(f"[Ingestion] Weather done for {len(zones)} zones.")
        except Exception as e:
            db.rollback()
            logger.error(f"[Ingestion] Weather error: {e}")
        finally:
            db.close()

    # ── Crowd ──────────────────────────────────────────────────────────────
    def run_crowd_ingestion(self):
        """
        Ingests crowd density snapshot for each zone.
        poi_count = number of active POIs within zone radius (from poi_master)
        hazard_count = POIs tagged as hazard (category containing 'hazard' or 'risk')
        crowd_score is computed by the engine; here we just record the raw inputs.
        """
        logger.info("[Ingestion] Crowd ingestion starting...")
        db = get_db_session()
        try:
            zones = db.query(Zone).all()
            now = datetime.utcnow()

            for zone in zones:
                try:
                    # Count POIs assigned to this zone
                    poi_count = db.query(PoiMaster).filter(
                        PoiMaster.zone_id == zone.zone_id
                    ).count()

                    # Hazard POIs: categories that indicate risk (extend as needed)
                    hazard_count = db.query(PoiMaster).filter(
                        PoiMaster.zone_id == zone.zone_id,
                        PoiMaster.category.ilike("%hazard%"),
                    ).count()

                    db.add(CrowdSnapshot(
                        zone_id=zone.zone_id,
                        timestamp=now,
                        poi_count=poi_count,
                        hazard_count=hazard_count,
                        # crowd_score and confidence_score written by engine
                        crowd_score=None,
                        confidence_score=None,
                    ))
                except Exception as ze:
                    logger.warning(f"[Crowd] Zone {zone.name} failed: {ze}")
            db.commit()
            logger.info(f"[Ingestion] Crowd done for {len(zones)} zones.")
        except Exception as e:
            db.rollback()
            logger.error(f"[Ingestion] Crowd error: {e}")
        finally:
            db.close()

    # ── Earthquake ─────────────────────────────────────────────────────────
    def run_earthquake_ingestion(self):
        logger.info("[Ingestion] Earthquake ingestion starting...")
        db = get_db_session()
        try:
            quakes = self.bmkg_client.get_recent_earthquakes()
            new_count = 0
            for eq in quakes:
                event_id = eq.get("event_id", "")
                if not event_id:
                    continue

                exists = db.query(EarthquakeEvent).filter(
                    EarthquakeEvent.event_id == event_id
                ).first()
                if not exists:
                    mag = float(eq.get("magnitude", 0.0))
                    depth_km = float(eq.get("depth_km", 10.0))
                    impact_km = float(eq.get("impact_radius_km", mag * 15))
                    eq_dt = eq.get("datetime")
                    if not isinstance(eq_dt, datetime):
                        eq_dt = datetime.utcnow()

                    db.add(EarthquakeEvent(
                        event_id=event_id,
                        magnitude=mag,
                        depth_km=depth_km,
                        latitude=float(eq.get("latitude", 0.0)),
                        longitude=float(eq.get("longitude", 0.0)),
                        event_timestamp=eq_dt,
                        location=eq.get("wilayah", ""),
                        impact_radius_km=impact_km,
                    ))
                    new_count += 1
            db.commit()
            logger.info(f"[Ingestion] Earthquake done. Added {new_count} new events.")
        except Exception as e:
            db.rollback()
            logger.error(f"[Ingestion] Earthquake error: {e}")
        finally:
            db.close()

    # ── Scoring Cycle ──────────────────────────────────────────────────────
    def run_scoring_cycle(self):
        logger.info("[Analytics] Scoring cycle starting...")
        db = get_db_session()
        try:
            self.engine.run_analysis(db)
        except Exception as e:
            logger.error(f"[Analytics] Scoring error: {e}")
        finally:
            db.close()

    # ── Full sweep ─────────────────────────────────────────────────────────
    def execute_all(self):
        logger.info("[Sync] Full ingestion sweep starting...")
        self.run_earthquake_ingestion()
        self.run_traffic_ingestion()
        self.run_weather_ingestion()
        self.run_crowd_ingestion()
        self.run_scoring_cycle()
        logger.info("[Sync] Full sweep complete.")


def wait_for_db_ready():
    logger.info("Verifying Neon PostgreSQL connectivity...")
    retries = 30
    while retries > 0:
        db = None
        try:
            db = get_db_session()
            db.execute(text("SELECT 1"))   # PostgreSQL — no DUAL needed
            logger.info("Neon database connection established.")
            return
        except Exception as e:
            logger.warning(f"DB not ready yet ({e}). Retrying in 2s... ({retries} left)")
            time.sleep(2)
            retries -= 1
        finally:
            if db:
                db.close()
    logger.critical("Could not connect to Neon database. Worker terminating.")
    sys.exit(1)


if __name__ == "__main__":
    logger.info("Starting Neon PostgreSQL Ingestion Worker...")
    wait_for_db_ready()

    worker = IngestionWorker()
    logger.info("Running initial full sweep on startup...")
    worker.execute_all()

    scheduler = BlockingScheduler()

    scheduler.add_job(
        worker.run_earthquake_ingestion, "interval", minutes=15,
        next_run_time=datetime.now(), id="earthquake_ingestion",
    )
    scheduler.add_job(
        worker.run_traffic_ingestion, "interval", minutes=15,
        next_run_time=datetime.now(), id="traffic_ingestion",
    )
    scheduler.add_job(
        worker.run_weather_ingestion, "interval", minutes=30,
        next_run_time=datetime.now(), id="weather_ingestion",
    )
    scheduler.add_job(
        worker.run_crowd_ingestion, "interval", minutes=15,
        next_run_time=datetime.now(), id="crowd_ingestion",
    )
    scheduler.add_job(
        worker.run_scoring_cycle, "interval", minutes=15,
        next_run_time=datetime.now(), id="predictive_scoring",
    )

    try:
        logger.info("APScheduler running. Jobs active.")
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Worker gracefully stopped.")
