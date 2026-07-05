"""
GET /api/zone-status/all
Returns all 60 zones with current risk scores — powers the map circles.
"""
import json
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from api._db import get_db, cors_response, error_response
from sqlalchemy import text


async def handler(request):
    try:
        async with get_db() as db:
            # Fetch zones + zone_status in one JOIN
            res = await db.execute(text("""
                SELECT
                    z.zone_id, z.name, z.latitude, z.longitude,
                    z.radius_m, z.historical_flood_vulnerability,
                    z.traffic_speed_baseline, z.geometry,
                    zs.traffic_score, zs.weather_score, zs.crowd_score,
                    zs.earthquake_score, zs.waterway_score,
                    zs.overall_risk_score, zs.dominant_risk,
                    zs.recommended_action, zs.last_updated
                FROM zones z
                LEFT JOIN zone_status zs ON z.zone_id = zs.zone_id
            """))
            zones = res.fetchall()

            # Fetch open alerts grouped by zone
            open_res = await db.execute(text("""
                SELECT zone_id, disruption_type
                FROM risk_alerts
                WHERE status = 'OPEN'
            """))
            open_dims_by_zone = {}
            for row in open_res:
                zid = row.zone_id
                dt = (row.disruption_type or "").lower()
                open_dims_by_zone.setdefault(zid, set()).add(dt)

            response = []
            for z in zones:
                overall = float(z.overall_risk_score or 0)
                traffic = float(z.traffic_score or 0)
                weather = float(z.weather_score or 0)
                crowd = float(z.crowd_score or 0)
                earthquake = float(z.earthquake_score or 0)
                waterway = float(z.waterway_score or 0)
                dom = z.dominant_risk or "weather"
                dim_scores = {"traffic": traffic, "weather": weather, "crowd": crowd,
                              "earthquake": earthquake, "waterway": waterway}
                dominant_score = dim_scores.get(dom, overall)

                if dominant_score >= 65 or overall >= 65:
                    display_severity = "HIGH"
                elif dominant_score >= 25 or overall >= 25:
                    display_severity = "MEDIUM"
                else:
                    display_severity = "LOW"

                geometry = z.geometry
                if isinstance(geometry, str):
                    try:
                        geometry = json.loads(geometry)
                    except Exception:
                        geometry = None

                zone_data = {
                    "zone_id": z.zone_id,
                    "id": z.zone_id,
                    "name": z.name,
                    "latitude": float(z.latitude or 0),
                    "longitude": float(z.longitude or 0),
                    "radius_m": float(z.radius_m or 1000),
                    "historical_flood_vulnerability": float(z.historical_flood_vulnerability or 0),
                    "traffic_speed_baseline": float(z.traffic_speed_baseline or 40),
                    "geometry": geometry,
                }

                response.append({
                    "zone_id": z.zone_id,
                    "zone": zone_data,
                    "traffic_score": traffic,
                    "weather_score": weather,
                    "crowd_score": crowd,
                    "earthquake_score": earthquake,
                    "waterway_score": waterway,
                    "overall_risk_score": overall,
                    "display_severity": display_severity,
                    "dominant_risk": dom,
                    "recommended_action": z.recommended_action or "Monitor conditions.",
                    "last_updated": z.last_updated.isoformat() if z.last_updated else None,
                    "open_threat_dims": sorted(open_dims_by_zone.get(z.zone_id, set())),
                })

        return cors_response(response)
    except Exception as e:
        print(f"[zone-status/all] Error: {e}")
        return error_response()
