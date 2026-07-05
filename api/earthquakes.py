"""
GET /api/earthquakes
Returns recent earthquake events from BMKG data.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _db import get_db, cors_response, error_response
from sqlalchemy import text


async def handler(request):
    try:
        display_all = os.environ.get("DISPLAY_ALL_EARTHQUAKES", "false").lower() == "true"
        limit = "" if display_all else "LIMIT 5"

        async with get_db() as db:
            res = await db.execute(text(f"""
                SELECT event_id, magnitude, depth_km, latitude, longitude,
                       event_timestamp, location, impact_radius_km,
                       wilayah, potensi, depth, datetime
                FROM earthquake_events
                ORDER BY event_timestamp DESC
                {limit}
            """))
            quakes = res.fetchall()

        return cors_response([
            {
                "event_id": q.event_id,
                "magnitude": float(q.magnitude) if q.magnitude else None,
                "depth_km": float(q.depth_km) if q.depth_km else None,
                "latitude": float(q.latitude) if q.latitude else None,
                "longitude": float(q.longitude) if q.longitude else None,
                "event_timestamp": q.event_timestamp.isoformat() if q.event_timestamp else None,
                "location": q.location,
                "impact_radius_km": float(q.impact_radius_km) if q.impact_radius_km else None,
                "wilayah": q.wilayah,
                "potensi": q.potensi,
                "depth": q.depth,
                "datetime": q.datetime.isoformat() if q.datetime else None,
            }
            for q in quakes
        ])
    except Exception as e:
        print(f"[earthquakes] Error: {e}")
        return error_response()
