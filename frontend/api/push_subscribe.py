"""
POST /api/push/subscribe
Saves a browser push subscription to Supabase.
Accepts both formats:
  { endpoint, keys: { p256dh, auth }, preferences? }   ← flat
  { subscription: { endpoint, keys }, preferences? }   ← nested (browser format)
"""
from http.server import BaseHTTPRequestHandler
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            preferences = body.get('preferences') or {}

            # Support both flat and nested subscription formats
            sub = body.get('subscription') or body
            if isinstance(sub, dict) and 'endpoint' in sub:
                endpoint = sub.get('endpoint')
                keys = sub.get('keys') or {}
            else:
                endpoint = body.get('endpoint')
                keys = body.get('keys') or {}

            if not endpoint:
                send_json(self, {'error': 'endpoint required'}, 400)
                return

            conn = get_conn()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO push_subscriptions (endpoint, p256dh, auth, preferences, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (endpoint) DO UPDATE
                SET p256dh = EXCLUDED.p256dh,
                    auth = EXCLUDED.auth,
                    preferences = EXCLUDED.preferences,
                    updated_at = NOW()
                RETURNING id
            """, (
                endpoint,
                keys.get('p256dh'),
                keys.get('auth'),
                json.dumps(preferences),
            ))
            row = cur.fetchone()
            conn.commit()
            cur.close()
            conn.close()

            send_json(self, {'ok': True, 'id': row['id'] if row else None,
                             'subscription': {'endpoint': endpoint}})
        except Exception as e:
            send_json(self, {'error': 'Internal server error'}, 500)
            print(f'[push/subscribe] Error: {e}')
