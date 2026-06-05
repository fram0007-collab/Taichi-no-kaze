"""
BMKG Earthquake Client — with USGS fallback
============================================
BMKG endpoint: https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json
USGS fallback: https://earthquake.usgs.gov/fdsnws/event/1/query (Indonesia bbox)

Key fix: URL is built inside get_recent_earthquakes() NOT at class level,
so MOCK_SERVER_URL is read after .env is loaded, not at import time.
"""

import logging
import requests
from datetime import datetime

logger = logging.getLogger("worker.bmkg")


class BMKGClient:
    """Fetches recent earthquake data from BMKG with automatic USGS fallback."""

    BMKG_URL = "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json"

    # USGS bounding box covering Indonesia + surrounding region
    USGS_URL = (
        "https://earthquake.usgs.gov/fdsnws/event/1/query"
        "?format=geojson"
        "&minmagnitude=3.0"
        "&minlatitude=-11&maxlatitude=6"
        "&minlongitude=95&maxlongitude=141"
        "&limit=20&orderby=time"
    )

    def get_recent_earthquakes(self) -> list:
        result = self._fetch_bmkg()
        if result:
            logger.info(f"[BMKG] Got {len(result)} earthquakes from BMKG.")
            return result

        logger.warning("[BMKG] No data from BMKG, trying USGS fallback...")
        result = self._fetch_usgs()
        if result:
            logger.info(f"[USGS] Got {len(result)} earthquakes from USGS.")
            return result

        logger.error("[Earthquake] Both BMKG and USGS returned no data.")
        return []

    def _fetch_bmkg(self) -> list:
        try:
            # Read config HERE (inside method) so .env is already loaded
            from worker.config import MOCK_SERVER_URL
            url = (
                f"{MOCK_SERVER_URL}/DataMKG/TEWS/gempaterkini.json"
                if MOCK_SERVER_URL
                else self.BMKG_URL
            )
            logger.info(f"[BMKG] Fetching from {url}")
            resp = requests.get(
                url, timeout=12,
                verify=not bool(MOCK_SERVER_URL),
                headers={"User-Agent": "DIS-RUPTURE/2.0 (Monash ITI5120)"},
            )
            if not resp.ok:
                logger.warning(f"[BMKG] HTTP {resp.status_code}")
                return []

            data = resp.json()
            gempa_list = data.get("Infogempa", {}).get("gempa", [])
            if not isinstance(gempa_list, list):
                gempa_list = [gempa_list]
            return self._parse_bmkg(gempa_list)

        except Exception as e:
            logger.warning(f"[BMKG] Failed: {type(e).__name__}: {e}")
            return []

    def _parse_bmkg(self, gempa_list: list) -> list:
        parsed = []
        for g in gempa_list:
            try:
                dt_str = g.get("DateTime", "")
                try:
                    dt = datetime.fromisoformat(dt_str) if dt_str else datetime.utcnow()
                except Exception:
                    try:
                        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
                    except Exception:
                        dt = datetime.utcnow()

                coords_str = g.get("Coordinates", "")
                if coords_str and "," in coords_str:
                    lat_str, lon_str = coords_str.split(",", 1)
                    lat = float(lat_str.strip())
                    lon = float(lon_str.strip())
                else:
                    lat_raw = str(g.get("Lintang", g.get("Latitude", "0")))
                    lon_raw = str(g.get("Bujur", g.get("Longitude", "0")))
                    is_south = "LS" in lat_raw
                    lat = float(lat_raw.replace("LS","").replace("LU","").strip() or "0")
                    if is_south:
                        lat = -abs(lat)
                    lon = float(lon_raw.replace("BT","").replace("BB","").strip() or "0")

                mag = float(str(g.get("Magnitude","0")).strip() or "0")
                depth_raw = str(g.get("Kedalaman","10")).lower().replace("km","").strip()
                try:
                    depth_km = float(depth_raw)
                except ValueError:
                    depth_km = 10.0

                event_id = f"BMKG-{dt.strftime('%Y%m%d%H%M')}-{lat:.3f}-{lon:.3f}"
                parsed.append({
                    "event_id": event_id,
                    "magnitude": mag,
                    "depth_km": depth_km,
                    "latitude": lat,
                    "longitude": lon,
                    "datetime": dt,
                    "wilayah": g.get("Wilayah", g.get("Area", "Unknown")),
                    "impact_radius_km": mag * 15,
                })
            except Exception as ex:
                logger.warning(f"[BMKG] Parse error on {g}: {ex}")
        return parsed

    def _fetch_usgs(self) -> list:
        try:
            logger.info("[USGS] Fetching Indonesia earthquakes from USGS FDSN...")
            resp = requests.get(self.USGS_URL, timeout=15)
            if not resp.ok:
                logger.warning(f"[USGS] HTTP {resp.status_code}")
                return []

            parsed = []
            for f in resp.json().get("features", []):
                try:
                    props = f.get("properties", {})
                    coords = f.get("geometry", {}).get("coordinates", [0, 0, 0])
                    lon, lat = float(coords[0]), float(coords[1])
                    depth_km = float(coords[2]) if len(coords) > 2 else 10.0
                    mag = float(props.get("mag") or 0.0)
                    time_ms = props.get("time", 0)
                    dt = datetime.utcfromtimestamp(time_ms / 1000) if time_ms else datetime.utcnow()
                    event_id = f"USGS-{dt.strftime('%Y%m%d%H%M')}-{lat:.3f}-{lon:.3f}"
                    parsed.append({
                        "event_id": event_id,
                        "magnitude": mag,
                        "depth_km": depth_km,
                        "latitude": lat,
                        "longitude": lon,
                        "datetime": dt,
                        "wilayah": props.get("place", "Indonesia region"),
                        "impact_radius_km": mag * 15,
                    })
                except Exception as ex:
                    logger.warning(f"[USGS] Parse error: {ex}")
            return parsed

        except Exception as e:
            logger.warning(f"[USGS] Failed: {type(e).__name__}: {e}")
            return []
