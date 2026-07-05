from http.server import BaseHTTPRequestHandler
import sys, os, json
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            days = min(int(qs.get('days', ['7'])[0]), 7)
            zone_id = qs.get('zone_id', [None])[0]

            zone_filter = "AND ra.zone_id = %s" % int(zone_id) if zone_id else ""

            conn = get_conn()
            cur = conn.cursor()
            cur.execute("""
                SELECT ra.alert_id, ra.zone_id, ra.disruption_type, ra.severity,
                       ra.status, ra.probability_percentage, ra.alert_timestamp,
                       ra.estimated_resolution_at, ra.resolution_confidence, ra.message,
                       z.name as zone_name
                FROM risk_alerts ra
                LEFT JOIN zones z ON ra.zone_id = z.zone_id
                WHERE ra.alert_timestamp >= NOW() - INTERVAL '%s days'
                %s
                ORDER BY ra.alert_timestamp DESC
                LIMIT 500
            """ % (days, zone_filter))
            rows = cur.fetchall()
            cur.close()
            conn.close()

            result = []
            for r in rows:
                result.append({
                    "alert_id": r["alert_id"],
                    "disruption_type": r["disruption_type"],
                    "severity": r["severity"],
                    "status": r["status"],
                    "probability_percentage": float(r["probability_percentage"] or 0),
                    "alert_timestamp": r["alert_timestamp"].isoformat() if r["alert_timestamp"] else None,
                    "estimated_resolution_at": r["estimated_resolution_at"].isoformat() if r["estimated_resolution_at"] else None,
                    "resolution_confidence": float(r["resolution_confidence"] or 0),
                    "message": r["message"],
                    "zone": {
                        "zone_id": r["zone_id"],
                        "name": r["zone_name"] or f"Zone {r['zone_id']}",
                    },
                })
            send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[alerts/history] Error: {e}")
