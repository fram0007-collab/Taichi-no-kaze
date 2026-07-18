"""
Combines the two ML prediction endpoints into one Vercel Function to stay
within the Hobby plan's 12-function limit. Each of predict_zone_risk.py and
predict_resolution.py used to be its own file (its own function, its own
slot); this merges them behind one handler, routed by a `type` query param
set in vercel.json's rewrite rules (see below).

  GET /api/predict/zone/:zoneId       -> rewrites to ?type=zone&zoneId=...
  GET /api/predict/resolution/:alertId -> rewrites to ?type=resolution&alertId=...

Net cost: +1 function slot instead of +2.
"""
from http.server import BaseHTTPRequestHandler
import sys, os
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight
from _ml_helpers import build_live_features as build_zone_features, predict as predict_zone
from _resolution_helpers import build_live_features_for_alert, predict as predict_resolution


class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        prediction_type = (qs.get('type', [None])[0] or '').lower()

        # Fallback path-based detection, in case this is hit directly
        # without going through the vercel.json rewrite (e.g. local dev).
        if not prediction_type:
            if '/resolution/' in parsed.path:
                prediction_type = 'resolution'
            elif '/zone/' in parsed.path:
                prediction_type = 'zone'

        if prediction_type == 'zone':
            self._handle_zone(qs, parsed)
        elif prediction_type == 'resolution':
            self._handle_resolution(qs, parsed)
        else:
            send_json(self, {"error": "Unknown or missing prediction type. Expected ?type=zone or ?type=resolution."}, 400)

    def _handle_zone(self, qs, parsed):
        try:
            zone_id = qs.get('zoneId', qs.get('zone_id', [None]))[0]
            if not zone_id:
                parts = parsed.path.rstrip('/').split('/')
                zone_id = parts[-1] if parts[-1].isdigit() else None
            if not zone_id:
                send_json(self, {"error": "zone_id required"}, 400)
                return
            zone_id = int(zone_id)

            conn = get_conn()
            cur = conn.cursor()
            try:
                features = build_zone_features(cur, zone_id)
            finally:
                cur.close(); conn.close()

            result = predict_zone(features)
            result["zone_id"] = zone_id
            send_json(self, result)

        except ValueError as e:
            send_json(self, {"error": str(e)}, 404)
        except FileNotFoundError as e:
            send_json(self, {"error": str(e)}, 503)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[ml_predict/zone] Error: {e}")

    def _handle_resolution(self, qs, parsed):
        try:
            alert_id = qs.get('alertId', qs.get('alert_id', [None]))[0]
            if not alert_id:
                parts = parsed.path.rstrip('/').split('/')
                alert_id = parts[-1] if parts[-1].isdigit() else None
            if not alert_id:
                send_json(self, {"error": "alert_id required"}, 400)
                return
            alert_id = int(alert_id)

            conn = get_conn()
            cur = conn.cursor()
            try:
                features = build_live_features_for_alert(cur, alert_id)
            finally:
                cur.close(); conn.close()

            result = predict_resolution(features)
            result["alert_id"] = alert_id
            now = datetime.now(timezone.utc)
            result["estimated_resolution_at"] = (
                now + timedelta(hours=result["hours_remaining_median"])
            ).isoformat()
            send_json(self, result)

        except ValueError as e:
            send_json(self, {"error": str(e)}, 404)
        except FileNotFoundError as e:
            send_json(self, {"error": str(e)}, 503)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[ml_predict/resolution] Error: {e}")
