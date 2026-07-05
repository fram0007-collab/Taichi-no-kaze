from http.server import BaseHTTPRequestHandler
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass  # suppress default logging

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        try:
            conn = get_conn()
            cur = conn.cursor()
            display_all = os.environ.get("DISPLAY_ALL_EARTHQUAKES","false").lower()=="true"
            limit = "" if display_all else "LIMIT 5"
            cur.execute(f"""
                SELECT event_id, magnitude, depth_km, latitude, longitude,
                       event_timestamp, location, impact_radius_km, wilayah, potensi, depth, datetime
                FROM earthquake_events ORDER BY event_timestamp DESC {limit}
            """)
            rows = cur.fetchall()
            cur.close(); conn.close()
            result = []
            for q in rows:
                result.append({
                    "event_id": q["event_id"],
                    "magnitude": float(q["magnitude"]) if q["magnitude"] else None,
                    "depth_km": float(q["depth_km"]) if q["depth_km"] else None,
                    "latitude": float(q["latitude"]) if q["latitude"] else None,
                    "longitude": float(q["longitude"]) if q["longitude"] else None,
                    "event_timestamp": q["event_timestamp"].isoformat() if q["event_timestamp"] else None,
                    "location": q["location"], "wilayah": q["wilayah"], "potensi": q["potensi"],
                    "depth": q["depth"],
                    "datetime": q["datetime"].isoformat() if q["datetime"] else None,
                    "impact_radius_km": float(q["impact_radius_km"]) if q["impact_radius_km"] else None,
                })
            send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[earthquakes] Error: {e}")
