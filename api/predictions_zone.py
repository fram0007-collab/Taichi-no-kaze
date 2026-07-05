"""
GET /api/predictions/zone/[id]?hours=12
Returns timeline data for a specific zone — powers the Sidebar chart.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _db import get_db, cors_response, error_response
from sqlalchemy import text


async def handler(request):
    try:
        # Extract zone_id from path and hours from query
        path = request.get("path", "") if isinstance(request, dict) else ""
        # Path is /api/predictions/zone/5 → extract last segment
        zone_id = int(path.rstrip("/").split("/")[-1])

        qs = request.get("query", {}) if isinstance(request, dict) else {}
        hours = int(qs.get("hours", 12))
        hours = max(1, min(hours, 168))  # cap 1h to 7 days

        async with get_db() as db:
            # Zone info
            zone_res = await db.execute(text("""
                SELECT zone_id, name, latitude, longitude, radius_m,
                       historical_flood_vulnerability, traffic_speed_baseline
                FROM zones WHERE zone_id = :zid
            """), {"zid": zone_id})
            zone = zone_res.fetchone()
            if not zone:
                return error_response("Zone not found", 404)

            # Traffic snapshots
            traffic_res = await db.execute(text("""
                SELECT timestamp, speed, congestion
                FROM traffic_snapshots
                WHERE zone_id = :zid
                  AND timestamp >= NOW() - INTERVAL ':h hours'
                ORDER BY timestamp ASC
            """.replace(":h", str(hours))), {"zid": zone_id})
            traffic_rows = {r.timestamp: r for r in traffic_res}

            # Weather snapshots
            weather_res = await db.execute(text("""
                SELECT timestamp, temperature, humidity, rainfall, weather_score
                FROM weather_snapshots
                WHERE zone_id = :zid
                  AND timestamp >= NOW() - INTERVAL ':h hours'
                ORDER BY timestamp ASC
            """.replace(":h", str(hours))), {"zid": zone_id})
            weather_rows = {r.timestamp: r for r in weather_res}

            # Crowd snapshots
            crowd_res = await db.execute(text("""
                SELECT timestamp, crowd_score
                FROM crowd_snapshots
                WHERE zone_id = :zid
                  AND timestamp >= NOW() - INTERVAL ':h hours'
                ORDER BY timestamp ASC
            """.replace(":h", str(hours))), {"zid": zone_id})
            crowd_rows = {r.timestamp: r for r in crowd_res}

        # Merge all timestamps
        all_timestamps = sorted(set(list(traffic_rows.keys()) +
                                    list(weather_rows.keys()) +
                                    list(crowd_rows.keys())))

        timeline = []
        for ts in all_timestamps:
            t = traffic_rows.get(ts)
            w = weather_rows.get(ts)
            c = crowd_rows.get(ts)
            entry = {
                "timestamp": ts.isoformat(),
                "speed": float(t.speed) if t and t.speed else None,
                "congestion": float(t.congestion) if t and t.congestion else None,
                "temperature": float(w.temperature) if w and w.temperature else None,
                "humidity": float(w.humidity) if w and w.humidity else None,
                "rainfall": float(w.rainfall) if w and w.rainfall else None,
                "weather_score": float(w.weather_score) if w and w.weather_score else None,
                "crowd_score": float(c.crowd_score) if c and c.crowd_score else None,
            }
            timeline.append(entry)

        return cors_response({
            "zone_id": zone_id,
            "zone_name": zone.name,
            "hours_range": hours,
            "timeline": timeline,
        })

    except ValueError:
        return error_response("Invalid zone ID", 400)
    except Exception as e:
        print(f"[predictions/zone] Error: {e}")
        return error_response()
