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
            cur.execute("""
                SELECT p.poi_id, p.name, p.category, p.latitude, p.longitude,
                       p.is_safe_zone, pcs.crowd_score
                FROM poi_master p
                LEFT JOIN poi_crowd_status pcs ON p.poi_id = pcs.poi_id
                WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
                ORDER BY p.category, p.name
            """)
            rows = cur.fetchall()
            cur.close(); conn.close()
            result = [{"poi_id": r["poi_id"], "name": r["name"], "category": r["category"],
                       "lat": float(r["latitude"]), "lon": float(r["longitude"]),
                       "is_safe_zone": r["is_safe_zone"], "is_suppressed": False,
                       "crowd_score": float(r["crowd_score"]) if r["crowd_score"] else None}
                      for r in rows]
            send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[pois] Error: {e}")
