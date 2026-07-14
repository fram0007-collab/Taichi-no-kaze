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
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from worker.models import (
    Zone, ZoneStatus, TrafficSnapshot, WeatherSnapshot,
    CrowdSnapshot, EarthquakeEvent, RiskAlert, PoiMaster,
    JabodetabekWaterway, WaterwaySnapshot, WaterwayTelemetry,
    WaterwayConnectivity, ZoneWaterwayMapping, PoiCrowdStatus,
)

logger = logging.getLogger(__name__)

try:
    from .push_sender import send_push_for_alert
except ImportError:
    try:
        from push_sender import send_push_for_alert
    except ImportError:
        def send_push_for_alert(alert, db_conn): return 0

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
# How strongly inbound traffic predicts footfall per POI category.
# Destination hubs get full weight; hospitals are emergencies, not traffic-driven crowds.
TRAFFIC_ATTRACTION_WEIGHTS = {
    "mall":       1.0,
    "station":    1.0,
    "market":     0.8,
    "university": 0.7,
    "hospital":   0.3,
}

# Baseline "how busy is this category relative to the zone's ambient density".
# >1.0 = busier than ambient, <1.0 = quieter than ambient.
POI_CATEGORY_CROWD_WEIGHT = {
    "mall":       1.2,
    "station":    1.3,
    "market":     1.0,
    "university": 0.9,
    "hospital":   0.6,
}


# Jakarta (WIB) is UTC+7. The server runs on UTC (datetime.utcnow()), but all
# crowd/traffic patterns below describe LOCAL Jakarta rush hours. Without this
# offset, e.g. 17:33 WIB (evening rush) reads as 10:33 UTC → "midday lull"
# bracket, producing a low crowd_score for a station that's actually packed.
WIB_OFFSET_HOURS = 7


def compute_density_factor(hour_wib: Optional[int] = None) -> float:
    """
    Time-of-day ambient crowd density, 0-1, based on Jakarta LOCAL hour (WIB).

    This is the shared baseline for both zone-level and POI-level crowd
    scoring within a single scoring cycle — pass the SAME value to every
    compute_*_crowd_score call in that cycle so a mall and a hospital in
    the same zone at the same moment are compared on equal footing.

    Args:
        hour_wib: Jakarta-local hour (0-23). If omitted, derives it from
                  datetime.utcnow() + WIB_OFFSET_HOURS.
    """
    if hour_wib is None:
        hour_wib = (datetime.utcnow().hour + WIB_OFFSET_HOURS) % 24
    hour = hour_wib
    if   7  <= hour <= 9:   return random.uniform(0.55, 0.80)
    elif 17 <= hour <= 19:  return random.uniform(0.60, 0.85)
    elif 12 <= hour <= 13:  return random.uniform(0.40, 0.60)
    elif 10 <= hour <= 16:  return random.uniform(0.25, 0.45)
    elif 20 <= hour <= 23:  return random.uniform(0.20, 0.35)
    else:                   return random.uniform(0.05, 0.15)


def compute_crowd_score(
    poi_count: int,
    hazard_count: int,
    capacity: int,
    zone_lat: float,
    zone_lon: float,
    safe_zones: list,
    traffic_score: float = 0.0,
    poi_category_counts: dict = None,
    density_factor: Optional[float] = None,
) -> tuple[float, float]:
    """
    ZONE-LEVEL aggregate crowd score (used for zone_status.crowd_score and
    the "Crowd" threat-zone map layer).

    Root cause of always-zero bug:
      poi_count from crowd_snapshots is a structural DB count (e.g. 3 malls),
      NOT footfall. Dividing 3 / 100 (capacity) = 0.03 → score ≈ 3.
      Since poi_count > 0, the density_factor fallback never ran.

    Fix: always use time-of-day density_factor as the base, then amplify
    by poi density and inbound traffic attraction for destination POIs.

    Pass `density_factor` from compute_density_factor() so this stays
    consistent with the per-POI scores computed in the same cycle.
    """
    if capacity is None or capacity <= 0:
        capacity = 100
    if poi_category_counts is None:
        poi_category_counts = {}
    if density_factor is None:
        density_factor = compute_density_factor()

    # ── POI density multiplier (up to +40% for POI-dense zones) ──────────────
    poi_multiplier = 1.0 + min(1.0, poi_count / 5.0) * 0.4

    # ── Traffic-attraction amplifier ──────────────────────────────────────────
    # Zones with destination POIs (mall, station) get amplified when traffic is high
    # because inbound congestion signals people are heading there.
    raw_attraction = sum(
        TRAFFIC_ATTRACTION_WEIGHTS.get(cat, 0.0) * count
        for cat, count in poi_category_counts.items()
    )
    attraction_weight = min(1.0, raw_attraction / 5.0)
    traffic_amplifier = 1.0 + (traffic_score / 100.0) * 0.5 * attraction_weight

    occupancy_ratio = min(1.0, density_factor * poi_multiplier * traffic_amplifier)

    # ── Hazard penalty and safe-zone proximity ────────────────────────────────
    hazard_penalty  = min(0.25, hazard_count * 0.05)
    safe_zone_bonus = 0.0
    if safe_zones:
        nearest_km = min(haversine_km(zone_lat, zone_lon, sz["latitude"], sz["longitude"]) for sz in safe_zones)
        if nearest_km < 0.5:
            safe_zone_bonus = -0.10

    raw = occupancy_ratio + hazard_penalty + safe_zone_bonus
    crowd_score = round(max(0.0, min(1.0, raw)) * 100.0, 2)

    # Same confidence logic as compute_poi_crowd_score: 0.4 floor (synthetic
    # density baseline) + up to 0.6 scaled by real traffic signal weighted by
    # the zone's overall attraction profile.
    confidence = 0.4 + 0.6 * (traffic_score / 100.0) * attraction_weight
    confidence = round(min(1.0, max(0.0, confidence)), 2)
    return crowd_score, confidence


def compute_poi_crowd_score(
    category: str,
    density_factor: float,
    traffic_score: float,
    hazard_nearby: bool = False,
    near_safe_zone: bool = False,
) -> tuple[float, float]:
    """
    POI-LEVEL crowd score — gives each POI its own value based on:
      1. The zone's shared time-of-day density_factor (same for every POI in
         the zone at this moment — people are or aren't out and about).
      2. POI_CATEGORY_CROWD_WEIGHT — how busy this category typically runs
         relative to ambient (stations/malls run hotter, hospitals steadier).
      3. Inbound traffic amplification, scaled by how strongly THIS category
         attracts traffic-driven footfall (TRAFFIC_ATTRACTION_WEIGHTS).
      4. Small adjustments: a nearby active hazard nudges crowd up (people
         clustering/evacuating), proximity to a safe zone nudges it down
         slightly (dispersal point, less likely to be jam-packed).

    Formula:
        traffic_amplifier = 1 + (traffic_score/100) * 0.5 * traffic_attraction[category]
        occupancy_ratio   = clamp01(density_factor * category_weight * traffic_amplifier)
        raw               = occupancy_ratio + hazard_penalty - safe_zone_bonus
        crowd_score       = clamp01(raw) * 100
    """
    category_weight    = POI_CATEGORY_CROWD_WEIGHT.get(category, 1.0)
    traffic_attraction = TRAFFIC_ATTRACTION_WEIGHTS.get(category, 0.0)

    # Revised formula: category_weight is a CEILING scaler, not a base multiplier.
    # Without real traffic data, a station sits at ~50% ambient (not ~97%).
    # High traffic congestion lifts it proportionally toward the category ceiling.
    #
    # Old:  occupancy = density * category_weight * (1 + traffic * 0.5 * attraction)
    #       → station with zero traffic still scores 97.5 at rush hour (wrong)
    # New:  occupancy = density * (0.5 + 0.5 * traffic_contribution) * category_weight
    #       → station with zero traffic scores ~49 (moderate); high traffic → ~85
    #       → hospital stays low (~25) regardless of traffic (low weight + low attraction)
    traffic_contribution = (traffic_score / 100.0) * traffic_attraction
    occupancy_ratio = min(1.0, density_factor * (0.5 + 0.5 * traffic_contribution) * category_weight)

    hazard_penalty  = 0.10 if hazard_nearby else 0.0
    safe_zone_bonus = 0.05 if near_safe_zone else 0.0

    raw = occupancy_ratio + hazard_penalty - safe_zone_bonus
    crowd_score = round(max(0.0, min(1.0, raw)) * 100.0, 2)

    # Confidence reflects how much REAL sensor data (TomTom traffic) backs this
    # estimate, vs. the synthetic time-of-day density_factor baseline.
    #   - 0.4 floor: time-of-day pattern + real weather/hazard inputs always apply
    #   - up to +0.6: scales with traffic_score × this category's sensitivity to
    #     traffic (mall/station benefit a lot from real traffic data; hospitals
    #     barely do, so traffic data doesn't add much certainty for them)
    confidence = 0.4 + 0.6 * (traffic_score / 100.0) * traffic_attraction
    confidence = round(min(1.0, max(0.0, confidence)), 2)
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
# ── Resolution Prediction ─────────────────────────────────────────────────────

def compute_resolution(
    disruption_type: str,
    current_score: float,
    now_utc: datetime,
    traffic_score: float = 0.0,
    weather_hourly: Optional[list] = None,
    eq_magnitude: float = 0.0,
    eq_timestamp: Optional[datetime] = None,
    waterway_level_cm: float = 0.0,
    waterway_trend: str = "stable",
) -> tuple[datetime, float]:
    """
    Estimates when a disruption is likely to resolve.

    Returns:
        (estimated_resolution_at_utc, confidence_pct)
        confidence_pct: 0–100, reflects data quality and predictability.

    Method per disruption type:
        traffic   — rush hour end times (WIB) + score decay (~5pts/15min outside rush)
        weather   — first hourly forecast entry with rainfall < 0.1 mm
        crowd     — peak window end times (1h later than traffic, more variable)
        earthquake — simplified Omori-Utsu: hours_at_risk ≈ 10^(M-4)
        waterway  — gate level decay rate + 2h downstream travel time
        flood     — gate level decay rate + 8–12h Jakarta travel time
    """
    dtype = disruption_type.lower()
    hour_wib = (now_utc.hour + WIB_OFFSET_HOURS) % 24

    if dtype == "traffic":
        RUSH_WINDOWS = [
            ((7,  9),  9,  45, 0.80),
            ((12, 13), 14,  0, 0.75),
            ((17, 20), 21,  0, 0.82),
        ]
        for (wstart, wend), clear_h, clear_m, base_conf in RUSH_WINDOWS:
            if wstart <= hour_wib <= wend:
                clear_utc_h = (clear_h - WIB_OFFSET_HOURS) % 24
                candidate = now_utc.replace(hour=clear_utc_h, minute=clear_m, second=0, microsecond=0)
                if candidate <= now_utc:
                    candidate += timedelta(days=1)
                # Higher score = more congested = slightly less certain to clear on schedule
                conf = base_conf - max(0, (current_score - 50) / 200)
                return candidate, round(max(0.45, min(0.90, conf)) * 100)
        # Outside rush: score decays ~5pts per 15min
        pts_above = max(0, current_score - 35)
        mins = (pts_above / 5.0) * 15
        return now_utc + timedelta(minutes=max(15, mins)), 60

    elif dtype == "weather":
        if weather_hourly:
            for entry in weather_hourly:
                rf = float(entry.get("rainfall", 0) or 0)
                if rf < 0.1:
                    try:
                        t_str = entry.get("time", "")
                        t = datetime.fromisoformat(t_str)
                        if t.tzinfo is None:
                            t = t.replace(tzinfo=timezone.utc)
                        if t > now_utc:
                            return t, 85
                    except Exception:
                        pass
        # Fallback if no forecast or all hours rainy
        return now_utc + timedelta(hours=3), 50

    elif dtype == "crowd":
        CROWD_WINDOWS = [
            ((7,  9),  10, 30, 0.70),
            ((12, 13), 14, 30, 0.68),
            ((17, 21), 22,  0, 0.65),
        ]
        for (wstart, wend), clear_h, clear_m, base_conf in CROWD_WINDOWS:
            if wstart <= hour_wib <= wend:
                clear_utc_h = (clear_h - WIB_OFFSET_HOURS) % 24
                candidate = now_utc.replace(hour=clear_utc_h, minute=clear_m, second=0, microsecond=0)
                if candidate <= now_utc:
                    candidate += timedelta(days=1)
                return candidate, round(base_conf * 100)
        # Outside known peak — score-based
        pts_above = max(0, current_score - 55)
        mins = (pts_above / 5.0) * 20
        return now_utc + timedelta(minutes=max(20, mins)), 55

    elif dtype == "earthquake":
        if eq_timestamp is None or eq_magnitude <= 0:
            return now_utc + timedelta(hours=6), 45
        mag = float(eq_magnitude)
        # Omori-Utsu simplified: hours of significant aftershock risk
        hours_risk = max(1.0, 10 ** (mag - 4.0)) if mag >= 4.0 else 2.0
        clear_at = eq_timestamp + timedelta(hours=hours_risk)
        if clear_at <= now_utc:
            clear_at = now_utc + timedelta(hours=1)
        # Confidence: best around M4-5 (predictable range), drops for extreme magnitudes
        conf = max(40, 65 - abs(mag - 4.5) * 6)
        return clear_at, round(conf)

    elif dtype in ("waterway", "flood"):
        # Estimate hours for gate level to return to normal
        if waterway_trend == "falling":
            decay_rate_cm_per_hr = 50.0
            hours_to_normal = max(1.0, waterway_level_cm / decay_rate_cm_per_hr)
            conf = 70
        elif waterway_trend == "stable":
            hours_to_normal = 4.0 + (waterway_level_cm / 100.0)
            conf = 55
        else:  # rising
            hours_to_normal = 8.0 + (waterway_level_cm / 80.0)
            conf = 40
        # Add downstream travel time (flood takes longer to reach Jakarta from Katulampa)
        travel_hours = 8.0 if dtype == "flood" else 2.0
        return now_utc + timedelta(hours=hours_to_normal + travel_hours), conf

    # Unknown type fallback
    return now_utc + timedelta(hours=3), 40


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

        # ── Per-POI crowd scoring: nearest-zone assignment ──────────────────────
        # Include ALL POIs regardless of is_safe_zone — hospitals and police are
        # now recommended shelters and need live crowd scores so the failover
        # mechanism can correctly rank them by current occupancy.
        all_crowd_pois = db.query(PoiMaster).all()
        poi_nearest_zone: dict[str, int] = {}
        for _poi in all_crowd_pois:
            if not _poi.category or _poi.latitude is None or _poi.longitude is None:
                continue
            best_zid, best_dist = None, float("inf")
            for _z in zones:
                d = haversine_km(float(_poi.latitude), float(_poi.longitude),
                                  float(_z.latitude), float(_z.longitude))
                if d < best_dist:
                    best_dist, best_zid = d, _z.zone_id
            if best_zid is not None:
                poi_nearest_zone[_poi.poi_id] = best_zid

        # Group POIs by their nearest zone for the per-zone scoring loop below
        pois_by_nearest_zone: dict[int, list] = {}
        for _poi in all_crowd_pois:
            zid = poi_nearest_zone.get(_poi.poi_id)
            if zid is not None:
                pois_by_nearest_zone.setdefault(zid, []).append(_poi)
        
        # Fetch active threat zone circles
        alert_zone_ids = set()
        alerts = db.query(RiskAlert.zone_id).filter(
            RiskAlert.status == "OPEN",
            RiskAlert.probability_percentage >= 20
        ).all()
        for a in alerts:
            alert_zone_ids.add(a.zone_id)

        status_zone_ids = set()
        statuses = db.query(ZoneStatus.zone_id).filter(
            ZoneStatus.overall_risk_score >= 25
        ).all()
        for s in statuses:
            status_zone_ids.add(s.zone_id)

        threat_zone_ids = alert_zone_ids.union(status_zone_ids)
        zones_map = {z.zone_id: z for z in zones}
        
        threat_circles = []
        for zid in threat_zone_ids:
            z = zones_map.get(zid)
            if z and z.latitude and z.longitude:
                threat_circles.append({
                    "lat": float(z.latitude),
                    "lon": float(z.longitude),
                    "radius_m": float(z.radius_m or 0)
                })

        safe_zones = []
        for p in safe_zone_pois:
            if not p.latitude or not p.longitude:
                continue
            is_inside_threat = False
            for circle in threat_circles:
                dist_m = haversine_km(
                    float(p.latitude), float(p.longitude),
                    circle["lat"], circle["lon"]
                ) * 1000.0
                if dist_m <= circle["radius_m"]:
                    is_inside_threat = True
                    break
            if not is_inside_threat:
                safe_zones.append({
                    "latitude": float(p.latitude),
                    "longitude": float(p.longitude)
                })

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
        # Jakarta-local hour (WIB = UTC+7). `now` is UTC (datetime.utcnow()), so
        # without this conversion, evening rush (17:00 WIB = 10:00 UTC) would be
        # scored as a midday lull — see WIB_OFFSET_HOURS above.
        cycle_hour_wib = (now.hour + WIB_OFFSET_HOURS) % 24

        # Shared time-of-day density factor — same baseline for every zone AND
        # every POI scored in this cycle, so they're all comparable to each other.
        cycle_density_factor = compute_density_factor(cycle_hour_wib)

        new_alerts_to_push = []
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
                if (7 <= cycle_hour_wib <= 9) or (17 <= cycle_hour_wib <= 19):
                    traffic_score = min(100.0, round(traffic_score * 1.25, 2))

            # ── Weather ───────────────────────────────────────────────────────
            weather_score = 0.0
            if latest_weather:
                weather_score = compute_weather_score(
                    latest_weather.rainfall, latest_weather.humidity,
                    latest_weather.wind_speed, flood_vulnerability=vuln,
                )

            # ── Earthquake ────────────────────────────────────────────────────
            # Computed here (before Crowd) because the per-POI crowd hazard check
            # below needs eq_score to know if this zone currently has a seismic threat.
            eq_score = compute_earthquake_score(zone_lat, zone_lon, recent_quakes)

            # ── Crowd ─────────────────────────────────────────────────────────
            latest_crowd = (db.query(CrowdSnapshot)
                            .filter(CrowdSnapshot.zone_id == zone.zone_id)
                            .order_by(CrowdSnapshot.timestamp.desc())
                            .first())
            poi_count    = int(latest_crowd.poi_count    or 0) if latest_crowd else 0
            hazard_count = int(latest_crowd.hazard_count or 0) if latest_crowd else 0

            # Per-category POI counts so crowd model can weight traffic attraction
            # by POI type (mall/station = strong signal, hospital = weak signal)
            zone_poi_rows = db.query(PoiMaster).filter(
                PoiMaster.zone_id == zone.zone_id,
            ).all()
            poi_category_counts: dict = {}
            for _p in zone_poi_rows:
                if _p.category:
                    poi_category_counts[_p.category] = poi_category_counts.get(_p.category, 0) + 1

            crowd_score, confidence_score = compute_crowd_score(
                poi_count, hazard_count, capacity, zone_lat, zone_lon, safe_zones,
                traffic_score=traffic_score,
                poi_category_counts=poi_category_counts,
                density_factor=cycle_density_factor,
            )
            if latest_crowd:
                latest_crowd.crowd_score      = crowd_score
                latest_crowd.confidence_score = confidence_score

            # ── Per-POI crowd scores ────────────────────────────────────────────
            # Score every POI whose NEAREST zone is this one (pois_by_nearest_zone),
            # not just POIs whose stored zone_id happens to match — this covers POIs
            # with zone_id=NULL or sitting just outside their assigned zone's radius_m,
            # which would otherwise stay frozen at the migration seed crowd_score=0.
            zone_hazard_nearby = zone_waterway_score >= 35.0 or eq_score >= 35.0
            for _poi in pois_by_nearest_zone.get(zone.zone_id, []):
                if not _poi.category:
                    continue
                _near_safe = any(
                    haversine_km(
                        float(_poi.latitude or 0), float(_poi.longitude or 0),
                        sz["latitude"], sz["longitude"]
                    ) < 0.3
                    for sz in safe_zones
                ) if (_poi.latitude and _poi.longitude and safe_zones) else False

                _poi_score, _poi_conf = compute_poi_crowd_score(
                    category=_poi.category,
                    density_factor=cycle_density_factor,
                    traffic_score=traffic_score,
                    hazard_nearby=zone_hazard_nearby,
                    near_safe_zone=_near_safe,
                )

                _existing_pcs = db.query(PoiCrowdStatus).filter_by(poi_id=_poi.poi_id).first()
                if _existing_pcs:
                    _existing_pcs.crowd_score      = _poi_score
                    _existing_pcs.confidence_score = _poi_conf
                    _existing_pcs.last_updated      = now
                else:
                    db.add(PoiCrowdStatus(
                        poi_id=_poi.poi_id,
                        crowd_score=_poi_score,
                        confidence_score=_poi_conf,
                        last_updated=now,
                    ))

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

            # ── Emit risk_alert — per dimension ────────────────────────────────────
            # Each dimension fires its own alert independently.
            # This ensures waterway=37 fires even when composite overall=10.
            peak_offsets = {
                "weather":    timedelta(hours=1),
                "traffic":    timedelta(minutes=45),
                "crowd":      timedelta(minutes=30),
                "earthquake": timedelta(minutes=15),
                "waterway":   timedelta(hours=2),
            }
            # ── Resolution prediction inputs (zone-level) ─────────────────────────
            # Find the most recent/significant earthquake affecting this zone
            nearest_quake = None
            nearest_quake_dist = float('inf')
            for eq in recent_quakes:
                if eq.latitude and eq.longitude and eq.magnitude:
                    import math
                    dlat = zone_lat - float(eq.latitude)
                    dlon = zone_lon - float(eq.longitude)
                    dist = math.sqrt(dlat**2 + dlon**2)
                    if dist < nearest_quake_dist:
                        nearest_quake_dist = dist
                        nearest_quake = eq

            # Get latest weather forecast for this zone (for weather resolution)
            zone_weather_hourly = []
            if latest_weather:
                # Reconstruct minimal forecast from snapshot — rainfall only
                # (full hourly forecast not stored, use current reading as proxy)
                zone_weather_hourly = [{'time': now.isoformat(), 'rainfall': float(latest_weather.rainfall or 0)}]

            # Get waterway telemetry trend for this zone
            zone_waterway_level = 0.0
            zone_waterway_trend = 'stable'
            if zone_waterway_score > 0:
                # Use gate_alert as proxy for level; trend from recent telemetry
                level_map = {'Normal': 50, 'Siaga 3': 150, 'Siaga 2': 300, 'Siaga 1': 600}
                zone_waterway_level = level_map.get(gate_alert, 50)
                zone_waterway_trend = 'rising' if gate_amplifier > 1.2 else 'falling' if gate_amplifier < 1.0 else 'stable'

            dim_thresholds = {
                # Thresholds: (score, MEDIUM_floor, HIGH_floor)
                # Crowd raised: normal midday density (~55-70) → MEDIUM only.
                # HIGH crowd (>=82) = genuinely exceptional — concerts, mass
                # evacuations, disasters. Prevents false alarms on normal days.
                "traffic":    (traffic_score,       35.0, 65.0),
                "weather":    (weather_score,       35.0, 65.0),
                "crowd":      (crowd_score,         55.0, 82.0),
                "earthquake": (eq_score,            25.0, 55.0),
                "waterway":   (zone_waterway_score, 25.0, 55.0),
            }
            for dim_name, (dim_score, med_thresh, high_thresh) in dim_thresholds.items():
                if dim_score < med_thresh:
                    # Score dropped below threshold — proactively close any OPEN alert
                    # for this zone+disruption so the map clears immediately, without
                    # waiting for the 12-hour stale closer.
                    db.query(RiskAlert).filter(
                        RiskAlert.zone_id == zone.zone_id,
                        RiskAlert.status == "OPEN",
                        RiskAlert.disruption_type == dim_name,
                    ).update({"status": "CLOSED"}, synchronize_session=False)
                    continue
                dim_severity = "HIGH" if dim_score >= high_thresh else "MEDIUM"
                dim_action   = build_recommended_action(dim_name, dim_severity)
                # Upsert: find ANY existing OPEN alert for this zone+disruption type
                # (no time window — one OPEN alert per zone per disruption type at all times)
                existing_alert = (
                    db.query(RiskAlert)
                    .filter(
                        RiskAlert.zone_id == zone.zone_id,
                        RiskAlert.status == "OPEN",
                        RiskAlert.disruption_type == dim_name,
                    ).first()
                )
                # Compute resolution prediction for this disruption
                res_at, res_conf = compute_resolution(
                    disruption_type=dim_name,
                    current_score=dim_score,
                    now_utc=now,
                    traffic_score=traffic_score,
                    weather_hourly=zone_weather_hourly,
                    eq_magnitude=float(nearest_quake.magnitude) if nearest_quake else 0.0,
                    eq_timestamp=nearest_quake.event_timestamp if nearest_quake else None,
                    waterway_level_cm=zone_waterway_level,
                    waterway_trend=zone_waterway_trend,
                )

                if existing_alert:
                    # Update in place — no new row, no duplicates
                    existing_alert.severity               = dim_severity
                    existing_alert.probability_percentage = round(dim_score, 2)
                    existing_alert.estimated_time_to_peak = now + peak_offsets.get(dim_name, timedelta(hours=1))
                    existing_alert.estimated_resolution_at = res_at
                    existing_alert.resolution_confidence   = round(res_conf, 2)
                    existing_alert.message = (
                        f"{zone.name}: {dim_severity} {dim_name} risk - "
                        f"score {dim_score:.1f}/100. {dim_action}"
                    )
                    logger.debug(f"[Alert] Updated {dim_name} alert for {zone.name} (score={dim_score:.1f})")
                else:
                    db.add(RiskAlert(
                        zone_id=zone.zone_id,
                        disruption_type=dim_name,
                        severity=dim_severity,
                        alert_timestamp=now,
                        message=(
                            f"{zone.name}: {dim_severity} {dim_name} risk - "
                            f"score {dim_score:.1f}/100. {dim_action}"
                        ),
                        status="OPEN",
                        probability_percentage=round(dim_score, 2),
                        estimated_time_to_peak=now + peak_offsets.get(dim_name, timedelta(hours=1)),
                        estimated_resolution_at=res_at,
                        resolution_confidence=round(res_conf, 2),
                    ))
                    logger.info(f"[Alert] {dim_severity} {dim_name} alert fired for {zone.name} (score={dim_score:.1f})")
                    new_alerts_to_push.append({
                        "alert_id": None,  # filled after commit
                        "zone_id": zone.zone_id,
                        "zone_name": zone.name,
                        "disruption_type": dim_name,
                        "severity": dim_severity,
                        "probability_percentage": round(dim_score, 2),
                        "message": (
                            f"{zone.name}: {dim_severity} {dim_name} risk - "
                            f"score {dim_score:.1f}/100."
                        ),
                    })

        db.commit()
        logger.info("[Engine] Scoring cycle complete.")

        # Send push notifications for newly fired alerts (after commit)
        if new_alerts_to_push:
            import psycopg2, psycopg2.extras, os
            db_url = os.environ.get("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")
            try:
                sync_conn = psycopg2.connect(
                    db_url, sslmode="require",
                    cursor_factory=psycopg2.extras.RealDictCursor
                )
                for alert in new_alerts_to_push:
                    sent = send_push_for_alert(alert, sync_conn)
                    if sent:
                        logger.info(f"[Push] Sent {sent} notification(s) for {alert['zone_name']} {alert['disruption_type']}")
                sync_conn.close()
            except Exception as e:
                logger.warning(f"[Push] Notification dispatch failed: {e}")
