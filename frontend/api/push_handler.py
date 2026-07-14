"""
POST /api/push/subscribe   → saves subscription to Supabase
POST /api/push/unsubscribe → removes subscription from Supabase

Both routes point to this single file via vercel.json rewrites.
The path is checked to determine which action to perform.
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

            # Determine action from path
            path = self.path.split('?')[0].rstrip('/')
            action = 'subscribe' if path.endswith('subscribe') else 'unsubscribe'

            if action == 'subscribe':
                self._handle_subscribe(body)
            else:
                self._handle_unsubscribe(body)

        except Exception as e:
            send_json(self, {'error': 'Internal server error'}, 500)
            print(f'[push_handler] Error: {e}')

    def _handle_subscribe(self, body):
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
        """, (endpoint, keys.get('p256dh'), keys.get('auth'), json.dumps(preferences)))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()

        send_json(self, {'ok': True, 'id': row['id'] if row else None,
                         'subscription': {'endpoint': endpoint}})

    def _handle_unsubscribe(self, body):
        sub = body.get('subscription') or body
        endpoint = (sub.get('endpoint') if isinstance(sub, dict) else None) or body.get('endpoint')

        if not endpoint:
            send_json(self, {'error': 'endpoint required'}, 400)
            return

        conn = get_conn()
        cur = conn.cursor()
        cur.execute('DELETE FROM push_subscriptions WHERE endpoint = %s', (endpoint,))
        deleted = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()

        send_json(self, {'ok': True, 'removed': deleted})
