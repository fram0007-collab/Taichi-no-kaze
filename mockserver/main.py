import os
import time
import json
import math
import random
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from pathlib import Path

import requests
import urllib3
from fastapi import FastAPI, Request, Query, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Suppress certificate warnings from urllib3 for inspection proxies
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mockserver")

app = FastAPI(title="DIS-RUPTURE External API Mock Server & Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# In-Memory Configuration
config = {
    "mock_active": True,
    "mock_tomtom": True,
    "mock_openmeteo": True,
    "mock_bmkg": True,
    "traffic_scenario": "normal",  # normal, congested
    "weather_scenario": "normal",  # normal, monsoon
    "earthquake_scenario": {
        "active": False,
        "magnitude": 6.2,
        "depth_km": 15.0,
        "latitude": -6.2,
        "longitude": 106.8,
        "location": "South of Jakarta, Indonesia",
    }
}

# In-Memory Log (Holds last 1000 requests)
request_logs = []
log_counter = 0

# Load zone cache from seed data to support realistic proximity lookups
zones_cache = []
try:
    seed_file = PROJECT_ROOT / "mockserver" / "seed_data.json"
    if seed_file.exists():
        with open(seed_file, "r", encoding="utf-8") as f:
            seed_data = json.load(f)
            zones_cache = seed_data.get("zones", [])
            logger.info(f"Loaded {len(zones_cache)} zones for mock routing.")
except Exception as e:
    logger.error(f"Could not load seed_data.json for mock coordinates: {e}")

# Helper: Haversine distance
def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    lam1, lam2 = math.radians(lon1), math.radians(lon2)
    cos_a = max(-1.0, min(1.0,
        math.sin(phi1) * math.sin(phi2)
        + math.cos(phi1) * math.cos(phi2) * math.cos(lam2 - lam1)
    ))
    return 6_371_000 * math.acos(cos_a)

def add_log(method: str, path: str, query_params: dict, request_body: str, response_status: int, response_body: dict, mode: str):
    global log_counter
    log_counter += 1
    log_entry = {
        "id": log_counter,
        "timestamp": datetime.now().isoformat(),
        "method": method,
        "path": path,
        "query_params": query_params,
        "request_body": request_body,
        "response_status": response_status,
        "response_body": response_body,
        "mode": mode
    }
    request_logs.insert(0, log_entry)
    # Maintain max 1000 items
    if len(request_logs) > 1000:
        request_logs.pop()

# ── TomTom Traffic Interceptor ────────────────────────────────────────────────
@app.get("/traffic/services/4/flowSegmentData/absolute/10/json")
async def tomtom_flow(request: Request, point: str = Query(..., description="lat,lon")):
    if not config["mock_active"] or not config.get("mock_tomtom", True):
        # Transparent Proxy
        real_url = f"https://api.tomtom.com{request.url.path}"
        try:
            resp = requests.get(real_url, params=dict(request.query_params), timeout=10, verify=False)
            resp_json = resp.json()
            add_log("GET", request.url.path, dict(request.query_params), "", resp.status_code, resp_json, "proxy")
            return JSONResponse(content=resp_json, status_code=resp.status_code)
        except Exception as e:
            add_log("GET", request.url.path, dict(request.query_params), "", 500, {"error": str(e)}, "proxy")
            return JSONResponse(content={"error": str(e)}, status_code=500)

    # Mock behavior
    try:
        lat_str, lon_str = point.split(",")
        lat, lon = float(lat_str), float(lon_str)
    except Exception:
        lat, lon = -6.2088, 106.8175

    # Find closest zone
    closest_zone = None
    min_dist = float("inf")
    for z in zones_cache:
        dist = haversine_m(lat, lon, z["latitude"], z["longitude"])
        if dist < min_dist:
            min_dist = dist
            closest_zone = z

    baseline_speed = float(closest_zone["traffic_speed_baseline"]) if closest_zone else 40.0
    
    # Generate speeds based on scenario
    if config["traffic_scenario"] == "congested":
        # Heavy Traffic: 60-80% speed drop
        current_speed = round(baseline_speed * random.uniform(0.2, 0.4), 2)
        free_flow_speed = baseline_speed
        current_travel_time = 360
        free_flow_travel_time = 90
    else:
        # Normal Traffic: minor speed drops
        current_speed = round(baseline_speed * random.uniform(0.85, 1.05), 2)
        free_flow_speed = baseline_speed
        current_travel_time = 110
        free_flow_travel_time = 95

    mock_resp = {
        "flowSegmentData": {
            "currentSpeed": current_speed,
            "freeFlowSpeed": free_flow_speed,
            "currentTravelTime": current_travel_time,
            "freeFlowTravelTime": free_flow_travel_time,
            "confidence": 0.98,
            "roadClosure": False
        }
    }

    add_log("GET", request.url.path, dict(request.query_params), "", 200, mock_resp, "mock")
    return mock_resp

# ── BMKG Earthquake Interceptor ────────────────────────────────────────────────
@app.get("/DataMKG/TEWS/gempaterkini.json")
async def bmkg_earthquakes(request: Request):
    if not config["mock_active"] or not config.get("mock_bmkg", True):
        # Transparent Proxy
        real_url = f"https://data.bmkg.go.id{request.url.path}"
        try:
            resp = requests.get(real_url, timeout=10, verify=False)
            resp_json = resp.json()
            add_log("GET", request.url.path, {}, "", resp.status_code, resp_json, "proxy")
            return JSONResponse(content=resp_json, status_code=resp.status_code)
        except Exception as e:
            add_log("GET", request.url.path, {}, "", 500, {"error": str(e)}, "proxy")
            return JSONResponse(content={"error": str(e)}, status_code=500)

    # Mock behavior
    gempa_list = []
    
    # If simulated earthquake is active, put it first in the list
    if config["earthquake_scenario"]["active"]:
        eq = config["earthquake_scenario"]
        dt_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        gempa_list.append({
            "Tanggal": datetime.utcnow().strftime("%d %b %Y"),
            "Jam": datetime.utcnow().strftime("%H:%M:%S WIB"),
            "DateTime": datetime.utcnow().isoformat() + "+07:00",
            "Coordinates": f"{eq['latitude']},{eq['longitude']}",
            "Lintang": f"{abs(eq['latitude'])} LS" if eq['latitude'] < 0 else f"{eq['latitude']} LU",
            "Bujur": f"{eq['longitude']} BT",
            "Magnitude": f"{eq['magnitude']}",
            "Kedalaman": f"{eq['depth_km']} km",
            "Wilayah": eq["location"],
            "Potensi": "Tidak berpotensi tsunami"
        })

    # Add standard historical earthquakes as background noise
    gempa_list.append({
        "Tanggal": "11 Jun 2026",
        "Jam": "22:15:30 WIB",
        "DateTime": "2026-06-11T22:15:30+07:00",
        "Coordinates": "-8.21,107.45",
        "Lintang": "8.21 LS",
        "Bujur": "107.45 BT",
        "Magnitude": "4.8",
        "Kedalaman": "24 km",
        "Wilayah": "South of Java, Indonesia",
        "Potensi": "Tidak berpotensi tsunami"
    })

    mock_resp = {
        "Infogempa": {
            "gempa": gempa_list
        }
    }

    add_log("GET", request.url.path, {}, "", 200, mock_resp, "mock")
    return mock_resp

# ── Open-Meteo Weather Interceptor ──────────────────────────────────────────────
@app.get("/v1/forecast")
async def open_meteo_forecast(request: Request, latitude: float = Query(...), longitude: float = Query(...)):
    if not config["mock_active"] or not config.get("mock_openmeteo", True):
        # Transparent Proxy
        real_url = f"https://api.open-meteo.com{request.url.path}"
        try:
            resp = requests.get(real_url, params=dict(request.query_params), timeout=10, verify=False)
            resp_json = resp.json()
            add_log("GET", request.url.path, dict(request.query_params), "", resp.status_code, resp_json, "proxy")
            return JSONResponse(content=resp_json, status_code=resp.status_code)
        except Exception as e:
            add_log("GET", request.url.path, dict(request.query_params), "", 500, {"error": str(e)}, "proxy")
            return JSONResponse(content={"error": str(e)}, status_code=500)

    # Mock behavior
    now = datetime.now()
    start_time = datetime(now.year, now.month, now.day, now.hour)
    
    times = []
    precips = []
    humidities = []
    winds = []

    # Weather scenario parameters
    is_monsoon = config["weather_scenario"] == "monsoon"
    downpour_start = 14
    downpour_duration = 3

    for offset in range(24):
        forecast_time = start_time + timedelta(hours=offset)
        hour = forecast_time.hour
        times.append(forecast_time.strftime("%Y-%m-%dT%H:00"))
        
        if is_monsoon and (downpour_start <= hour < downpour_start + downpour_duration):
            # Monsoon burst: heavy rain (12mm to 18mm)
            precips.append(round(random.uniform(12.0, 18.0), 1))
            humidities.append(round(random.uniform(90.0, 98.0), 1))
            winds.append(round(random.uniform(28.0, 38.0), 1))
        else:
            # Normal: light/no rain
            precips.append(round(random.uniform(0.0, 0.5), 1))
            humidities.append(round(random.uniform(65.0, 78.0), 1))
            winds.append(round(random.uniform(6.0, 14.0), 1))

    mock_resp = {
        "latitude": latitude,
        "longitude": longitude,
        "generationtime_ms": 0.12,
        "utc_offset_seconds": 25200,
        "timezone": "Asia/Jakarta",
        "timezone_abbreviation": "WIB",
        "elevation": 10.0,
        "hourly_units": {
            "time": "iso8601",
            "precipitation": "mm",
            "relative_humidity_2m": "%",
            "wind_speed_10m": "km/h"
        },
        "hourly": {
            "time": times,
            "precipitation": precips,
            "relative_humidity_2m": humidities,
            "wind_speed_10m": winds
        }
    }

    add_log("GET", request.url.path, dict(request.query_params), "", 200, mock_resp, "mock")
    return mock_resp

# ── Control & Dashboard Endpoints ─────────────────────────────────────────────
@app.get("/mockserver/config")
async def get_config():
    return config

@app.post("/mockserver/config")
async def update_config(payload: dict):
    global config
    if "mock_active" in payload:
        config["mock_active"] = bool(payload["mock_active"])
    if "mock_tomtom" in payload:
        config["mock_tomtom"] = bool(payload["mock_tomtom"])
    if "mock_openmeteo" in payload:
        config["mock_openmeteo"] = bool(payload["mock_openmeteo"])
    if "mock_bmkg" in payload:
        config["mock_bmkg"] = bool(payload["mock_bmkg"])
    if "traffic_scenario" in payload:
        config["traffic_scenario"] = str(payload["traffic_scenario"])
    if "weather_scenario" in payload:
        config["weather_scenario"] = str(payload["weather_scenario"])
    if "earthquake_scenario" in payload:
        config["earthquake_scenario"].update(payload["earthquake_scenario"])
    return config

@app.get("/mockserver/logs")
async def get_logs(
    page: int = Query(1, ge=1),
    path: Optional[str] = None,
    mode: Optional[str] = None,
    status: Optional[str] = None
):
    filtered = request_logs
    
    if path:
        filtered = [x for x in filtered if path.lower() in x["path"].lower()]
    if mode:
        filtered = [x for x in filtered if x["mode"].lower() == mode.lower()]
    if status:
        filtered = [x for x in filtered if str(x["response_status"]) == status]

    page_size = 100
    total_items = len(filtered)
    total_pages = max(1, math.ceil(total_items / page_size))
    
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    
    return {
        "logs": filtered[start_idx:end_idx],
        "total_items": total_items,
        "page": page,
        "total_pages": total_pages
    }

@app.post("/mockserver/logs/clear")
async def clear_logs():
    global request_logs
    request_logs = []
    return {"status": "ok"}

@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    index_path = Path(__file__).resolve().parent / "frontend" / "index.html"
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read(), status_code=200)
    except Exception as e:
        return HTMLResponse(content=f"<h1>Error loading dashboard template</h1><p>{e}</p>", status_code=500)
