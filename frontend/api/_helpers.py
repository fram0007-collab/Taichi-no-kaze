import math
"""Shared helpers for Vercel Python serverless functions."""
import os, json
import psycopg2
import psycopg2.extras

CORS_ORIGIN = os.environ.get("FRONTEND_URL", "*")

def get_conn():
    url = os.environ.get("DATABASE_URL", "")
    # Strip asyncpg prefix if present
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url, sslmode="require", cursor_factory=psycopg2.extras.RealDictCursor)

def send_json(handler_instance, data, status=200):
    body = json.dumps(data, default=str).encode()
    handler_instance.send_response(status)
    handler_instance.send_header("Content-Type", "application/json")
    handler_instance.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
    handler_instance.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler_instance.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler_instance.end_headers()
    handler_instance.wfile.write(body)

def send_cors_preflight(handler_instance):
    handler_instance.send_response(200)
    handler_instance.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
    handler_instance.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler_instance.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler_instance.end_headers()

import math

def zone_to_geojson_polygon(lat, lon, radius_m):
    """Approximates a zone circle as a 36-point GeoJSON Polygon."""
    points = []
    steps = 36
    for i in range(steps + 1):
        angle = math.radians(360.0 * i / steps)
        delta_lat = (radius_m / 111_000) * math.cos(angle)
        delta_lon = (radius_m / (111_000 * math.cos(math.radians(lat)))) * math.sin(angle)
        points.append([round(lon + delta_lon, 6), round(lat + delta_lat, 6)])
    return {"type": "Polygon", "coordinates": [points]}
