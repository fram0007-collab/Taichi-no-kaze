"""
Worker ORM Models — Neon PostgreSQL Edition (v3)
Added: WaterwaySnapshot, WaterwayTelemetry, WaterwayConnectivity, ZoneWaterwayMapping
Updated: ZoneStatus gains waterway_score
Updated: JabodetabekWaterway gains all HydroRIVERS static columns
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Text,
    DateTime, Numeric, BigInteger, ForeignKey, Double
)
from sqlalchemy.sql import func
from worker.database import Base


class Zone(Base):
    __tablename__ = "zones"
    zone_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    radius_m = Column(Integer, nullable=False)
    capacity = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    historical_flood_vulnerability = Column(Numeric(5, 2), default=0.50)
    traffic_speed_baseline = Column(Numeric(6, 2), default=40.00)


class ZoneStatus(Base):
    __tablename__ = "zone_status"
    zone_id = Column(Integer, ForeignKey("zones.zone_id"), primary_key=True)
    traffic_score = Column(Numeric(5, 2), nullable=True)
    weather_score = Column(Numeric(5, 2), nullable=True)
    crowd_score = Column(Numeric(5, 2), nullable=True)
    earthquake_score = Column(Numeric(5, 2), nullable=True)
    waterway_score = Column(Numeric(5, 2), nullable=True)   # ← NEW
    overall_risk_score = Column(Numeric(5, 2), nullable=True)
    last_updated = Column(DateTime, nullable=True)
    dominant_risk = Column(String(50), nullable=True)
    recommended_action = Column(Text, nullable=True)


class TrafficSnapshot(Base):
    __tablename__ = "traffic_snapshots"
    snapshot_id = Column(BigInteger, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)
    timestamp = Column(DateTime, nullable=False)
    speed = Column(Numeric(6, 2), nullable=True)
    congestion = Column(Numeric(6, 2), nullable=True)
    travel_time = Column(Numeric(8, 2), nullable=True)


class WeatherSnapshot(Base):
    __tablename__ = "weather_snapshots"
    snapshot_id = Column(BigInteger, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)
    timestamp = Column(DateTime, nullable=False)
    rainfall = Column(Numeric(8, 2), nullable=True)
    humidity = Column(Numeric(5, 2), nullable=True)
    wind_speed = Column(Numeric(6, 2), nullable=True)


class CrowdSnapshot(Base):
    __tablename__ = "crowd_snapshots"
    snapshot_id = Column(BigInteger, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)
    timestamp = Column(DateTime, nullable=False)
    crowd_score = Column(Numeric(5, 2), nullable=True)
    poi_count = Column(Integer, nullable=True)
    hazard_count = Column(Integer, nullable=True)
    confidence_score = Column(Numeric(5, 2), nullable=True)


class PoiCrowdStatus(Base):
    """Per-POI crowd score, recomputed every scoring cycle.

    Unlike crowd_snapshots (zone-level, historical), this table holds the
    CURRENT crowd estimate for each individual POI — a mall and a hospital
    in the same zone get different scores based on their category's typical
    crowd behaviour and their sensitivity to inbound traffic.
    """
    __tablename__ = "poi_crowd_status"
    poi_id = Column(String(100), ForeignKey("poi_master.poi_id", ondelete="CASCADE"), primary_key=True)
    crowd_score = Column(Numeric(5, 2), nullable=True)
    confidence_score = Column(Numeric(5, 2), nullable=True)
    last_updated = Column(DateTime, nullable=True)


class EarthquakeEvent(Base):
    __tablename__ = "earthquake_events"
    event_id = Column(String(100), primary_key=True)
    magnitude = Column(Numeric(4, 2), nullable=True)
    depth_km = Column(Numeric(6, 2), nullable=True)
    latitude = Column(Double, nullable=True)
    longitude = Column(Double, nullable=True)
    event_timestamp = Column(DateTime, nullable=True)
    location = Column(Text, nullable=True)
    impact_radius_km = Column(Numeric(8, 2), nullable=True)


class RiskAlert(Base):
    __tablename__ = "risk_alerts"
    alert_id = Column(BigInteger, primary_key=True, autoincrement=True)
    zone_id = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)
    disruption_type = Column(String(50), nullable=True)
    severity = Column(String(20), nullable=True)
    alert_timestamp = Column(DateTime, nullable=True)
    message = Column(Text, nullable=True)
    status = Column(String(20), default="OPEN")
    probability_percentage = Column(Numeric(5, 2), nullable=True)
    estimated_time_to_peak = Column(DateTime, nullable=True)
    estimated_resolution_at = Column(DateTime, nullable=True)
    resolution_confidence = Column(Numeric(5, 2), nullable=True)
    resolved_at = Column(DateTime, nullable=True)  # set when status flips to CLOSED — enables training on real durations


class PoiMaster(Base):
    __tablename__ = "poi_master"
    poi_id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    latitude = Column(Double, nullable=True)
    longitude = Column(Double, nullable=True)
    zone_id = Column(Integer, ForeignKey("zones.zone_id"), nullable=True)
    source = Column(String(50), nullable=True)
    last_refresh = Column(DateTime, nullable=True)
    is_safe_zone = Column(Boolean, default=False)


class JabodetabekWaterway(Base):
    """
    HydroRIVERS static attributes + dynamic operational columns.
    Static columns seeded from HydroRIVERS shapefile.
    Dynamic columns (discharge_ratio, alert_level, current_discharge_cms) 
    updated by the waterway ingestion cycle.
    """
    __tablename__ = "jabodetabek_waterways"

    hyriv_id = Column(BigInteger, primary_key=True)
    name = Column(String(100), nullable=True)
    coordinates_json = Column(Text, nullable=True)
    max_capacity = Column(Float, nullable=True)        # = dis_av_cms * 3 (flood threshold)

    # HydroRIVERS static fields
    next_down = Column(BigInteger, nullable=True)      # downstream segment ID
    main_riv = Column(BigInteger, nullable=True)       # main river ID
    length_km = Column(Numeric(10, 2), nullable=True)
    dist_dn_km = Column(Float, nullable=True)          # distance to downstream outlet
    dist_up_km = Column(Float, nullable=True)
    catch_skm = Column(Numeric(12, 2), nullable=True)  # local catchment area km²
    upland_skm = Column(Numeric(12, 2), nullable=True) # total upstream drainage area km²
    dis_av_cms = Column(Numeric(12, 2), nullable=True) # mean annual discharge m³/s
    ord_strahler = Column(Integer, nullable=True)      # Strahler order (1=headwater, 8=major river)
    ord_classic = Column(Integer, nullable=True)
    ord_flow = Column(Integer, nullable=True)
    hybas_l12 = Column(BigInteger, nullable=True)

    # Dynamic operational columns (updated each cycle)
    warning_level_cm = Column(Float, nullable=True)
    danger_level_cm = Column(Float, nullable=True)
    current_discharge_cms = Column(Numeric(10, 2), nullable=True)
    discharge_ratio = Column(Numeric(5, 2), nullable=True)  # current/average
    alert_level = Column(String(20), nullable=True)          # Normal/Siaga 4-1
    last_updated = Column(DateTime, nullable=True)


class WaterwaySnapshot(Base):
    """Per-cycle flood snapshot per waterway segment."""
    __tablename__ = "waterway_snapshots"

    snapshot_id = Column(BigInteger, primary_key=True, autoincrement=True)
    waterway_id = Column(BigInteger, ForeignKey("jabodetabek_waterways.hyriv_id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    rainfall_mm = Column(Numeric(8, 2), nullable=True)       # upstream rainfall driving flow
    estimated_flow_cms = Column(Numeric(10, 2), nullable=True)
    water_level_m = Column(Numeric(8, 2), nullable=True)
    flood_score = Column(Numeric(5, 2), nullable=True)        # 0–100


class WaterwayTelemetry(Base):
    """Real-time gate sensor readings (Katulampa, Manggarai, etc.)."""
    __tablename__ = "waterway_telemetry"

    telemetry_id = Column(BigInteger, primary_key=True, autoincrement=True)
    hyriv_id = Column(BigInteger, ForeignKey("jabodetabek_waterways.hyriv_id"), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    water_level_cm = Column(Float, nullable=True)
    flow_rate_cms = Column(Float, nullable=True)
    capacity_percentage = Column(Float, nullable=True)        # 0–100
    alert_level = Column(String(20), nullable=True)


class WaterwayConnectivity(Base):
    """Pre-computed upstream/downstream graph edges for cascade propagation."""
    __tablename__ = "waterway_connectivity"

    upstream_hyriv = Column(BigInteger, primary_key=True)
    downstream_hyriv = Column(BigInteger, primary_key=True)
    distance_km = Column(Float, nullable=True)


class ZoneWaterwayMapping(Base):
    """Many-to-many: which waterway segments are within flood range of each zone."""
    __tablename__ = "zone_waterway_mapping"

    zone_id = Column(Integer, ForeignKey("zones.zone_id"), primary_key=True)
    hyriv_id = Column(BigInteger, ForeignKey("jabodetabek_waterways.hyriv_id"), primary_key=True)
    distance_m = Column(Float, nullable=True)
