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
                            SELECT hyriv_id, main_riv, length_km, dis_av_cms,
                                   current_discharge_cms, discharge_ratio, alert_level,
                                   last_updated, coordinates_json
                            FROM jabodetabek_waterways
                        """)
                        rows = cur.fetchall()
                        cur.close(); conn.close()
                        result = []
                        for w in rows:
                            dis_av = float(w["dis_av_cms"] or 1)
                            current = float(w["current_discharge_cms"]) if w["current_discharge_cms"] is not None else dis_av
                            cap_pct = round((current / (dis_av * 2)) * 100, 1) if dis_av > 0 else 0
                            coords = []
                            if w["coordinates_json"]:
                                try: coords = json.loads(w["coordinates_json"])
                                except: pass
                            result.append({
                                "hyriv_id": w["hyriv_id"], "main_riv": w["main_riv"],
                                "average_discharge_cms": dis_av, "current_discharge_cms": current,
                                "alert_level": w["alert_level"] or "Normal",
                                "last_updated": w["last_updated"].isoformat() if w["last_updated"] else None,
                                "name": f"Waterway {w['hyriv_id']}", "category": "river",
                                "current_level": current, "max_capacity": round(dis_av * 2, 2),
                                "capacity_percentage": cap_pct, "coordinates": coords,
                            })
                        send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[rivers] Error: {e}")
