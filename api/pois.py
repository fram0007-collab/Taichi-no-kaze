"""
GET /api/pois
Returns POI markers for the map.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _db import get_db, cors_response, error_response
from sqlalchemy import text


async def handler(request):
    try:
        async with get_db() as db:
            # Join pois with crowd status
            res = await db.execute(text("""
                SELECT p.poi_id, p.name, p.category, p.latitude, p.longitude,
                       p.is_safe_zone, p.is_suppressed,
                       pcs.crowd_score
                FROM poi_master p
                LEFT JOIN poi_crowd_status pcs ON p.poi_id = pcs.poi_id
                WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
                ORDER BY p.category, p.name
            """))
            pois = res.fetchall()

        return cors_response([
            {
                "poi_id": p.poi_id,
                "name": p.name,
                "category": p.category,
                "lat": float(p.latitude),
                "lon": float(p.longitude),
                "is_safe_zone": p.is_safe_zone,
                "is_suppressed": bool(p.is_suppressed),
                "crowd_score": float(p.crowd_score) if p.crowd_score else None,
            }
            for p in pois
        ])
    except Exception as e:
        print(f"[pois] Error: {e}")
        return error_response()
