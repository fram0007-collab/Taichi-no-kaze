import requests
import logging
import random
import urllib3
from datetime import datetime
from worker.config import GOOGLE_MAPS_API_KEY, MOCK_SERVER_URL
from worker.clients.base import TrafficClient

if MOCK_SERVER_URL:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

class GoogleTrafficClient(TrafficClient):
    """
    Google Maps Routes API client implementing switchable traffic telemetry.
    Queries the v1/computeRoutes endpoint for a local segment to derive speed drops,
    with a rich simulated fallback stub if no API key is active.
    """
    def __init__(self, api_key: str = None):
        self.api_key = api_key or GOOGLE_MAPS_API_KEY
        self.base_url = f"{MOCK_SERVER_URL}/directions/v2:computeRoutes" if MOCK_SERVER_URL else "https://routes.googleapis.com/directions/v2:computeRoutes"
        self._historical_cache = {}

    def get_flow_data(self, zone_name: str, baseline_speed: float, latitude: float, longitude: float, db=None) -> dict:
        """
        Calculates traffic flow by comparing standard route duration against real-time 
        traffic-aware duration along a virtual 500-meter corridor through the zone's center.
        """
        if not self.api_key and not MOCK_SERVER_URL:
            logger.debug(f"[Google API] No API Key provided for {zone_name}. Using historical database average or simulator.")
            return self._get_historical_or_simulated_flow(zone_name, baseline_speed, db)

        try:
            # Generate a 500m straight virtual segment through the zone centroid along the latitude axis
            # 1 degree of latitude ≈ 111,111 meters. 250m displacement ≈ 0.00225 degrees.
            lat_offset = 0.00225
            
            origin_lat = latitude - lat_offset
            origin_lon = longitude
            dest_lat = latitude + lat_offset
            dest_lon = longitude
 
            headers = {
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "routes.duration,routes.staticDuration"
            }
            if self.api_key:
                headers["X-Goog-Api-Key"] = self.api_key

            body = {
                "origin": {
                    "location": {
                        "latLng": {
                            "latitude": round(origin_lat, 6),
                            "longitude": round(origin_lon, 6)
                        }
                    }
                },
                "destination": {
                    "location": {
                        "latLng": {
                            "latitude": round(dest_lat, 6),
                            "longitude": round(dest_lon, 6)
                        }
                    }
                },
                "travelMode": "DRIVE",
                "routingPreference": "TRAFFIC_AWARE"
            }

            response = requests.post(self.base_url, json=body, headers=headers, timeout=10, verify=False if MOCK_SERVER_URL else True)
            if response.status_code == 200:
                data = response.json()
                routes = data.get("routes", [])
                if not routes:
                    logger.warning(f"[Google API] Empty routes list returned for {zone_name}. Using simulator fallback.")
                    return self._get_historical_or_simulated_flow(zone_name, baseline_speed, db)

                route = routes[0]
                
                # Google returns duration strings as seconds with 's' suffix, e.g. "120s"
                def parse_duration(duration_str) -> float:
                    if not duration_str:
                        return 0.0
                    return float(duration_str.rstrip('s'))

                duration_seconds = parse_duration(route.get("duration"))          # Time with traffic
                static_duration = parse_duration(route.get("staticDuration"))     # Base time without traffic

                if static_duration <= 0.0 or duration_seconds <= 0.0:
                    logger.warning(f"[Google API] Invalid durations returned for {zone_name}. Using fallback.")
                    return self._get_historical_or_simulated_flow(zone_name, baseline_speed, db)

                # Compute the speed ratio (duration / duration_with_traffic)
                speed_ratio = static_duration / duration_seconds
                speed_ratio = max(0.1, min(1.2, speed_ratio)) # Cap fluctuations

                current_speed = round(baseline_speed * speed_ratio, 2)
                travel_delay = max(0.0, float(duration_seconds - static_duration))
                congestion_index = round(max(0.0, min(10.0, (1.0 - speed_ratio) * 10.0)), 2)

                logger.info(f"[Google API] Fetched live flow for {zone_name}: {current_speed} km/h (Ratio: {speed_ratio:.2f})")
                return {
                    "current_speed": float(current_speed),
                    "travel_delay": float(travel_delay),
                    "congestion_index": float(congestion_index),
                    "provider": "google"
                }
            else:
                logger.warning(f"[Google API] Request failed with status {response.status_code}. Details: {response.text}. Using simulator.")
                return self._get_historical_or_simulated_flow(zone_name, baseline_speed, db)

        except Exception as e:
            logger.error(f"[Google API] Error fetching flow for {zone_name}: {str(e)}. Using simulator.")
            return self._get_historical_or_simulated_flow(zone_name, baseline_speed, db)

    def _simulate_google_flow(self, zone_name: str, baseline_speed: float) -> dict:
        """
        High-fidelity simulated Google Maps telemetry fallback.
        Generates realistic speed degradation matching standard Jakarta traffic curves.
        """
        now = datetime.now()
        hour = now.hour
        minute = now.minute
        time_fraction = hour + (minute / 60.0)

        is_peak = (7.0 <= time_fraction <= 9.5) or (16.5 <= time_fraction <= 19.5)
        noise = random.uniform(-0.04, 0.04)

        if is_peak:
            # Replicate heavy bumper-to-bumper Google traffic flow drops
            speed_drop = random.uniform(0.38, 0.58)
            current_speed = baseline_speed * (1.0 - speed_drop + noise)
            travel_delay = random.uniform(130.0, 260.0)
            congestion_index = random.uniform(7.0, 9.5)
        else:
            # Free flow or light standard city congestion
            speed_drop = random.uniform(-0.08, 0.12)
            current_speed = baseline_speed * (1.0 - speed_drop + noise)
            current_speed = min(current_speed, baseline_speed * 1.12)
            travel_delay = random.uniform(8.0, 35.0)
            congestion_index = max(0.0, (1.0 - (current_speed / baseline_speed)) * 10.0)
            congestion_index = min(4.5, congestion_index)

        # Micro adjustment per zone characteristics
        if "Sudirman" in zone_name:
            if is_peak:
                current_speed *= 0.85
                congestion_index = min(10.0, congestion_index * 1.15)
        elif "Kemang" in zone_name:
            current_speed *= 0.92
            congestion_index = min(10.0, congestion_index * 1.1)

        current_speed = max(4.0, round(current_speed, 2))
        travel_delay = max(0.0, round(travel_delay, 1))
        congestion_index = max(0.0, min(10.0, round(congestion_index, 2)))

        logger.debug(f"[Google Simulator] Simulated flow for {zone_name}: speed={current_speed} km/h, delay={travel_delay}s")
        return {
            "current_speed": current_speed,
            "travel_delay": travel_delay,
            "congestion_index": congestion_index,
            "provider": "simulated"
        }

    def _get_historical_or_simulated_flow(self, zone_name: str, baseline_speed: float, db=None) -> dict:
        now = datetime.now()
        hour = now.hour
        
        # Check if we have already queried the DB for this hour
        if db is not None:
            if hour not in self._historical_cache:
                logger.info(f"[Google Fallback] Cache miss for hour {hour}. Performing BULK database select for all zones...")
                try:
                    # To avoid circular imports, import models inside the method
                    from worker.models import JakartaZone, TrafficSnapshot
                    from sqlalchemy import func
                    
                    results = db.query(
                        JakartaZone.name,
                        func.avg(TrafficSnapshot.current_speed).label('avg_speed'),
                        func.avg(TrafficSnapshot.travel_delay).label('avg_delay'),
                        func.avg(TrafficSnapshot.congestion_index).label('avg_congestion'),
                        func.count(TrafficSnapshot.id).label('record_count')
                    ).join(
                        TrafficSnapshot, JakartaZone.id == TrafficSnapshot.zone_id
                    ).filter(
                        TrafficSnapshot.provider.in_(['google', 'tomtom']),
                        func.extract('hour', TrafficSnapshot.timestamp) == hour
                    ).group_by(
                        JakartaZone.name
                    ).all()
                    
                    # Initialize cache for this hour
                    hour_cache = {}
                    for row in results:
                        hour_cache[row.name] = {
                            "current_speed": round(float(row.avg_speed), 2),
                            "travel_delay": round(float(row.avg_delay), 1),
                            "congestion_index": round(float(row.avg_congestion), 2),
                            "provider": "google_historical",
                            "record_count": int(row.record_count)
                        }
                    
                    self._historical_cache[hour] = hour_cache
                    logger.info(f"[Google Fallback] Bulk DB select finished. Loaded historical averages for {len(hour_cache)} zones.")
                except Exception as db_err:
                    logger.error(f"[Google Fallback] Error running bulk database query: {str(db_err)}")
                    # Ensure we don't crash, we'll fall back to simulator
                    self._historical_cache[hour] = {}
            
            # Now try to get data from cache
            zone_data = self._historical_cache.get(hour, {}).get(zone_name)
            if zone_data:
                logger.info(
                    f"[Google Fallback] Using cached historical database average for {zone_name} at hour {hour}: "
                    f"speed = {zone_data['current_speed']} km/h, delay = {zone_data['travel_delay']}s "
                    f"(sourced from {zone_data['record_count']} records)"
                )
                return {
                    "current_speed": zone_data["current_speed"],
                    "travel_delay": zone_data["travel_delay"],
                    "congestion_index": zone_data["congestion_index"],
                    "provider": "google_historical"
                }
            else:
                logger.warning(f"[Google Fallback] No historical database data found for {zone_name} at hour {hour} in cache. Using simulator fallback.")
        else:
            logger.warning("[Google Fallback] No active database session provided for historical queries. Using simulator fallback.")

        # Fallback to high-fidelity simulator
        return self._simulate_google_flow(zone_name, baseline_speed)
