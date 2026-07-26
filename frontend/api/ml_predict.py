"""
Combines the two ML prediction endpoints into one Vercel Function to stay
within the Hobby plan's 12-function limit. Each of predict_zone_risk.py and
predict_resolution.py used to be its own file (its own function, its own
slot); this merges them behind one handler, routed by a `type` query param
set in vercel.json's rewrite rules (see below).

  GET /api/predict/zone/:zoneId       -> rewrites to ?type=zone&zoneId=...
  GET /api/predict/resolution/:alertId -> rewrites to ?type=resolution&alertId=...

Net cost: +1 function slot instead of +2.

Also supports a BATCH mode (?type=batch&zoneIds=1,2,3&alertIds=10,11) that
predicts for many zones/alerts in one invocation — one model load, one DB
connection, reused across every item — instead of the frontend firing one
request per badge. Introduced because per-badge fetching was consuming a
disproportionate share of Vercel's Fluid Active CPU budget: each individual
request was separately paying the cost of unpickling the scikit-learn models
(200-450 trees combined) and opening a fresh DB connection, even though that
cost is identical regardless of which zone/alert is being predicted.
"""
from http.server import BaseHTTPRequestHandler
import sys, os
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight
from _ml_helpers import build_live_features as build_zone_features, predict as predict_zone
from _resolution_helpers import build_live_features_for_alert, predict as predict_resolution

MAX_BATCH_SIZE = 50  # guardrail — a pathological request shouldn't tie up one invocation indefinitely


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
        elif prediction_type == 'batch':
            self._handle_batch(qs)
        else:
            send_json(self, {"error": "Unknown or missing prediction type. Expected ?type=zone, ?type=resolution, or ?type=batch."}, 400)

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

    def _handle_batch(self, qs):
        zone_ids_raw = qs.get('zoneIds', [''])[0]
        alert_ids_raw = qs.get('alertIds', [''])[0]
        zone_ids = [int(z) for z in zone_ids_raw.split(',') if z.strip().isdigit()][:MAX_BATCH_SIZE]
        alert_ids = [int(a) for a in alert_ids_raw.split(',') if a.strip().isdigit()][:MAX_BATCH_SIZE]

        if not zone_ids and not alert_ids:
            send_json(self, {"error": "Provide at least one of zoneIds or alertIds (comma-separated)"}, 400)
            return

        zones_result = {}
        resolutions_result = {}

        # One connection for the whole batch — this is the actual saving vs.
        # N separate invocations, each of which otherwise pays its own
        # connection-open cost regardless of how cheap the query itself is.
        conn = get_conn()
        cur = conn.cursor()
        try:
            for zone_id in zone_ids:
                try:
                    features = build_zone_features(cur, zone_id)
                    result = predict_zone(features)
                    result["zone_id"] = zone_id
                    zones_result[str(zone_id)] = result
                except Exception as e:
                    # One zone's failure (e.g. not found) shouldn't sink the
                    # rest of the batch — record it and move on.
                    zones_result[str(zone_id)] = {"error": str(e)}

            for alert_id in alert_ids:
                try:
                    features = build_live_features_for_alert(cur, alert_id)
                    result = predict_resolution(features)
                    result["alert_id"] = alert_id
                    now = datetime.now(timezone.utc)
                    result["estimated_resolution_at"] = (
                        now + timedelta(hours=result["hours_remaining_median"])
                    ).isoformat()
                    resolutions_result[str(alert_id)] = result
                except Exception as e:
                    resolutions_result[str(alert_id)] = {"error": str(e)}
        finally:
            cur.close(); conn.close()

        send_json(self, {"zones": zones_result, "resolutions": resolutions_result})
