"""
GET /api/safe-zones?disruption_types=traffic,crowd,...
Returns safe zone POIs filtered by disruption type and crowd score.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from _db import get_db, cors_response, error_response
from sqlalchemy import text
import math

CROWD_SAFE_THRESHOLD = 82.0

DISRUPTION_TIERS = {
    "flood":      [["hospital", "police"], ["university"], ["mall", "market", "station"]],
    "waterway":   [["hospital", "police"], ["university"], ["mall", "market", "station"]],
    "earthquake": [["hospital", "police"], ["university"], ["mall", "market", "station"]],
    "traffic":    [["hospital", "police"], ["university"], ["mall", "market", "station"]],
    "crowd":      [["hospital", "police"], ["university"], ["mall", "market", "station"]],
    "weather":    [["hospital", "police"], ["university"], ["mall", "market", "station"]],
}

POI_DETAILS = {
    "hospital":   {"type": "Hospital / Clinic",    "details": "Emergency medical services available 24/7."},
    "police":     {"type": "Police Station",        "details": "Law enforcement and emergency coordination."},
    "university": {"type": "University Campus",     "details": "Large indoor space, medical facilities on site."},
    "mall":       {"type": "Shopping Centre",       "details": "Large covered space with emergency facilities."},
    "market":     {"type": "Public Market",         "details": "Open gathering space for emergency assembly."},
    "station":    {"type": "Transit Station",       "details": "Evacuation transport hub with crowd management."},
}


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    p = math.pi / 180
    dlat = (lat2 - lat1) * p
    dlon = (lon2 - lon1) * p
    a = math.sin(dlat/2)**2 + math.cos(lat1*p)*math.cos(lat2*p)*math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


async def handler(request):
    try:
        # Parse disruption_types from query string
        qs = request.get("query", {}) if isinstance(request, dict) else {}
        dtype_param = qs.get("disruption_types", "")
        dtypes = [d.strip().lower() for d in dtype_param.split(",") if d.strip()] if dtype_param else ["traffic"]
        primary_type = dtypes[0] if dtypes else "traffic"
        tier_list = DISRUPTION_TIERS.get(primary_type, DISRUPTION_TIERS["traffic"])
        all_cats = list({cat for tier in tier_list for cat in tier})

        async with get_db() as db:
            # Fetch candidate POIs with crowd scores
            placeholders = ", ".join(f"'{c}'" for c in all_cats)
            pois_res = await db.execute(text(f"""
                SELECT p.poi_id, p.name, p.category, p.latitude, p.longitude,
                       p.is_safe_zone, pcs.crowd_score
                FROM poi_master p
                LEFT JOIN poi_crowd_status pcs ON p.poi_id = pcs.poi_id
                WHERE p.category IN ({placeholders})
                  AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
            """))
            all_pois = pois_res.fetchall()

        # Split outside/inside threat zones (no threat zones in serverless — return all)
        def not_crowded(p):
            score = float(p.crowd_score or 0)
            return score < CROWD_SAFE_THRESHOLD

        # Tiered selection
        selected = []
        for tier_cats in tier_list:
            candidates = [p for p in all_pois if p.category in tier_cats and not_crowded(p)]
            if candidates:
                selected = candidates
                break

        if not selected and all_pois:
            selected = sorted(all_pois, key=lambda p: float(p.crowd_score or 0))

        info = POI_DETAILS
        result = []
        for p in selected:
            cat = p.category
            crowd = float(p.crowd_score or 0)
            result.append({
                "poi_id": p.poi_id,
                "name": p.name,
                "category": cat,
                "latitude": float(p.latitude),
                "longitude": float(p.longitude),
                "is_crowded": crowd >= CROWD_SAFE_THRESHOLD,
                "crowd_score": crowd,
                "type": info.get(cat, {}).get("type", cat),
                "details": info.get(cat, {}).get("details", ""),
                "disruption_relevance": primary_type,
                "shelter_tier": "Primary" if cat in ["hospital", "police"] else
                                "Secondary" if cat == "university" else "Fallback",
                "inside_threat_zone": False,
            })

        return cors_response(result)
    except Exception as e:
        print(f"[safe-zones] Error: {e}")
        return error_response()
