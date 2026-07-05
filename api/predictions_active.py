"""
GET /api/predictions/active
Returns all OPEN risk alerts with zone data — powers the Warning Feed.
"""
import json
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from _db import get_db, cors_response, error_response
from sqlalchemy import select, text


async def handler(request):
    try:
        async with get_db() as db:
            # Fetch all zones for enriching alerts
            zones_res = await db.execute(text("""
                SELECT z.zone_id, z.name, z.latitude, z.longitude,
                       z.radius_m, z.historical_flood_vulnerability,
                       z.traffic_speed_baseline, z.geometry
                FROM zones z
            """))
            zone_map = {r.zone_id: dict(r._mapping) for r in zones_res}

            # Fetch OPEN alerts
            alerts_res = await db.execute(text("""
                SELECT alert_id, zone_id, disruption_type, severity,
                       alert_timestamp, message, status,
                       probability_percentage, estimated_time_to_peak,
                       estimated_resolution_at, resolution_confidence
                FROM risk_alerts
                WHERE status = 'OPEN'
                  AND probability_percentage >= 20
                ORDER BY estimated_time_to_peak ASC
            """))
            alerts = alerts_res.fetchall()

            response = []
            for a in alerts:
                zone_data = zone_map.get(a.zone_id)
                if not zone_data:
                    continue

                # Parse geometry if stored as string
                geometry = zone_data.get("geometry")
                if isinstance(geometry, str):
                    try:
                        geometry = json.loads(geometry)
                    except Exception:
                        geometry = None

                severity = (a.severity or "MEDIUM").strip()
                risk_level = severity.capitalize()

                response.append({
                    "alert_id": a.alert_id,
                    "disruption_type": a.disruption_type,
                    "severity": severity,
                    "probability_percentage": float(a.probability_percentage or 0),
                    "estimated_time_to_peak": a.estimated_time_to_peak.isoformat() if a.estimated_time_to_peak else None,
                    "estimated_resolution_at": a.estimated_resolution_at.isoformat() if a.estimated_resolution_at else None,
                    "resolution_confidence": float(a.resolution_confidence or 0),
                    "message": a.message,
                    "status": a.status,
                    "alert_timestamp": a.alert_timestamp.isoformat() if a.alert_timestamp else None,
                    "risk_level": risk_level,
                    "zone": {
                        "zone_id": zone_data["zone_id"],
                        "id": zone_data["zone_id"],
                        "name": zone_data["name"],
                        "latitude": float(zone_data["latitude"] or 0),
                        "longitude": float(zone_data["longitude"] or 0),
                        "radius_m": float(zone_data["radius_m"] or 1000),
                        "historical_flood_vulnerability": float(zone_data["historical_flood_vulnerability"] or 0),
                        "traffic_speed_baseline": float(zone_data["traffic_speed_baseline"] or 40),
                        "geometry": geometry,
                    },
                })

        return cors_response(response)
    except Exception as e:
        print(f"[predictions/active] Error: {e}")
        return error_response()
