from http.server import BaseHTTPRequestHandler
import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        start = time.time()
        try:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as cnt FROM zones")
            zone_count = cur.fetchone()["cnt"]
            cur.close(); conn.close()
            latency = round((time.time() - start) * 1000, 2)
            send_json(self, {
                "status": "healthy",
                "database": {"status": "healthy", "latency_ms": latency, "provider": "supabase"},
                "cache": {"zones_loaded": zone_count},
                "deployment": "vercel-serverless",
            })
        except Exception as e:
            send_json(self, {"status": "degraded", "error": "DB connection failed"}, 503)
            print(f"[admin/status] Error: {e}")
