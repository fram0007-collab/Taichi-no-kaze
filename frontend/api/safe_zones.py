from http.server import BaseHTTPRequestHandler
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from _helpers import get_conn, send_json, send_cors_preflight

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args): pass  # suppress default logging

    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_GET(self):
        try:
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            dtype_param = qs.get("disruption_types", ["traffic"])[0]
            primary = dtype_param.split(",")[0].strip().lower()
            cats = ["hospital","police","university","mall","market","station"]
            cats_sql = ",".join(f"\'{c}\'" for c in cats)

            conn = get_conn()
            cur = conn.cursor()
            cur.execute(f"""
                SELECT p.poi_id, p.name, p.category, p.latitude, p.longitude,
                       p.is_safe_zone, pcs.crowd_score
                FROM poi_master p
                LEFT JOIN poi_crowd_status pcs ON p.poi_id = pcs.poi_id
                WHERE p.category IN ({cats_sql})
                  AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
            """)
            all_pois = cur.fetchall()
            cur.close(); conn.close()

            THRESHOLD = 82.0
            tiers = [["hospital","police"],["university"],["mall","market","station"]]
            TYPE_INFO = {
                "hospital":{"type":"Hospital / Clinic","details":"Emergency medical services 24/7."},
                "police":{"type":"Police Station","details":"Law enforcement and emergency coordination."},
                "university":{"type":"University Campus","details":"Large indoor space with medical facilities."},
                "mall":{"type":"Shopping Centre","details":"Large covered space with emergency facilities."},
                "market":{"type":"Public Market","details":"Open gathering space for emergency assembly."},
                "station":{"type":"Transit Station","details":"Evacuation transport hub."},
            }
            selected = []
            for tier_cats in tiers:
                cands = [p for p in all_pois
                         if p["category"] in tier_cats
                         and float(p["crowd_score"] or 0) < THRESHOLD]
                if cands:
                    selected = cands
                    break
            if not selected:
                selected = sorted(all_pois, key=lambda p: float(p["crowd_score"] or 0))

            result = []
            for p in selected:
                cat = p["category"]
                cs = float(p["crowd_score"] or 0)
                info = TYPE_INFO.get(cat, {})
                result.append({
                    "poi_id":p["poi_id"],"name":p["name"],"category":cat,
                    "latitude":float(p["latitude"]),"longitude":float(p["longitude"]),
                    "crowd_score":cs,"is_crowded":cs>=THRESHOLD,
                    "type":info.get("type",cat),"details":info.get("details",""),
                    "disruption_relevance":primary,"inside_threat_zone":False,
                    "shelter_tier":"Primary" if cat in ["hospital","police"] else "Secondary" if cat=="university" else "Fallback",
                })
            send_json(self, result)
        except Exception as e:
            send_json(self, {"error": "Internal server error"}, 500)
            print(f"[safe-zones] Error: {e}")
