"""
GET /api/rivers
Returns waterway/river data for the map overlay.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _db import get_db, cors_response, error_response
from sqlalchemy import text


async def handler(request):
    try:
        async with get_db() as db:
            res = await db.execute(text("""
                SELECT hyriv_id, main_riv, length_km, catch_skm, upland_skm,
                       dis_av_cms, current_discharge_cms, discharge_ratio,
                       alert_level, last_updated, coordinates_json
                FROM jabodetabek_waterways
            """))
            waterways = res.fetchall()

        data = []
        for w in waterways:
            dis_av = float(w.dis_av_cms or 1)
            current = float(w.current_discharge_cms) if w.current_discharge_cms is not None else dis_av
            capacity_pct = round((current / (dis_av * 2)) * 100, 1) if dis_av > 0 else 0

            coords = []
            if w.coordinates_json:
                try:
                    coords = json.loads(w.coordinates_json)
                except Exception:
                    coords = []

            data.append({
                "hyriv_id": w.hyriv_id,
                "main_riv": w.main_riv,
                "length_km": float(w.length_km or 0),
                "average_discharge_cms": dis_av,
                "current_discharge_cms": current,
                "discharge_ratio": float(w.discharge_ratio or 1),
                "alert_level": w.alert_level or "Normal",
                "last_updated": w.last_updated.isoformat() if w.last_updated else None,
                "name": f"Waterway {w.hyriv_id}",
                "category": "river",
                "current_level": current,
                "max_capacity": round(dis_av * 2, 2),
                "capacity_percentage": capacity_pct,
                "coordinates": coords,
            })

        return cors_response(data)
    except Exception as e:
        print(f"[rivers] Error: {e}")
        return error_response()
