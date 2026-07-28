import httpx
import json
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

app = FastAPI(title="Taichi-no-kaze External API Mock Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-Memory State ─────────────────────────────────────────────────────────
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

# ── In-Memory Request & Response Debug Logs (Ring Buffer) ───────────────────
MAX_LOG_ENTRIES = 100
request_logs: List[Dict[str, Any]] = []
log_id_counter = 0

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
    global log_id_counter, request_logs
    log_id_counter += 1
    
    # Filter sensitive headers if needed
    clean_headers = {k: v for k, v in req_headers.items() if k.lower() not in ["authorization", "cookie"]}
    
    entry = {
        "id": log_id_counter,
        "timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3],
        "service": service,
        "mode": state["mode"],
        "is_critical": state["services"].get(service, {}).get("critical", False),
        "method": method,
        "path": path,
        "query_params": params,
        "request_headers": clean_headers,
        "request_body": req_body,
        "status_code": status_code,
        "response_body": res_body,
    }
    
    request_logs.insert(0, entry) # newest first
    if len(request_logs) > MAX_LOG_ENTRIES:
        request_logs.pop()

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

@app.get("/api/logs")
def get_logs():
    return {"total": len(request_logs), "logs": request_logs}

@app.post("/api/logs/clear")
def clear_logs():
    global request_logs
    request_logs = []
    return {"status": "success", "message": "Debug logs cleared"}

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
        gempa_item = {
            "Tanggal": datetime.now().strftime("%d %b %Y"),
            "Jam": datetime.now().strftime("%H:%M:%S WIB"),
            "DateTime": now_str,
            "Coordinates": "-6.200,106.816",
            "Lintang": "6.20 LS",
            "Bujur": "106.81 BT",
            "Magnitude": "7.2",
            "Kedalaman": "10 km",
            "Wilayah": "Pusat Gempa 10 km Barat Daya Jakarta - Potensi Tsunami & Kerusakan Severe",
            "Potensi": "Potensi Tsunami di Pesisir Jakarta"
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
        current_speed = 5.0
        free_flow = 50.0
        current_travel_time = 600
        free_flow_travel_time = 60
    else:
        current_speed = 46.0
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
        duration_str = "600s"
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
