"""
POST /api/alerts/notification-preview
Builds and returns a push notification payload for a given alert.
Used by the frontend to preview what a notification will look like.
Body: { alert, preferences, safe_areas }
"""
from http.server import BaseHTTPRequestHandler
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import send_json, send_cors_preflight

DISRUPTION_TYPE_MAP = {
    "flood": "waterway", "waterway": "waterway",
    "traffic": "traffic", "crowd": "crowd",
    "weather": "weather", "earthquake": "earthquake",
}

SEVERITY_EMOJI = {"HIGH": "🚨", "MEDIUM": "⚠️", "LOW": "ℹ️", "CRITICAL": "🆘"}
DISRUPTION_EMOJI = {
    "traffic": "🚗", "crowd": "👥", "weather": "⛈️",
    "waterway": "🌊", "earthquake": "🌍",
}

def _coerce_number(val):
    try: return float(val)
    except (TypeError, ValueError): return None

def _normalize_type(t):
    return DISRUPTION_TYPE_MAP.get((t or "").lower(), (t or "").lower())

def matches_preferences(alert, prefs):
    if not prefs or not prefs.get("enabled", True): return True
    types = prefs.get("types") or {}
    dtype = _normalize_type(alert.get("disruption_type"))
    return types.get(dtype, True)

def find_safe_area(alert, safe_areas):
    if not safe_areas: return None
    return min(safe_areas, key=lambda s: _coerce_number(s.get("distance_km")) or 999, default=None)

def build_message(alert, safe_area):
    dtype = _normalize_type(alert.get("disruption_type"))
    sev = str(alert.get("severity") or "MEDIUM").upper()
    zone = alert.get("zone_name") or "the affected area"
    emoji = DISRUPTION_EMOJI.get(dtype, "⚠️")
    sev_emoji = SEVERITY_EMOJI.get(sev, "⚠️")

    parts = [f"{sev_emoji} {sev} {dtype.capitalize()} disruption at {zone}."]

    dist = _coerce_number(alert.get("distance_km"))
    if dist is not None:
        parts.append(f"Distance: {dist:.1f} km from you.")

    if dtype == "traffic":
        spd = _coerce_number(alert.get("current_speed"))
        if spd: parts.append(f"Current speed: {spd:.0f} km/h.")
    elif dtype == "waterway":
        lvl = _coerce_number(alert.get("water_level_cm"))
        river = alert.get("river_name")
        if lvl and river: parts.append(f"{river} at {lvl:.0f}cm ({alert.get('alert_level','')}).")
    elif dtype == "earthquake":
        mag = _coerce_number(alert.get("magnitude"))
        if mag: parts.append(f"Magnitude M{mag:.1f}.")
    elif dtype == "weather":
        rain = _coerce_number(alert.get("rainfall_intensity_mm"))
        if rain: parts.append(f"Rainfall: {rain:.0f}mm/hr.")

    if safe_area:
        parts.append(f"Nearest safe area: {safe_area.get('name')} ({safe_area.get('distance_km', '?')} km).")

    return " ".join(parts)

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            alert = body.get('alert') or {}
            preferences = body.get('preferences') or {}
            safe_areas = body.get('safe_areas') or []

            if not alert:
                send_json(self, {'error': 'alert required'}, 400)
                return

            if not matches_preferences(alert, preferences):
                send_json(self, None)
                return

            safe_area = find_safe_area(alert, safe_areas)
            message = build_message(alert, safe_area)
            dtype = _normalize_type(alert.get("disruption_type"))
            severity = str(alert.get("severity") or "MEDIUM").upper()
            alert_id = alert.get("alert_id")
            zone_id = alert.get("zone_id")
            zone_name = alert.get("zone_name") or "the affected area"

            payload = {
                "alert_id": alert_id,
                "disruption_type": dtype,
                "severity": severity,
                "zone_name": zone_name,
                "distance_km": _coerce_number(alert.get("distance_km")),
                "message": message,
                "safe_area": safe_area,
                "map_link": (
                    f"/?alert_id={alert_id}&zone_id={zone_id}" if alert_id and zone_id
                    else f"/?alert_id={alert_id}" if alert_id else "/"
                ),
            }

            send_json(self, payload)
        except Exception as e:
            send_json(self, {'error': 'Internal server error'}, 500)
            print(f'[alerts/notification-preview] Error: {e}')
