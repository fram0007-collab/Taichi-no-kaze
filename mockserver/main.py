import sqlite3
import httpx
import json
import math
import random
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"
DB_FILE = Path(__file__).resolve().parent / "app.db"

app = FastAPI(title="Taichi-no-kaze External API Mock Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── SQLite Database Setup ───────────────────────────────────────────────────
def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS query_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                service TEXT NOT NULL,
                mode TEXT NOT NULL,
                is_critical INTEGER NOT NULL,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                query_params TEXT,
                request_headers TEXT,
                request_body TEXT,
                status_code INTEGER NOT NULL,
                response_body TEXT
            );
        """)
        conn.commit()

init_db()

# ── In-Memory State & Live Buffer ───────────────────────────────────────────
state = {
    "mode": "mock",  # "mock" or "bypass"
    "global_critical": False,
    "services": {
        "openmeteo": {"critical": False},
        "bmkg": {"critical": False},
        "tomtom": {"critical": False},
        "google": {"critical": False},
    }
}

MAX_LIVE_LOGS = 50
live_logs: List[Dict[str, Any]] = []
live_id_counter = 0

def log_connection(
    service: str,
    method: str,
    path: str,
    params: Dict[str, Any],
    req_headers: Dict[str, str],
    req_body: Any,
    status_code: int,
    res_body: Any
):
    global live_id_counter, live_logs
    live_id_counter += 1
    clean_headers = {k: v for k, v in req_headers.items() if k.lower() not in ["authorization", "cookie"]}
    timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    is_crit = state["services"].get(service, {}).get("critical", False)

    # 1. Store in In-Memory Live Log Stream Buffer
    live_entry = {
        "id": live_id_counter,
        "timestamp": timestamp,
        "service": service,
        "mode": state["mode"],
        "is_critical": is_crit,
        "method": method,
        "path": path,
        "query_params": params,
        "request_headers": clean_headers,
        "request_body": req_body,
        "status_code": status_code,
        "response_body": res_body,
    }
    live_logs.insert(0, live_entry)
    if len(live_logs) > MAX_LIVE_LOGS:
        live_logs.pop()

    # 2. Persist in SQLite Database (mockserver/app.db)
    with get_db_connection() as conn:
        conn.execute("""
            INSERT INTO query_logs (
                timestamp, service, mode, is_critical, method, path,
                query_params, request_headers, request_body, status_code, response_body
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            timestamp,
            service,
            state["mode"],
            1 if is_crit else 0,
            method,
            path,
            json.dumps(params),
            json.dumps(clean_headers),
            json.dumps(req_body) if req_body is not None else None,
            status_code,
            json.dumps(res_body) if res_body is not None else None
        ))
        conn.commit()

class ToggleRequest(BaseModel):
    mode: Optional[str] = None  # "mock" or "bypass"
    service: Optional[str] = "all"  # "all", "openmeteo", "bmkg", "tomtom", "google"
    critical: Optional[bool] = None

# ── API Control & Debug Endpoints ───────────────────────────────────────────
@app.get("/api/status")
def get_status():
    return state

@app.post("/api/toggle")
def toggle_state(req: ToggleRequest):
    if req.mode in ["mock", "bypass"]:
        state["mode"] = req.mode
    
    if req.critical is not None:
        if req.service == "all":
            state["global_critical"] = req.critical
            for s in state["services"]:
                state["services"][s]["critical"] = req.critical
        elif req.service in state["services"]:
            state["services"][req.service]["critical"] = req.critical
            state["global_critical"] = all(s["critical"] for s in state["services"].values())
            
    return {"status": "success", "state": state}

# Panel 1 API: In-Memory Live Debug Stream
@app.get("/api/live_logs")
def get_live_logs():
    return {"total": len(live_logs), "logs": live_logs}

@app.post("/api/live_logs/clear")
def clear_live_logs():
    global live_logs
    live_logs = []
    return {"status": "success", "message": "Live debug stream cleared"}

# Panel 2 API: Persistent SQLite Database Query History
@app.get("/api/db_logs")
def get_db_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100)
):
    offset = (page - 1) * limit
    with get_db_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM query_logs ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)
        ).fetchall()
        
        total_count = conn.execute("SELECT COUNT(*) FROM query_logs").fetchone()[0]
        
    logs = []
    for r in rows:
        logs.append({
            "id": r["id"],
            "timestamp": r["timestamp"],
            "service": r["service"],
            "mode": r["mode"],
            "is_critical": bool(r["is_critical"]),
            "method": r["method"],
            "path": r["path"],
            "query_params": json.loads(r["query_params"]) if r["query_params"] else {},
            "request_headers": json.loads(r["request_headers"]) if r["request_headers"] else {},
            "request_body": json.loads(r["request_body"]) if r["request_body"] else None,
            "status_code": r["status_code"],
            "response_body": json.loads(r["response_body"]) if r["response_body"] else None,
        })
        
    total_pages = math.ceil(total_count / limit) if total_count > 0 else 1
        
    return {
        "total": total_count,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
        "logs": logs
    }

@app.post("/api/db_logs/clear")
def clear_db_logs():
    with get_db_connection() as conn:
        conn.execute("DELETE FROM query_logs")
        conn.commit()
    return {"status": "success", "message": "Database query logs cleared"}

# ── 1. Open-Meteo Weather API Mock/Proxy ────────────────────────────────────
@app.get("/v1/forecast")
async def open_meteo_forecast(
    request: Request,
    latitude: float = Query(-6.200),
    longitude: float = Query(106.816),
    hourly: str = Query("precipitation,relative_humidity_2m,wind_speed_10m"),
    timezone_param: str = Query("Asia/Jakarta", alias="timezone"),
    forecast_days: int = Query(1)
):
    params_dict = dict(request.query_params)
    
    if state["mode"] == "bypass":
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params=params_dict,
                timeout=10.0
            )
            res_json = resp.json()
            log_connection(
                service="openmeteo",
                method="GET",
                path=str(request.url.path),
                params=params_dict,
                req_headers=dict(request.headers),
                req_body=None,
                status_code=resp.status_code,
                res_body=res_json
            )
            return JSONResponse(content=res_json, status_code=resp.status_code)
    
    is_critical = state["services"]["openmeteo"]["critical"]
    times = []
    now = datetime.now()
    start = datetime(now.year, now.month, now.day, now.hour)
    
    precip_probs = []
    precips = []
    winds = []
    humidities = []
    
    for i in range(24):
        t = start.replace(hour=(start.hour + i) % 24)
        times.append(t.strftime("%Y-%m-%dT%H:00"))
        
        if is_critical and (2 <= i <= 5 or 14 <= i <= 17):
            precip_probs.append(98.5)
            precips.append(58.5 if i in [3, 15] else 24.0)
            winds.append(42.0)
            humidities.append(96.0)
        else:
            precip_probs.append(12.0)
            precips.append(0.5)
            winds.append(8.0)
            humidities.append(72.0)

    res_content = {
        "latitude": latitude,
        "longitude": longitude,
        "generationtime_ms": 0.12,
        "utc_offset_seconds": 25200,
        "timezone": "Asia/Jakarta",
        "timezone_abbreviation": "WIB",
        "hourly_units": {
            "time": "iso8601",
            "precipitation_probability": "%",
            "precipitation": "mm",
            "wind_speed_10m": "km/h",
            "relative_humidity_2m": "%"
        },
        "hourly": {
            "time": times,
            "precipitation_probability": precip_probs,
            "precipitation": precips,
            "wind_speed_10m": winds,
            "relative_humidity_2m": humidities
        }
    }
    
    log_connection(
        service="openmeteo",
        method="GET",
        path=str(request.url.path),
        params=params_dict,
        req_headers=dict(request.headers),
        req_body=None,
        status_code=200,
        res_body=res_content
    )
    return res_content

# ── 2. BMKG Earthquake API Mock/Proxy ───────────────────────────────────────
@app.get("/DataMKG/TEWS/gempaterkini.json")
async def bmkg_earthquake(request: Request):
    params_dict = dict(request.query_params)
    
    if state["mode"] == "bypass":
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get("https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json", timeout=10.0)
            res_json = resp.json()
            log_connection(
                service="bmkg",
                method="GET",
                path=str(request.url.path),
                params=params_dict,
                req_headers=dict(request.headers),
                req_body=None,
                status_code=resp.status_code,
                res_body=res_json
            )
            return JSONResponse(content=res_json, status_code=resp.status_code)
    
    is_critical = state["services"]["bmkg"]["critical"]
    now_str = datetime.now(timezone.utc).isoformat()
    
    if is_critical:
        random_mag = round(random.uniform(7.4, 8.8), 1)
        random_depth = random.randint(5, 12)
        
        gempa_item = {
            "Tanggal": datetime.now().strftime("%d %b %Y"),
            "Jam": datetime.now().strftime("%H:%M:%S WIB"),
            "DateTime": now_str,
            "Coordinates": "-6.200,106.816",
            "Lintang": "6.20 LS",
            "Bujur": "106.81 BT",
            "Magnitude": str(random_mag),
            "Kedalaman": f"{random_depth} km",
            "Wilayah": f"EPISENTRUM DAHSYAT M{random_mag} JAKARTA REGION (Kedalaman Shallow {random_depth}km) - High Impact Radius (>110km)",
            "Potensi": "BERPOTENSI TSUNAMI SANGAT BESAR DI PESISIR JAKARTA & JAWA BARAT"
        }
    else:
        gempa_item = {
            "Tanggal": datetime.now().strftime("%d %b %Y"),
            "Jam": datetime.now().strftime("%H:%M:%S WIB"),
            "DateTime": now_str,
            "Coordinates": "-8.120,115.200",
            "Lintang": "8.12 LS",
            "Bujur": "115.20 BT",
            "Magnitude": "3.4",
            "Kedalaman": "120 km",
            "Wilayah": "15 km BaratDaya BULELENG-BALI",
            "Potensi": "Tidak berpotensi tsunami"
        }
        
    res_content = {
        "Infogempa": {
            "gempa": [gempa_item]
        }
    }
    
    log_connection(
        service="bmkg",
        method="GET",
        path=str(request.url.path),
        params=params_dict,
        req_headers=dict(request.headers),
        req_body=None,
        status_code=200,
        res_body=res_content
    )
    return res_content

# ── 3. TomTom Traffic API Mock/Proxy ────────────────────────────────────────
@app.get("/traffic/services/4/flowSegmentData/absolute/10/json")
async def tomtom_traffic(
    request: Request,
    key: str = Query(""),
    point: str = Query("-6.200,106.816"),
    unit: str = Query("KMPH"),
    thickness: int = Query(1)
):
    params_dict = dict(request.query_params)
    
    if state["mode"] == "bypass":
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
                params=params_dict,
                timeout=10.0
            )
            res_json = resp.json()
            log_connection(
                service="tomtom",
                method="GET",
                path=str(request.url.path),
                params=params_dict,
                req_headers=dict(request.headers),
                req_body=None,
                status_code=resp.status_code,
                res_body=res_json
            )
            return JSONResponse(content=res_json, status_code=resp.status_code)
            
    is_critical = state["services"]["tomtom"]["critical"]
    
    if is_critical:
        current_speed = round(random.uniform(2.5, 5.0), 1)
        free_flow = 50.0
        current_travel_time = random.randint(600, 900)
        free_flow_travel_time = 60
    else:
        current_speed = round(random.uniform(44.0, 48.0), 1)
        free_flow = 50.0
        current_travel_time = 65
        free_flow_travel_time = 60

    res_content = {
        "flowSegmentData": {
            "frc": "FRC1",
            "currentSpeed": current_speed,
            "freeFlowSpeed": free_flow,
            "currentTravelTime": current_travel_time,
            "freeFlowTravelTime": free_flow_travel_time,
            "confidence": 0.98,
            "roadClosure": False,
            "coordinates": {
                "coordinate": [
                    {"latitude": -6.200, "longitude": 106.816}
                ]
            }
        }
    }
    
    log_connection(
        service="tomtom",
        method="GET",
        path=str(request.url.path),
        params=params_dict,
        req_headers=dict(request.headers),
        req_body=None,
        status_code=200,
        res_body=res_content
    )
    return res_content

# ── 4. Google Maps Routes API Mock/Proxy ────────────────────────────────────
@app.post("/directions/v2:computeRoutes")
async def google_routes(request: Request):
    params_dict = dict(request.query_params)
    body_json = None
    try:
        body_json = await request.json()
    except Exception:
        body_json = None

    if state["mode"] == "bypass":
        headers = {k: v for k, v in request.headers.items() if k.lower() in ["content-type", "x-goog-fieldmask", "x-goog-api-key"]}
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(
                "https://routes.googleapis.com/directions/v2:computeRoutes",
                json=body_json,
                headers=headers,
                timeout=10.0
            )
            res_json = resp.json()
            log_connection(
                service="google",
                method="POST",
                path=str(request.url.path),
                params=params_dict,
                req_headers=dict(request.headers),
                req_body=body_json,
                status_code=resp.status_code,
                res_body=res_json
            )
            return JSONResponse(content=res_json, status_code=resp.status_code)

    is_critical = state["services"]["google"]["critical"]
    
    if is_critical:
        duration_str = f"{random.randint(600, 900)}s"
        static_duration_str = "60s"
    else:
        duration_str = "65s"
        static_duration_str = "60s"

    res_content = {
        "routes": [
            {
                "duration": duration_str,
                "staticDuration": static_duration_str,
                "distanceMeters": 500
            }
        ]
    }

    log_connection(
        service="google",
        method="POST",
        path=str(request.url.path),
        params=params_dict,
        req_headers=dict(request.headers),
        req_body=body_json,
        status_code=200,
        res_body=res_content
    )
    return res_content

# ── Web Control Dashboard UI ────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def dashboard_ui():
    html_file = TEMPLATES_DIR / "index.html"
    return HTMLResponse(content=html_file.read_text(encoding="utf-8"))
