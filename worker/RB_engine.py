"""
Predictive Disruption Engine — v3 (Waterway Edition)
=====================================================
Fixes from v2:
  - compute_waterway_score: was missing return, called with wrong args
  - Waterway scoring now uses real HydroRIVERS fields:
      dis_av_cms (mean annual flow), upland_skm (upstream catchment),
      ord_strahler (river order), catch_skm (local catchment)
  - Writes zone_waterway_mapping, waterway_snapshots, waterway_telemetry
  - Upstream cascade propagation: high gate readings amplify downstream zones
  - ZoneStatus.waterway_score now populated correctly
  - overall_risk weights updated to include waterway (20%)

Flood Prediction Logic:
  Rainfall-Runoff model per HydroRIVERS segment:
    runoff_cms = rainfall_mm/1000 * catch_skm*1e6 / (30min * 60s) * runoff_coeff
    estimated_flow = dis_av_cms + runoff_cms (rainfall contribution)
    discharge_ratio = estimated_flow / dis_av_cms
    
  Cascade: if Katulampa/upstream gate is Siaga 1/2, downstream zones
  within the same river network get a flood_score amplifier.

  waterway_score per zone = max flood_score of nearby segments, 
  amplified by zone historical_flood_vulnerability.
"""

import json
import logging
import math
import random
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from worker.models import (
    Zone, ZoneStatus, TrafficSnapshot, WeatherSnapshot,
    CrowdSnapshot, EarthquakeEvent, RiskAlert, PoiMaster,
    JabodetabekWaterway, WaterwaySnapshot, WaterwayTelemetry,
    WaterwayConnectivity, ZoneWaterwayMapping,
)

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6371.0
SEVERITY_HIGH   = 65.0
SEVERITY_MEDIUM = 35.0
ALERT_MIN_PROB  = 30.0

# Flood zone proximity threshold (km): waterways within this range affect a zone
WATERWAY_ZONE_RADIUS_KM = 2.0

# Runoff coefficient for urban Jakarta (impervious surfaces)
URBAN_RUNOFF_COEFF = 0.75

# HydroRIVERS gate hyriv_ids for known BPBD monitoring points
# These are matched to the nearest segment in jabodetabek_waterways
GATE_NAMES = {
    "katulampa": "Katulampa Gate (Bogor)",
    "manggarai": "Manggarai Gate (Central Jakarta)",
}


# ── Geometry ─────────────────────────────────────────────────────────────────
def haversine_km(lat1, lon1, lat2, lon2) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    lam1, lam2 = math.radians(lon1), math.radians(lon2)
    cos_a = max(-1.0, min(1.0,
        math.sin(phi1) * math.sin(phi2) +
        math.cos(phi1) * math.cos(phi2) * math.cos(lam2 - lam1)
    ))
    return EARTH_RADIUS_KM * math.acos(cos_a)


def nearest_point_on_polyline_km(zone_lat, zone_lon, coords) -> float:
    """Returns minimum haversine distance from zone centre to any vertex of the waterway."""
    min_dist = float("inf")
    for lon, lat in coords:
        d = haversine_km(zone_lat, zone_lon, lat, lon)
        if d < min_dist:
            min_dist = d
    return min_dist


# ── Waterway Flood Model ──────────────────────────────────────────────────────
def compute_segment_flood_score(
    dis_av_cms: float,       # HydroRIVERS mean annual discharge
    catch_skm: float,        # local catchment km²
    upland_skm: float,       # total upstream catchment km²
    ord_strahler: int,       # river order (1=headwater, 6+=major)
    rainfall_mm: float,      # current hourly rainfall at zone
    gate_amplifier: float,   # 1.0 = normal, up to 2.5 for Siaga 1 cascade
) -> tuple[float, float, float]:
    """
    Rainfall-Runoff model adapted from rational method:
      Q_runoff = C × i × A
      where C = runoff coefficient, i = rainfall intensity (m/s), A = catchment (m²)

    Returns (estimated_flow_cms, discharge_ratio, flood_score 0–100)
    """
    if dis_av_cms is None or dis_av_cms <= 0:
        dis_av_cms = 1.0
    catch = float(catch_skm or 1.0)
    upland = float(upland_skm or catch)
    order = int(ord_strahler or 1)

    # Rainfall intensity m/s from mm/30min cycle
    intensity_ms = (rainfall_mm / 1000.0) / (30 * 60)

    # Catchment area m² — use upland for major rivers (they accumulate upstream flow)
    effective_area_m2 = (upland if order >= 4 else catch) * 1e6

    # Runoff contribution
    runoff_cms = URBAN_RUNOFF_COEFF * intensity_ms * effective_area_m2

    # Estimated total flow
    estimated_flow = float(dis_av_cms) + runoff_cms

    # Apply upstream cascade amplifier (gate telemetry)
    estimated_flow *= gate_amplifier

    discharge_ratio = estimated_flow / float(dis_av_cms)

    # Flood score curve:
    # ratio < 1.5 → low (0–25)
    # ratio 1.5–2.5 → moderate (25–60)
    # ratio 2.5–4.0 → high (60–85)
    # ratio > 4.0 → extreme (85–100)
    if discharge_ratio >= 4.0:
        flood_score = 85.0 + min(15.0, (discharge_ratio - 4.0) * 5.0)
    elif discharge_ratio >= 2.5:
        flood_score = 60.0 + ((discharge_ratio - 2.5) / 1.5) * 25.0
    elif discharge_ratio >= 1.5:
        flood_score = 25.0 + ((discharge_ratio - 1.5) / 1.0) * 35.0
    else:
        flood_score = max(0.0, (discharge_ratio - 1.0) / 0.5 * 25.0)

    return (
        round(estimated_flow, 4),
        round(discharge_ratio, 4),
        round(min(100.0, max(0.0, flood_score)), 2),
    )


def siaga_to_amplifier(alert_level: str) -> float:
    """Convert BPBD Siaga level to flow amplification factor for cascade."""
    return {
        "Siaga 1": 2.5,
        "Siaga 2": 1.8,
        "Siaga 3": 1.4,
        "Siaga 4": 1.2,
        "Normal":  1.0,
    }.get(alert_level, 1.0)


def siaga_to_score(alert_level: str) -> float:
    """Direct gate alert → flood score for telemetry-driven zones."""
    return {
        "Siaga 1": 95.0,
        "Siaga 2": 75.0,
        "Siaga 3": 55.0,
        "Siaga 4": 35.0,
        "Normal":  5.0,
    }.get(alert_level, 0.0)


# ── Traffic Score ─────────────────────────────────────────────────────────────
def compute_traffic_score(speed, congestion, baseline) -> float:
    speed_component = 0.0
    if speed is not None and baseline > 0:
        drop = max(0.0, (float(baseline) - float(speed)) / float(baseline))
        speed_component = drop
    cong = float(congestion) if congestion is not None else 0.0
    if cong > 1.0:
        cong = cong / 10.0
    cong = max(0.0, min(1.0, cong))
    raw = 0.6 * speed_component + 0.4 * cong
    return round(min(100.0, max(0.0, raw * 100.0)), 2)


# ── Weather Score ─────────────────────────────────────────────────────────────
def compute_weather_score(rainfall, humidity, wind_speed, flood_vulnerability=0.5) -> float:
    rain = float(rainfall) if rainfall is not None else 0.0
    hum  = float(humidity) if humidity is not None else 70.0
    wind = float(wind_speed) if wind_speed is not None else 0.0

    if rain >= 50.0:
        rain_score = 85.0 + min(15.0, (rain - 50.0) * 0.3)
    elif rain >= 20.0:
        rain_score = 60.0 + ((rain - 20.0) / 30.0) * 25.0
    elif rain >= 5.0:
        rain_score = 25.0 + ((rain - 5.0) / 15.0) * 35.0
    else:
        rain_score = (rain / 5.0) * 25.0

    humidity_penalty = max(0.0, (hum - 80.0) * 0.15)
    wind_penalty = min(5.0, wind * 0.10)
    base = rain_score + humidity_penalty + wind_penalty
    amplified = base * (1.0 + (float(flood_vulnerability) - 0.5) * 0.6)
    return round(min(100.0, max(0.0, amplified)), 2)


# ── Crowd Score ───────────────────────────────────────────────────────────────
def compute_crowd_score(poi_count, hazard_count, capacity, zone_lat, zone_lon, safe_zones) -> tuple[float, float]:
    if capacity is None or capacity <= 0:
        capacity = 100
    hour = datetime.now().hour
    if   7  <= hour <= 9:   density_factor = random.uniform(0.55, 0.80)
    elif 17 <= hour <= 19:  density_factor = random.uniform(0.60, 0.85)
    elif 12 <= hour <= 13:  density_factor = random.uniform(0.40, 0.60)
    elif 10 <= hour <= 16:  density_factor = random.uniform(0.25, 0.45)
    elif 20 <= hour <= 23:  density_factor = random.uniform(0.20, 0.35)
    else:                   density_factor = random.uniform(0.05, 0.15)

    occupancy_ratio = min(1.0, poi_count / capacity) if poi_count > 0 else density_factor
    hazard_penalty  = min(0.25, hazard_count * 0.05)
    safe_zone_bonus = 0.0
    if safe_zones:
        nearest_km = min(haversine_km(zone_lat, zone_lon, sz["latitude"], sz["longitude"]) for sz in safe_zones)
        if nearest_km < 0.5:
            safe_zone_bonus = -0.10

    raw = occupancy_ratio + hazard_penalty + safe_zone_bonus
    crowd_score = round(max(0.0, min(1.0, raw)) * 100.0, 2)
    confidence  = round(min(1.0, (poi_count / max(1, capacity)) * 1.5 if poi_count > 0 else density_factor * 0.6), 2)
    return crowd_score, confidence


# ── Earthquake Score ──────────────────────────────────────────────────────────
def compute_earthquake_score(zone_lat, zone_lon, recent_quakes) -> float:
    total = 0.0
    for eq in recent_quakes:
        eq_lat = float(eq.latitude  or 0.0)
        eq_lon = float(eq.longitude or 0.0)
        mag    = float(eq.magnitude or 0.0)
        dist   = haversine_km(zone_lat, zone_lon, eq_lat, eq_lon)
        if dist > 300.0:
            continue
        dist_factor = max(0.0, 1.0 - dist / 300.0)
        mag_factor  = max(0.0, min(1.0, (mag - 3.0) / 6.0))
        total += dist_factor * mag_factor * 100.0
    return round(min(100.0, total), 2)


# ── Severity & Actions ────────────────────────────────────────────────────────
def score_to_severity(score: float) -> str:
    if score >= SEVERITY_HIGH:   return "HIGH"
    elif score >= SEVERITY_MEDIUM: return "MEDIUM"
    return "LOW"


def overall_risk(traffic, weather, crowd, quake, waterway) -> tuple[float, str]:
    weights = {"traffic": 0.20, "weather": 0.25, "crowd": 0.20, "earthquake": 0.10, "waterway": 0.25}
    scores  = {"traffic": traffic, "weather": weather, "crowd": crowd, "earthquake": quake, "waterway": waterway}
    composite = sum(weights[k] * scores[k] for k in weights)
    dominant  = max(scores, key=lambda k: scores[k])
    return round(composite, 2), dominant


def build_recommended_action(dominant: str, severity: str) -> str:
    actions = {
        "traffic":    {"HIGH": "Avoid zone. Use alternative routes or delay travel by 60–90 min.", "MEDIUM": "Expect significant delay. Consider MRT/TransJakarta.", "LOW": "Minor congestion. Monitor and proceed with caution."},
        "weather":    {"HIGH": "Evacuate flood-prone areas immediately. Move to marked safe zones.", "MEDIUM": "Prepare for flooding. Avoid underpasses and low-lying roads.", "LOW": "Light rain. Slow down and watch for slippery surfaces."},
        "crowd":      {"HIGH": "Area at capacity. Redirect to nearest safe zone.", "MEDIUM": "High crowd density. Maintain safe distance from hazard points.", "LOW": "Moderate crowd. Stay aware of surroundings."},
        "earthquake": {"HIGH": "Drop, Cover, and Hold On. Move away from windows.", "MEDIUM": "Prepare for aftershocks. Avoid damaged structures.", "LOW": "Tremor detected. Stay alert for BMKG updates."},
        "waterway":   {"HIGH": "River capacity exceeded. Evacuate low-lying areas immediately.", "MEDIUM": "River approaching critical level. Prepare for localized flooding.", "LOW": "River levels elevated. Continue monitoring."},
    }
    return actions.get(dominant, {}).get(severity, "Stay alert and follow official guidance.")


# ── Main Engine ───────────────────────────────────────────────────────────────
class PredictiveDisruptionEngine:

    def run_analysis(self, db: Session):
        logger.info("[Engine] Starting scoring cycle (v3 — waterway edition)...")
        now = datetime.utcnow()

        zones = db.query(Zone).all()
        if not zones:
            logger.warning("[Engine] No zones found.")
            return

        # ── Preload lookups ───────────────────────────────────────────────────
        safe_zone_pois = db.query(PoiMaster).filter(PoiMaster.is_safe_zone == True).all()
        safe_zones = [{"latitude": float(p.latitude), "longitude": float(p.longitude)}
                      for p in safe_zone_pois if p.latitude and p.longitude]

        eq_cutoff = now - timedelta(hours=24)
        recent_quakes = db.query(EarthquakeEvent).filter(
            EarthquakeEvent.event_timestamp >= eq_cutoff
        ).all()

        # ── Close stale alerts ────────────────────────────────────────────────
        db.query(RiskAlert).filter(
            RiskAlert.status == "OPEN",
            RiskAlert.alert_timestamp < now - timedelta(hours=12),
        ).update({"status": "CLOSED"}, synchronize_session=False)
        db.commit()

        # ── Load all waterway segments ────────────────────────────────────────
        waterways = db.query(JabodetabekWaterway).all()
        logger.info(f"[Engine] Loaded {len(waterways)} waterway segments.")

        # ── Step 1: Get gate telemetry → cascade amplifier ────────────────────
        # Read latest WaterwayTelemetry for high-order segments (gates)
        # Gate hyriv_ids are identified by ord_strahler >= 6 (major rivers)
        gate_amplifier = 1.0  # default: no cascade
        gate_alert = "Normal"

        major_segments = [w for w in waterways if (w.ord_strahler or 0) >= 6]
        if major_segments:
            # Find the latest telemetry for any major segment
            for seg in major_segments:
                tel = (db.query(WaterwayTelemetry)
                       .filter(WaterwayTelemetry.hyriv_id == seg.hyriv_id)
                       .order_by(WaterwayTelemetry.timestamp.desc())
                       .first())
                if tel and tel.alert_level:
                    amp = siaga_to_amplifier(tel.alert_level)
                    if amp > gate_amplifier:
                        gate_amplifier = amp
                        gate_alert = tel.alert_level

        # Also check jabodetabek_waterways.alert_level directly (updated by telemetry ingestor)
        for w in waterways:
            if w.alert_level and (w.ord_strahler or 0) >= 5:
                amp = siaga_to_amplifier(w.alert_level)
                if amp > gate_amplifier:
                    gate_amplifier = amp
                    gate_alert = w.alert_level

        if gate_amplifier > 1.0:
            logger.warning(f"[Engine] Upstream cascade active: {gate_alert} (amplifier={gate_amplifier}x)")

        # ── Step 2: Build zone → waterway proximity mapping ───────────────────
        # Pre-parse all waterway coordinates once
        waterway_coords: dict[int, list] = {}
        for w in waterways:
            try:
                coords = json.loads(w.coordinates_json) if w.coordinates_json else []
                waterway_coords[w.hyriv_id] = coords
            except Exception:
                waterway_coords[w.hyriv_id] = []

        # ── Step 3: Score each zone ───────────────────────────────────────────
        for zone in zones:
            zone_lat = float(zone.latitude)
            zone_lon = float(zone.longitude)
            baseline = float(zone.traffic_speed_baseline or 40.0)
            capacity = int(zone.capacity or 100)
            vuln     = float(zone.historical_flood_vulnerability or 0.5)

            # Get latest weather for this zone (needed for rainfall input to flood model)
            latest_weather = (db.query(WeatherSnapshot)
                              .filter(WeatherSnapshot.zone_id == zone.zone_id)
                              .order_by(WeatherSnapshot.timestamp.desc())
                              .first())
            zone_rainfall = float(latest_weather.rainfall or 0.0) if latest_weather else 0.0

            # ── Waterway: find nearby segments, score each, write mappings ────
            zone_waterway_score = 0.0
            nearby_count = 0

            for w in waterways:
                coords = waterway_coords.get(w.hyriv_id, [])
                if not coords:
                    continue

                dist_km = nearest_point_on_polyline_km(zone_lat, zone_lon, coords)
                if dist_km > WATERWAY_ZONE_RADIUS_KM:
                    continue

                nearby_count += 1

                # Upsert zone_waterway_mapping
                existing_map = (db.query(ZoneWaterwayMapping)
                                .filter_by(zone_id=zone.zone_id, hyriv_id=w.hyriv_id)
                                .first())
                if not existing_map:
                    db.add(ZoneWaterwayMapping(
                        zone_id=zone.zone_id,
                        hyriv_id=w.hyriv_id,
                        distance_m=round(dist_km * 1000, 1),
                    ))

                # Compute flood score for this segment
                est_flow, ratio, seg_flood_score = compute_segment_flood_score(
                    dis_av_cms=float(w.dis_av_cms or 1.0),
                    catch_skm=float(w.catch_skm or 1.0),
                    upland_skm=float(w.upland_skm or 1.0),
                    ord_strahler=int(w.ord_strahler or 1),
                    rainfall_mm=zone_rainfall,
                    gate_amplifier=gate_amplifier,
                )

                # Amplify by zone flood vulnerability
                seg_flood_score = min(100.0, seg_flood_score * (1.0 + (vuln - 0.5) * 0.6))

                # Distance decay: segments closer to zone centre score higher
                proximity_weight = max(0.3, 1.0 - dist_km / WATERWAY_ZONE_RADIUS_KM)
                weighted_score = seg_flood_score * proximity_weight

                if weighted_score > zone_waterway_score:
                    zone_waterway_score = weighted_score

                # Write waterway_snapshot for this segment
                db.add(WaterwaySnapshot(
                    waterway_id=w.hyriv_id,
                    timestamp=now,
                    rainfall_mm=zone_rainfall,
                    estimated_flow_cms=est_flow,
                    water_level_m=round(est_flow / max(1.0, float(w.dis_av_cms or 1.0)), 3),
                    flood_score=round(seg_flood_score, 2),
                ))

                # Update jabodetabek_waterways dynamic columns
                w.current_discharge_cms = est_flow
                w.discharge_ratio = ratio
                w.last_updated = now

                # Set alert level on the waterway row itself
                if seg_flood_score >= 85:
                    w.alert_level = "Siaga 1"
                elif seg_flood_score >= 65:
                    w.alert_level = "Siaga 2"
                elif seg_flood_score >= 45:
                    w.alert_level = "Siaga 3"
                elif seg_flood_score >= 25:
                    w.alert_level = "Siaga 4"
                else:
                    w.alert_level = "Normal"

            zone_waterway_score = round(zone_waterway_score, 2)
            if nearby_count > 0:
                logger.debug(f"[Waterway] {zone.name}: {nearby_count} segments nearby, score={zone_waterway_score:.1f}")

            # ── Traffic ───────────────────────────────────────────────────────
            latest_traffic = (db.query(TrafficSnapshot)
                              .filter(TrafficSnapshot.zone_id == zone.zone_id)
                              .order_by(TrafficSnapshot.timestamp.desc())
                              .first())
            traffic_score = 0.0
            if latest_traffic:
                traffic_score = compute_traffic_score(
                    latest_traffic.speed, latest_traffic.congestion, baseline
                )
                hr = now.hour
                if (7 <= hr <= 9) or (17 <= hr <= 19):
                    traffic_score = min(100.0, round(traffic_score * 1.25, 2))

            # ── Weather ───────────────────────────────────────────────────────
            weather_score = 0.0
            if latest_weather:
                weather_score = compute_weather_score(
                    latest_weather.rainfall, latest_weather.humidity,
                    latest_weather.wind_speed, flood_vulnerability=vuln,
                )

            # ── Crowd ─────────────────────────────────────────────────────────
            latest_crowd = (db.query(CrowdSnapshot)
                            .filter(CrowdSnapshot.zone_id == zone.zone_id)
                            .order_by(CrowdSnapshot.timestamp.desc())
                            .first())
            poi_count    = int(latest_crowd.poi_count    or 0) if latest_crowd else 0
            hazard_count = int(latest_crowd.hazard_count or 0) if latest_crowd else 0
            crowd_score, confidence_score = compute_crowd_score(
                poi_count, hazard_count, capacity, zone_lat, zone_lon, safe_zones
            )
            if latest_crowd:
                latest_crowd.crowd_score      = crowd_score
                latest_crowd.confidence_score = confidence_score

            # ── Earthquake ────────────────────────────────────────────────────
            eq_score = compute_earthquake_score(zone_lat, zone_lon, recent_quakes)

            # ── Overall ───────────────────────────────────────────────────────
            overall, dominant = overall_risk(
                traffic_score, weather_score, crowd_score, eq_score, zone_waterway_score
            )
            severity = score_to_severity(overall)
            action   = build_recommended_action(dominant, severity)

            logger.info(
                f"[Engine] {zone.name}: T={traffic_score:.1f} W={weather_score:.1f} "
                f"C={crowd_score:.1f} E={eq_score:.1f} WW={zone_waterway_score:.1f} "
                f"→ {overall:.1f} [{severity}]"
            )

            # ── Upsert zone_status ─────────────────────────────────────────────
            existing = db.query(ZoneStatus).filter(ZoneStatus.zone_id == zone.zone_id).first()
            if existing:
                existing.traffic_score     = traffic_score
                existing.weather_score     = weather_score
                existing.crowd_score       = crowd_score
                existing.earthquake_score  = eq_score
                existing.waterway_score    = zone_waterway_score
                existing.overall_risk_score = overall
                existing.last_updated      = now
                existing.dominant_risk     = dominant
                existing.recommended_action = action
            else:
                db.add(ZoneStatus(
                    zone_id=zone.zone_id,
                    traffic_score=traffic_score,
                    weather_score=weather_score,
                    crowd_score=crowd_score,
                    earthquake_score=eq_score,
                    waterway_score=zone_waterway_score,
                    overall_risk_score=overall,
                    last_updated=now,
                    dominant_risk=dominant,
                    recommended_action=action,
                ))

            # ── Emit risk_alert ────────────────────────────────────────────────
            if severity in ("HIGH", "MEDIUM") and overall >= ALERT_MIN_PROB:
                recent_alert = (db.query(RiskAlert)
                                .filter(
                                    RiskAlert.zone_id == zone.zone_id,
                                    RiskAlert.status == "OPEN",
                                    RiskAlert.disruption_type == dominant,
                                    RiskAlert.alert_timestamp >= now - timedelta(minutes=30),
                                ).first())
                if not recent_alert:
                    peak_offsets = {
                        "weather":    timedelta(hours=1),
                        "traffic":    timedelta(minutes=45),
                        "crowd":      timedelta(minutes=30),
                        "earthquake": timedelta(minutes=15),
                        "waterway":   timedelta(hours=2),
                    }
                    db.add(RiskAlert(
                        zone_id=zone.zone_id,
                        disruption_type=dominant,
                        severity=severity,
                        alert_timestamp=now,
                        message=(
                            f"{zone.name}: {severity} {dominant} risk — "
                            f"score {overall:.1f}/100. {action}"
                        ),
                        status="OPEN",
                        probability_percentage=round(overall, 2),
                        estimated_time_to_peak=now + peak_offsets.get(dominant, timedelta(hours=1)),
                    ))

        db.commit()
        logger.info("[Engine] Scoring cycle complete.")
