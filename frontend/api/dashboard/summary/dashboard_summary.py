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

            conn = get_conn()
            cur = conn.cursor()

            # Total alerts last N days
            cur.execute("""
                SELECT COUNT(*) as total,
                       COUNT(*) FILTER (WHERE status='OPEN') as open_count,
                       COUNT(*) FILTER (WHERE status='CLOSED') as closed_count,
                       COUNT(*) FILTER (WHERE severity='HIGH') as high_count,
                       COUNT(*) FILTER (WHERE severity='MEDIUM') as medium_count
                FROM risk_alerts
                WHERE alert_timestamp >= NOW() - INTERVAL '%s days'
            """ % days)
            totals = dict(cur.fetchone())

            # Dominant disruption type
            cur.execute("""
                SELECT disruption_type, COUNT(*) as cnt
                FROM risk_alerts
                WHERE alert_timestamp >= NOW() - INTERVAL '%s days'
                GROUP BY disruption_type
                ORDER BY cnt DESC
                LIMIT 1
            """ % days)
            top_type_row = cur.fetchone()
            dominant_type = top_type_row['disruption_type'] if top_type_row else 'N/A'

            # Daily trend (alerts per day)
            cur.execute("""
                SELECT DATE(alert_timestamp AT TIME ZONE 'Asia/Jakarta') as day,
                       COUNT(*) as count
                FROM risk_alerts
                WHERE alert_timestamp >= NOW() - INTERVAL '%s days'
                GROUP BY day
                ORDER BY day ASC
            """ % days)
            daily_trend = [{"day": str(r['day']), "count": r['count']} for r in cur.fetchall()]

            # Severity breakdown by type
            cur.execute("""
                SELECT disruption_type,
                       COUNT(*) FILTER (WHERE severity='HIGH') as high,
                       COUNT(*) FILTER (WHERE severity='MEDIUM') as medium
                FROM risk_alerts
                WHERE alert_timestamp >= NOW() - INTERVAL '%s days'
                GROUP BY disruption_type
                ORDER BY (high + medium) DESC
            """ % days)
            breakdown = [
                {
                    "type": r['disruption_type'].capitalize(),
                    "HIGH": r['high'],
                    "MEDIUM": r['medium']
                }
                for r in cur.fetchall()
                if (r['high'] or 0) + (r['medium'] or 0) > 0
            ]

            # Zone rankings by alert count
            cur.execute("""
                SELECT ra.zone_id, z.name,
                       COUNT(*) as total_alerts,
                       COUNT(*) FILTER (WHERE ra.status='OPEN') as open_alerts,
                       COUNT(*) FILTER (WHERE ra.severity='HIGH') as high_alerts,
                       MAX(zs.overall_risk_score) as risk_score
                FROM risk_alerts ra
                LEFT JOIN zones z ON ra.zone_id = z.zone_id
                LEFT JOIN zone_status zs ON ra.zone_id = zs.zone_id
                WHERE ra.alert_timestamp >= NOW() - INTERVAL '%s days'
                GROUP BY ra.zone_id, z.name
                ORDER BY total_alerts DESC
                LIMIT 20
            """ % days)
            zone_rankings = [
                {
                    "zone_id": r['zone_id'],
                    "name": r['name'] or f"Zone {r['zone_id']}",
                    "total_alerts": r['total_alerts'],
                    "open_alerts": r['open_alerts'] or 0,
                    "high_alerts": r['high_alerts'] or 0,
                    "risk_score": float(r['risk_score'] or 0),
                }
                for r in cur.fetchall()
            ]

            # Hotspot zone
            hotspot = zone_rankings[0] if zone_rankings else None

            cur.close()
            conn.close()

            send_json(self, {
                "days": days,
                "totals": {
                    "total": totals['total'],
                    "open": totals['open_count'],
                    "closed": totals['closed_count'],
                    "high": totals['high_count'],
                    "medium": totals['medium_count'],
                },
                "dominant_type": dominant_type,
                "hotspot": hotspot,
                "daily_trend": daily_trend,
                "severity_breakdown": breakdown,
                "zone_rankings": zone_rankings,
            })
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[dashboard/summary] Error: {e}")
