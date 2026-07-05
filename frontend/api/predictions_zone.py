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
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)
            hours = int(qs.get('hours', ['12'])[0])
            hours = max(1, min(hours, 168))

            # Extract zone_id from path: /api/predictions_zone?...
            # Vercel passes original path via x-matched-path or we get it from
            # the rewrite — zone_id comes via query param set by vercel rewrite
            zone_id = qs.get('zoneId', qs.get('zone_id', [None]))[0]
            if not zone_id:
                # Try extracting from path /api/predictions/zone/14
                parts = parsed.path.rstrip('/').split('/')
                zone_id = parts[-1] if parts[-1].isdigit() else None

            if not zone_id:
                send_json(self, {"error": "zone_id required"}, 400)
                return

            zone_id = int(zone_id)

            conn = get_conn()
            cur = conn.cursor()

            cur.execute("""
                SELECT zone_id, name, latitude, longitude, radius_m,
                       historical_flood_vulnerability, traffic_speed_baseline
                FROM zones WHERE zone_id = %s
            """, (zone_id,))
            zone = cur.fetchone()
            if not zone:
                send_json(self, {"error": "Zone not found"}, 404)
                cur.close(); conn.close()
                return

            cur.execute("""
                SELECT timestamp, speed, congestion
                FROM traffic_snapshots
                WHERE zone_id = %s AND timestamp >= NOW() - INTERVAL '%s hours'
                ORDER BY timestamp ASC
            """ % (zone_id, hours))
            traffic = {r['timestamp']: r for r in cur.fetchall()}

            cur.execute("""
                SELECT timestamp, rainfall, humidity, wind_speed
                FROM weather_snapshots
                WHERE zone_id = %s AND timestamp >= NOW() - INTERVAL '%s hours'
                ORDER BY timestamp ASC
            """ % (zone_id, hours))
            weather = {r['timestamp']: r for r in cur.fetchall()}

            cur.execute("""
                SELECT timestamp, crowd_score
                FROM crowd_snapshots
                WHERE zone_id = %s AND timestamp >= NOW() - INTERVAL '%s hours'
                ORDER BY timestamp ASC
            """ % (zone_id, hours))
            crowd = {r['timestamp']: r for r in cur.fetchall()}

            cur.close(); conn.close()

            all_ts = sorted(set(list(traffic.keys()) + list(weather.keys()) + list(crowd.keys())))
            timeline = []
            for ts in all_ts:
                t = traffic.get(ts)
                w = weather.get(ts)
                c = crowd.get(ts)
                timeline.append({
                    "timestamp": ts.isoformat(),
                    "speed": float(t['speed']) if t and t['speed'] else None,
                    "congestion": float(t['congestion']) if t and t['congestion'] else None,
                    "rainfall": float(w['rainfall']) if w and w['rainfall'] else None,
                    "humidity": float(w['humidity']) if w and w['humidity'] else None,
                    "weather_score": float(w['wind_speed']) if w and w['wind_speed'] else None,
                    "crowd_score": float(c['crowd_score']) if c and c['crowd_score'] else None,
                })

            send_json(self, {
                "zone_id": zone_id,
                "zone_name": zone['name'],
                "hours_range": hours,
                "timeline": timeline,
            })

        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[predictions/zone] Error: {e}")
