# DIS-RUPTURE — External API Mock Server

The **DIS-RUPTURE Mock Server** runs on `http://localhost:8081` to simulate or proxy external disaster telemetry and traffic data feeds consumed by the background worker and backend scoring engine.

---

## 🚀 Quick Start

### Launch Options
- **Dedicated Batch Script**:
  ```cmd
  launch_mock.bat
  ```
- **Terminal Execution**:
  ```bash
  venv\Scripts\python -m mockserver.run
  ```
- **Concurrent System Launch**:
  ```cmd
  launch_all.bat
  ```

---

## 🎛️ Operation Modes

The mock server dashboard (`http://localhost:8081/`) supports two global operation modes:

1. **🎭 Mock Responses Mode (Default)**:
   Returns controlled synthetic payloads simulating either **Normal** or **Critical** disaster conditions.

2. **🌐 Bypass Mode (Live External Proxy)**:
   Passes requests directly to actual live upstream APIs:
   - Open-Meteo: `https://api.open-meteo.com`
   - BMKG Earthquake: `https://data.bmkg.go.id`
   - TomTom Traffic: `https://api.tomtom.com`
   - Google Routes: `https://routes.googleapis.com`

---

## 🚨 Simulated Critical Events & Threshold Criteria

The **Critical Event** simulation criteria are derived directly from the Predictive Disruption Engine logic in `worker/engine.py`:

| Service | Endpoint | Normal State | Critical Event State | Engine Logic Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **Open-Meteo Weather** | `GET /v1/forecast` | Mild weather: `rainfall: 0.5mm`, `wind: 8km/h`, `humidity: 72%`, `prob: 12%` | **Compound Monsoon Burst**: `rainfall: 58.5mm/h`, `wind: 42km/h`, `humidity: 96%`, `prob: 98.5%` | `rainfall >= 50.0mm` yields `weather_score >= 85.0` (High/Extreme Flood Warning) |
| **BMKG Earthquake** | `GET /DataMKG/TEWS/gempaterkini.json` | Minor offshore event: `M3.4`, depth `120km`, Buleleng-Bali | **Severe Near-Jakarta Quake**: `M7.2`, depth `10km`, centroid `-6.200, 106.816` | `Magnitude >= 6.0` near zone triggers impact radius $>100\text{km}$ & emergency push alert |
| **TomTom Traffic** | `GET /traffic/services/4/flowSegmentData/...` | Free flow: `currentSpeed: 46km/h`, `travelTime: 65s` | **Gridlock Traffic**: `currentSpeed: 5km/h`, `travelTime: 600s`, `congestion > 0.9` | Speed drop $>80\%$ below baseline drives `traffic_score > 85.0` |
| **Google Routes** | `POST /directions/v2:computeRoutes` | Normal drive: `duration: "65s"`, `staticDuration: "60s"` | **10x Delay Spike**: `duration: "600s"`, `staticDuration: "60s"` | 10$\times$ duration multiplier causes heavy congestion drop calculation |

---

## 🔍 Live HTTP Debug Inspector

The web control dashboard at `http://localhost:8081/` includes a real-time HTTP connection debugger:
- Intercepts and logs all incoming requests to the mock server.
- Shows timestamp, HTTP method, service name, path, active mode, critical state, and HTTP status.
- Expandable accordion cards allow inspecting complete **Query Parameters**, **Request Headers**, **Request Body**, and **Response JSON Payloads**.

---

## 🔌 Programmatic Control REST Endpoints

You can programmatically control the mock server state via HTTP calls:

- **Get Status**: `GET http://localhost:8081/api/status`
- **Toggle Mode & Critical State**: `POST http://localhost:8081/api/toggle`
  ```json
  {
    "mode": "mock",         // "mock" or "bypass"
    "service": "openmeteo", // "all", "openmeteo", "bmkg", "tomtom", "google"
    "critical": true        // true or false
  }
  ```
- **Fetch Debug Logs**: `GET http://localhost:8081/api/logs`
- **Clear Debug Logs**: `POST http://localhost:8081/api/logs/clear`
