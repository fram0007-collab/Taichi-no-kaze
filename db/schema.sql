-- ============================================================
-- DIS-RUPTURE — Supabase Schema
-- Generated from SQLAlchemy models (worker/models.py)
-- Run this FIRST in the Supabase SQL Editor,
-- then run seed_zones.sql, then seed_poi.sql.
-- ============================================================

-- earthquake_events
CREATE TABLE earthquake_events (
	event_id VARCHAR(100) NOT NULL, 
	magnitude NUMERIC(4, 2), 
	depth_km NUMERIC(6, 2), 
	latitude DOUBLE PRECISION, 
	longitude DOUBLE PRECISION, 
	event_timestamp TIMESTAMP WITHOUT TIME ZONE, 
	location TEXT, 
	impact_radius_km NUMERIC(8, 2), 
	PRIMARY KEY (event_id)
);

-- jabodetabek_waterways
CREATE TABLE jabodetabek_waterways (
	hyriv_id BIGSERIAL NOT NULL, 
	name VARCHAR(100), 
	coordinates_json TEXT, 
	max_capacity FLOAT, 
	next_down BIGINT, 
	main_riv BIGINT, 
	length_km NUMERIC(10, 2), 
	dist_dn_km FLOAT, 
	dist_up_km FLOAT, 
	catch_skm NUMERIC(12, 2), 
	upland_skm NUMERIC(12, 2), 
	dis_av_cms NUMERIC(12, 2), 
	ord_strahler INTEGER, 
	ord_classic INTEGER, 
	ord_flow INTEGER, 
	hybas_l12 BIGINT, 
	warning_level_cm FLOAT, 
	danger_level_cm FLOAT, 
	current_discharge_cms NUMERIC(10, 2), 
	discharge_ratio NUMERIC(5, 2), 
	alert_level VARCHAR(20), 
	last_updated TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (hyriv_id)
);

-- waterway_connectivity
CREATE TABLE waterway_connectivity (
	upstream_hyriv BIGINT NOT NULL, 
	downstream_hyriv BIGINT NOT NULL, 
	distance_km FLOAT, 
	PRIMARY KEY (upstream_hyriv, downstream_hyriv)
);

-- zones
CREATE TABLE zones (
	zone_id SERIAL NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	latitude FLOAT NOT NULL, 
	longitude FLOAT NOT NULL, 
	radius_m INTEGER NOT NULL, 
	capacity INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	historical_flood_vulnerability NUMERIC(5, 2), 
	traffic_speed_baseline NUMERIC(6, 2), 
	PRIMARY KEY (zone_id)
);

-- crowd_snapshots
CREATE TABLE crowd_snapshots (
	snapshot_id BIGSERIAL NOT NULL, 
	zone_id INTEGER, 
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	crowd_score NUMERIC(5, 2), 
	poi_count INTEGER, 
	hazard_count INTEGER, 
	confidence_score NUMERIC(5, 2), 
	PRIMARY KEY (snapshot_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id)
);

-- poi_master
CREATE TABLE poi_master (
	poi_id VARCHAR(100) NOT NULL, 
	name VARCHAR(255), 
	category VARCHAR(100), 
	latitude DOUBLE PRECISION, 
	longitude DOUBLE PRECISION, 
	zone_id INTEGER, 
	source VARCHAR(50), 
	last_refresh TIMESTAMP WITHOUT TIME ZONE, 
	is_safe_zone BOOLEAN, 
	PRIMARY KEY (poi_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id)
);

-- risk_alerts
CREATE TABLE risk_alerts (
	alert_id BIGSERIAL NOT NULL, 
	zone_id INTEGER, 
	disruption_type VARCHAR(50), 
	severity VARCHAR(20), 
	alert_timestamp TIMESTAMP WITHOUT TIME ZONE, 
	message TEXT, 
	status VARCHAR(20), 
	probability_percentage NUMERIC(5, 2), 
	estimated_time_to_peak TIMESTAMP WITHOUT TIME ZONE, 
	estimated_resolution_at TIMESTAMP WITHOUT TIME ZONE,
	resolution_confidence NUMERIC(5, 2),
	resolved_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (alert_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id)
);

-- traffic_snapshots
CREATE TABLE traffic_snapshots (
	snapshot_id BIGSERIAL NOT NULL, 
	zone_id INTEGER, 
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	speed NUMERIC(6, 2), 
	congestion NUMERIC(6, 2), 
	travel_time NUMERIC(8, 2), 
	PRIMARY KEY (snapshot_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id)
);

-- waterway_snapshots
CREATE TABLE waterway_snapshots (
	snapshot_id BIGSERIAL NOT NULL, 
	waterway_id BIGINT NOT NULL, 
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	rainfall_mm NUMERIC(8, 2), 
	estimated_flow_cms NUMERIC(10, 2), 
	water_level_m NUMERIC(8, 2), 
	flood_score NUMERIC(5, 2), 
	PRIMARY KEY (snapshot_id), 
	FOREIGN KEY(waterway_id) REFERENCES jabodetabek_waterways (hyriv_id) ON DELETE CASCADE
);

-- waterway_telemetry
CREATE TABLE waterway_telemetry (
	telemetry_id BIGSERIAL NOT NULL, 
	hyriv_id BIGINT NOT NULL, 
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	water_level_cm FLOAT, 
	flow_rate_cms FLOAT, 
	capacity_percentage FLOAT, 
	alert_level VARCHAR(20), 
	PRIMARY KEY (telemetry_id), 
	FOREIGN KEY(hyriv_id) REFERENCES jabodetabek_waterways (hyriv_id)
);

-- weather_snapshots
CREATE TABLE weather_snapshots (
	snapshot_id BIGSERIAL NOT NULL, 
	zone_id INTEGER, 
	timestamp TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	rainfall NUMERIC(8, 2), 
	humidity NUMERIC(5, 2), 
	wind_speed NUMERIC(6, 2), 
	PRIMARY KEY (snapshot_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id)
);

-- zone_status
CREATE TABLE zone_status (
	zone_id INTEGER NOT NULL, 
	traffic_score NUMERIC(5, 2), 
	weather_score NUMERIC(5, 2), 
	crowd_score NUMERIC(5, 2), 
	earthquake_score NUMERIC(5, 2), 
	waterway_score NUMERIC(5, 2), 
	overall_risk_score NUMERIC(5, 2), 
	last_updated TIMESTAMP WITHOUT TIME ZONE, 
	dominant_risk VARCHAR(50), 
	recommended_action TEXT, 
	PRIMARY KEY (zone_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id)
);

-- zone_waterway_mapping
CREATE TABLE zone_waterway_mapping (
	zone_id INTEGER NOT NULL, 
	hyriv_id BIGINT NOT NULL, 
	distance_m FLOAT, 
	PRIMARY KEY (zone_id, hyriv_id), 
	FOREIGN KEY(zone_id) REFERENCES zones (zone_id), 
	FOREIGN KEY(hyriv_id) REFERENCES jabodetabek_waterways (hyriv_id)
);

-- poi_crowd_status
CREATE TABLE poi_crowd_status (
	poi_id VARCHAR(100) NOT NULL, 
	crowd_score NUMERIC(5, 2), 
	confidence_score NUMERIC(5, 2), 
	last_updated TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (poi_id), 
	FOREIGN KEY(poi_id) REFERENCES poi_master (poi_id) ON DELETE CASCADE
);
