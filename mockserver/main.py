import httpx
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

class ToggleRequest(BaseModel):
    mode: Optional[str] = None  # "mock" or "bypass"
    service: Optional[str] = "all"  # "all", "openmeteo", "bmkg", "tomtom", "google"
    critical: Optional[bool] = None

# ── API Control Endpoints ────────────────────────────────────────────────────
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
            # Check if all are critical
            state["global_critical"] = all(s["critical"] for s in state["services"].values())
            
    return {"status": "success", "state": state}

# ── 1. Open-Meteo Weather API Mock/Proxy ────────────────────────────────────
@app.get("/v1/forecast")
async def open_meteo_forecast(
    latitude: float = Query(-6.200),
    longitude: float = Query(106.816),
    hourly: str = Query("precipitation,relative_humidity_2m,wind_speed_10m"),
    timezone_param: str = Query("Asia/Jakarta", alias="timezone"),
    forecast_days: int = Query(1)
):
    if state["mode"] == "bypass":
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": latitude,
                    "longitude": longitude,
                    "hourly": hourly,
                    "timezone": timezone_param,
                    "forecast_days": forecast_days,
                },
                timeout=10.0
            )
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
    
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
            # Extreme monsoon cloud burst (Compound Weather Event > 50mm)
            precip_probs.append(98.5)
            precips.append(58.5 if i in [3, 15] else 24.0)
            winds.append(42.0)
            humidities.append(96.0)
        else:
            precip_probs.append(12.0)
            precips.append(0.5)
            winds.append(8.0)
            humidities.append(72.0)

    return {
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

# ── 2. BMKG Earthquake API Mock/Proxy ───────────────────────────────────────
@app.get("/DataMKG/TEWS/gempaterkini.json")
async def bmkg_earthquake():
    if state["mode"] == "bypass":
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get("https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json", timeout=10.0)
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
    
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
        
    return {
        "Infogempa": {
            "gempa": [gempa_item]
        }
    }

# ── 3. TomTom Traffic API Mock/Proxy ────────────────────────────────────────
@app.get("/traffic/services/4/flowSegmentData/absolute/10/json")
async def tomtom_traffic(
    key: str = Query(""),
    point: str = Query("-6.200,106.816"),
    unit: str = Query("KMPH"),
    thickness: int = Query(1)
):
    if state["mode"] == "bypass":
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json",
                params={"key": key, "point": point, "unit": unit, "thickness": thickness},
                timeout=10.0
            )
            return JSONResponse(content=resp.json(), status_code=resp.status_code)
            
    is_critical = state["services"]["tomtom"]["critical"]
    
    if is_critical:
        # Extreme congestion gridlock
        current_speed = 5.0
        free_flow = 50.0
        current_travel_time = 600
        free_flow_travel_time = 60
    else:
        # Smooth traffic
        current_speed = 46.0
        free_flow = 50.0
        current_travel_time = 65
        free_flow_travel_time = 60

    return {
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

# ── 4. Google Maps Routes API Mock/Proxy ────────────────────────────────────
@app.post("/directions/v2:computeRoutes")
async def google_routes(request: Request):
    if state["mode"] == "bypass":
        headers = {k: v for k, v in request.headers.items() if k.lower() in ["content-type", "x-goog-fieldmask", "x-goog-api-key"]}
        body = await request.json()
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.post(
                "https://routes.googleapis.com/directions/v2:computeRoutes",
                json=body,
                headers=headers,
                timeout=10.0
            )
            return JSONResponse(content=resp.json(), status_code=resp.status_code)

    is_critical = state["services"]["google"]["critical"]
    
    if is_critical:
        # 10x traffic delay spike
        duration_str = "600s"
        static_duration_str = "60s"
    else:
        duration_str = "65s"
        static_duration_str = "60s"

    return {
        "routes": [
            {
                "duration": duration_str,
                "staticDuration": static_duration_str,
                "distanceMeters": 500
            }
        ]
    }

# ── Web Control Dashboard UI ────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def dashboard_ui():
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DIS-RUPTURE | External API Mock Server</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a;
                --card-bg: #1e293b;
                --accent: #38bdf8;
                --text: #f8fafc;
                --muted: #94a3b8;
                --danger: #ef4444;
                --success: #22c55e;
                --warning: #f59e0b;
                --border: #334155;
            }
            body {
                font-family: 'Inter', sans-serif;
                background-color: var(--bg);
                color: var(--text);
                margin: 0;
                padding: 2rem;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .container {
                max-width: 900px;
                width: 100%;
            }
            .header {
                text-align: center;
                margin-bottom: 2rem;
            }
            .header h1 {
                font-size: 2rem;
                font-weight: 700;
                color: var(--accent);
                margin: 0 0 0.5rem 0;
            }
            .header p {
                color: var(--muted);
                margin: 0;
            }
            .card {
                background: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 1.5rem;
                margin-bottom: 1.5rem;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            }
            .card h2 {
                font-size: 1.25rem;
                margin-top: 0;
                border-bottom: 1px solid var(--border);
                padding-bottom: 0.75rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .badge {
                font-size: 0.75rem;
                padding: 0.25rem 0.6rem;
                border-radius: 9999px;
                font-weight: 600;
                text-transform: uppercase;
            }
            .badge-mock { background: rgba(56, 189, 248, 0.2); color: var(--accent); }
            .badge-bypass { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
            
            .flex-group {
                display: flex;
                gap: 1rem;
                align-items: center;
            }
            .btn {
                background: #334155;
                color: var(--text);
                border: 1px solid var(--border);
                padding: 0.6rem 1.2rem;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .btn:hover {
                background: #475569;
            }
            .btn-active {
                background: var(--accent);
                color: #0f172a;
                border-color: var(--accent);
            }
            .btn-danger {
                background: var(--danger);
                color: #fff;
                border-color: var(--danger);
            }
            .btn-success {
                background: var(--success);
                color: #fff;
                border-color: var(--success);
            }
            .service-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1rem 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .service-row:last-child {
                border-bottom: none;
            }
            .service-info h3 {
                margin: 0 0 0.25rem 0;
                font-size: 1rem;
            }
            .service-info code {
                color: var(--muted);
                font-size: 0.85rem;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>DIS-RUPTURE External API Mock Server</h1>
                <p>Simulating external disaster & telemetry APIs on port <code>8081</code></p>
            </div>

            <!-- Global Mode Switcher -->
            <div class="card">
                <h2>
                    <span>Global Operation Mode</span>
                    <span id="modeBadge" class="badge badge-mock">Mock Responses</span>
                </h2>
                <div class="flex-group" style="margin-top: 1rem;">
                    <button id="btnMock" class="btn btn-active" onclick="setMode('mock')">🎭 Mock Responses Mode (Default)</button>
                    <button id="btnBypass" class="btn" onclick="setMode('bypass')">🌐 Bypass Mode (Live External Proxy)</button>
                </div>
            </div>

            <!-- Global Event Switcher -->
            <div class="card">
                <h2>Master Disruption Toggle</h2>
                <div class="flex-group" style="margin-top: 1rem;">
                    <button class="btn btn-success" onclick="setAllCritical(false)">✅ Set ALL Services Normal</button>
                    <button class="btn btn-danger" onclick="setAllCritical(true)">🚨 Trigger ALL Critical Events</button>
                </div>
            </div>

            <!-- Individual Service Toggles -->
            <div class="card">
                <h2>Supported External APIs & Criteria</h2>
                
                <!-- Open-Meteo Weather -->
                <div class="service-row">
                    <div class="service-info">
                        <h3>Open-Meteo Weather API</h3>
                        <code>GET /v1/forecast</code>
                    </div>
                    <div class="flex-group">
                        <button id="btn-openmeteo" class="btn" onclick="toggleService('openmeteo')">Normal</button>
                    </div>
                </div>

                <!-- BMKG Earthquake -->
                <div class="service-row">
                    <div class="service-info">
                        <h3>BMKG Earthquake Telemetry API</h3>
                        <code>GET /DataMKG/TEWS/gempaterkini.json</code>
                    </div>
                    <div class="flex-group">
                        <button id="btn-bmkg" class="btn" onclick="toggleService('bmkg')">Normal</button>
                    </div>
                </div>

                <!-- TomTom Traffic -->
                <div class="service-row">
                    <div class="service-info">
                        <h3>TomTom Traffic Flow API</h3>
                        <code>GET /traffic/services/4/flowSegmentData/...</code>
                    </div>
                    <div class="flex-group">
                        <button id="btn-tomtom" class="btn" onclick="toggleService('tomtom')">Normal</button>
                    </div>
                </div>

                <!-- Google Routes -->
                <div class="service-row">
                    <div class="service-info">
                        <h3>Google Maps Routes API</h3>
                        <code>POST /directions/v2:computeRoutes</code>
                    </div>
                    <div class="flex-group">
                        <button id="btn-google" class="btn" onclick="toggleService('google')">Normal</button>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let currentState = {};

            async function fetchStatus() {
                const res = await fetch('/api/status');
                currentState = await res.json();
                renderState();
            }

            function renderState() {
                // Mode
                const isMock = currentState.mode === 'mock';
                document.getElementById('modeBadge').className = isMock ? 'badge badge-mock' : 'badge badge-bypass';
                document.getElementById('modeBadge').innerText = isMock ? 'Mock Responses' : 'Bypass (Proxy)';
                
                document.getElementById('btnMock').className = isMock ? 'btn btn-active' : 'btn';
                document.getElementById('btnBypass').className = !isMock ? 'btn btn-active' : 'btn';

                // Services
                for (const [service, data] of Object.entries(currentState.services)) {
                    const btn = document.getElementById(`btn-${service}`);
                    if (btn) {
                        if (data.critical) {
                            btn.className = 'btn btn-danger';
                            btn.innerText = '🚨 Critical Event';
                        } else {
                            btn.className = 'btn btn-success';
                            btn.innerText = '✅ Normal';
                        }
                    }
                }
            }

            async function setMode(mode) {
                await fetch('/api/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: mode })
                });
                fetchStatus();
            }

            async function setAllCritical(isCritical) {
                await fetch('/api/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ service: 'all', critical: isCritical })
                });
                fetchStatus();
            }

            async function toggleService(service) {
                const isCrit = currentState.services[service]?.critical;
                await fetch('/api/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ service: service, critical: !isCrit })
                });
                fetchStatus();
            }

            fetchStatus();
            setInterval(fetchStatus, 3000);
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)
