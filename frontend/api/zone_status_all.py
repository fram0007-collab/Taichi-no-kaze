from http.server import BaseHTTPRequestHandler
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight, zone_to_geojson_polygon

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass  # suppress default logging

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        try:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("""
                SELECT z.zone_id, z.name, z.latitude, z.longitude, z.radius_m,
                       z.historical_flood_vulnerability, z.traffic_speed_baseline,
                       zs.traffic_score, zs.weather_score, zs.crowd_score,
                       zs.earthquake_score, zs.waterway_score, zs.overall_risk_score,
                       zs.dominant_risk, zs.recommended_action, zs.last_updated
                FROM zones z LEFT JOIN zone_status zs ON z.zone_id = zs.zone_id
            """)
            zones = cur.fetchall()
            cur.execute("SELECT zone_id, disruption_type FROM risk_alerts WHERE status = 'OPEN'")
            open_dims = {}
            for r in cur.fetchall():
                open_dims.setdefault(r["zone_id"], set()).add((r["disruption_type"] or "").lower())
            cur.close(); conn.close()

            result = []
            for z in zones:
                overall = float(z["overall_risk_score"] or 0)
                traffic = float(z["traffic_score"] or 0)
                weather = float(z["weather_score"] or 0)
                crowd   = float(z["crowd_score"] or 0)
                eq      = float(z["earthquake_score"] or 0)
                ww      = float(z["waterway_score"] or 0)
                dom = z["dominant_risk"] or "weather"
                ds = {"traffic":traffic,"weather":weather,"crowd":crowd,"earthquake":eq,"waterway":ww}.get(dom, overall)
                sev = "HIGH" if ds >= 65 or overall >= 65 else "MEDIUM" if ds >= 25 or overall >= 25 else "LOW"
                geo = zone_to_geojson_polygon(float(z["latitude"] or 0), float(z["longitude"] or 0), float(z["radius_m"] or 1000))
                zd = {"zone_id":z["zone_id"],"id":z["zone_id"],"name":z["name"],
                      "latitude":float(z["latitude"] or 0),"longitude":float(z["longitude"] or 0),
                      "radius_m":float(z["radius_m"] or 1000),
                      "historical_flood_vulnerability":float(z["historical_flood_vulnerability"] or 0),
                      "traffic_speed_baseline":float(z["traffic_speed_baseline"] or 40),"geometry":geo}
                result.append({
                    "zone_id":z["zone_id"],"zone":zd,
                    "traffic_score":traffic,"weather_score":weather,"crowd_score":crowd,
                    "earthquake_score":eq,"waterway_score":ww,"overall_risk_score":overall,
                    "display_severity":sev,"dominant_risk":dom,
                    "recommended_action":z["recommended_action"] or "Monitor conditions.",
                    "last_updated":z["last_updated"].isoformat() if z["last_updated"] else None,
                    "open_threat_dims":sorted(open_dims.get(z["zone_id"], set())),
                })
            send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[zone-status/all] Error: {e}")
