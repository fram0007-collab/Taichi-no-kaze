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

                        cur.execute("SELECT zone_id, name, latitude, longitude, radius_m, historical_flood_vulnerability, traffic_speed_baseline, geometry FROM zones")
                        zone_map = {r["zone_id"]: dict(r) for r in cur.fetchall()}

                        cur.execute("""
                            SELECT alert_id, zone_id, disruption_type, severity, alert_timestamp,
                                   message, status, probability_percentage, estimated_time_to_peak,
                                   estimated_resolution_at, resolution_confidence
                            FROM risk_alerts
                            WHERE status = 'OPEN' AND probability_percentage >= 20
                            ORDER BY estimated_time_to_peak ASC
                        """)
                        alerts = cur.fetchall()
                        cur.close(); conn.close()

                        result = []
                        for a in alerts:
                            zd = zone_map.get(a["zone_id"])
                            if not zd: continue
                            geo = zd.get("geometry")
                            if isinstance(geo, str):
                                try: geo = json.loads(geo)
                                except: geo = None
                            result.append({
                                "alert_id": a["alert_id"],
                                "disruption_type": a["disruption_type"],
                                "severity": a["severity"],
                                "probability_percentage": float(a["probability_percentage"] or 0),
                                "estimated_time_to_peak": a["estimated_time_to_peak"].isoformat() if a["estimated_time_to_peak"] else None,
                                "estimated_resolution_at": a["estimated_resolution_at"].isoformat() if a["estimated_resolution_at"] else None,
                                "resolution_confidence": float(a["resolution_confidence"] or 0),
                                "message": a["message"],
                                "status": a["status"],
                                "alert_timestamp": a["alert_timestamp"].isoformat() if a["alert_timestamp"] else None,
                                "risk_level": (a["severity"] or "MEDIUM").capitalize(),
                                "zone": {
                                    "zone_id": zd["zone_id"], "id": zd["zone_id"], "name": zd["name"],
                                    "latitude": float(zd["latitude"] or 0), "longitude": float(zd["longitude"] or 0),
                                    "radius_m": float(zd["radius_m"] or 1000),
                                    "historical_flood_vulnerability": float(zd["historical_flood_vulnerability"] or 0),
                                    "traffic_speed_baseline": float(zd["traffic_speed_baseline"] or 40),
                                    "geometry": geo,
                                },
                            })
                        send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[predictions/active] Error: {e}")
