import requests
import logging
import random
import urllib3
from datetime import datetime, timedelta

from worker.config import MOCK_SERVER_URL

if MOCK_SERVER_URL:
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

class OpenMeteoClient:
    """
    Open-Meteo Public API Client. Retrieves upcoming 24-hour weather predictions
    for coordinates in Jakarta. Fallback simulator included to handle offline/dev scenarios.
    """
    def __init__(self):
        self.base_url = f"{MOCK_SERVER_URL}/v1/forecast" if MOCK_SERVER_URL else "https://api.open-meteo.com/v1/forecast"

    def get_24h_forecast(self, zone_name: str, latitude: float, longitude: float) -> list:
        """
        Polls the Open-Meteo public API for hourly weather forecasts.
        Returns a list of hourly dicts containing precipitation, wind, and timestamps.
        """
        try:
            params = {
                "latitude": latitude,
                "longitude": longitude,
                "hourly": "precipitation,relative_humidity_2m,wind_speed_10m",
                "timezone": "Asia/Jakarta",
                "forecast_days": 1
            }
            response = requests.get(self.base_url, params=params, timeout=10, verify=False if MOCK_SERVER_URL else True)
            
            if response.status_code == 200:
                data = response.json()
                hourly_data = data.get("hourly", {})
                times = hourly_data.get("time", [])
                precip_probs = hourly_data.get("precipitation_probability", [])
                precips = hourly_data.get("precipitation", [])
                winds = hourly_data.get("wind_speed_10m", [])
                humidities = hourly_data.get("relative_humidity_2m",[])
                
                forecast_records = []
                for i in range(len(times)):
                    dt = datetime.fromisoformat(times[i])
                    forecast_records.append({
                        "timestamp": dt,
                        "rainfall": float(precips[i]),
                        "humidity": float(humidities[i]),
                        "wind_speed": float(winds[i])
                        })
                
                logger.info(f"[Open-Meteo API] Successfully retrieved {len(forecast_records)} hourly segments for {zone_name}")
                return forecast_records
            else:
                logger.warning(f"[Open-Meteo API] Response status {response.status_code}. Defaulting to weather simulation.")
                return self._simulate_24h_forecast(zone_name)
                
        except Exception as e:
            logger.error(f"[Open-Meteo API] Error fetching forecast for {zone_name}: {str(e)}. Using simulator.")
            return self._simulate_24h_forecast(zone_name)

    def _simulate_24h_forecast(self, zone_name: str) -> list:
        """
        Generates realistic 24-hour hourly weather projections for Jakarta.
        Creates random heavy downpours (>10mm) in the afternoon/evening or early morning
        to trigger flood predictions organically for the MVP.
        """
        forecasts = []
        now = datetime.now()
        
        # Round to the current hour
        start_time = datetime(now.year, now.month, now.day, now.hour)
        
        # Determine if today has a simulated tropical monsoon cloud burst
        # Highly likely for Jakarta during monsoon season (e.g. 50% probability of heavy rain)
        has_heavy_downpour = random.choice([True, False])
        downpour_start_hour = random.randint(13, 17) # Typical afternoon downpour
        downpour_duration = random.randint(2, 3)

        for hour_offset in range(24):
            forecast_time = start_time + timedelta(hours=hour_offset)
            hour = forecast_time.hour
            
            # Default mild weather conditions
            precip_prob = random.uniform(5.0, 20.0)
            rain_accum = 0.0
            wind_speed = random.uniform(4.0, 12.0)
            
            # Check if this hour falls inside the heavy downpour window
            if has_heavy_downpour and (downpour_start_hour <= hour < downpour_start_hour + downpour_duration):
                # Heavy monsoon burst!
                precip_prob = random.uniform(85.0, 99.0)
                # Ensure at least one hour is above 10mm (Compound Weather threshold) to trigger flood events!
                if hour == downpour_start_hour:
                    rain_accum = random.uniform(11.0, 16.0)
                else:
                    rain_accum = random.uniform(6.0, 10.0)
                wind_speed = random.uniform(20.0, 35.0)
            
            # Kemang and Grogol are seeded with slightly higher rain vulnerabilities & local cloud simulations
            if ("Kemang" in zone_name or "Grogol" in zone_name) and not has_heavy_downpour:
                # Add occasional light-medium showers
                if 18 <= hour <= 21:
                    precip_prob = random.uniform(40.0, 65.0)
                    rain_accum = random.uniform(1.5, 4.0)

            forecasts.append({
                "timestamp": forecast_time,
                "precipitation_probability": round(precip_prob, 1),
                "rainfall": round(rain_accum, 2),
                "wind_speed": round(wind_speed, 2)
            })
            
        logger.debug(f"[Open-Meteo Simulator] Generated 24h forecast for {zone_name} (Heavy rain={has_heavy_downpour})")
        return forecasts
