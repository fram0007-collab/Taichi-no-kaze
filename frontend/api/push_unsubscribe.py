"""
POST /api/push/unsubscribe
Removes a push subscription from Supabase.
Body: { endpoint }
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
            endpoint = body.get('endpoint')

            if not endpoint:
                send_json(self, {'error': 'endpoint required'}, 400)
                return

            conn = get_conn()
            cur = conn.cursor()
            cur.execute(
                'DELETE FROM push_subscriptions WHERE endpoint = %s',
                (endpoint,)
            )
            deleted = cur.rowcount
            conn.commit()
            cur.close()
            conn.close()

            send_json(self, {'status': 'removed', 'deleted': deleted})
        except Exception as e:
            send_json(self, {'error': 'Internal server error'}, 500)
            print(f'[push/unsubscribe] Error: {e}')
