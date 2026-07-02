import time
import requests

MOCK_SERVER_URL = "http://localhost:8081"

def test_tomtom_traffic():
    print("\n--- Testing TomTom Traffic Segment ---")
    url = f"{MOCK_SERVER_URL}/traffic/services/4/flowSegmentData/absolute/10/json"
    params = {
        "key": "mock-api-key-123",
        "point": "-6.2088,106.8175",  # Sudirman Corridor coords
        "unit": "KMPH",
        "thickness": 1
    }
    try:
        resp = requests.get(url, params=params, timeout=5)
        print(f"Status: {resp.status_code}")
        print("Response segment snippet:")
        print(resp.text[:300])
    except Exception as e:
        print(f"Request failed: {e}")

def test_bmkg_earthquakes():
    print("\n--- Testing BMKG Earthquakes List ---")
    url = f"{MOCK_SERVER_URL}/DataMKG/TEWS/gempaterkini.json"
    headers = {"User-Agent": "DIS-RUPTURE/2.0 (Monash ITI5120)"}
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        print(f"Status: {resp.status_code}")
        print("Response earthquake list snippet:")
        print(resp.text[:300])
    except Exception as e:
        print(f"Request failed: {e}")

def test_openmeteo_weather():
    print("\n--- Testing Open-Meteo Weather Forecast ---")
    url = f"{MOCK_SERVER_URL}/v1/forecast"
    params = {
        "latitude": -6.2088,
        "longitude": 106.8175,
        "hourly": "precipitation,relative_humidity_2m,wind_speed_10m",
        "timezone": "Asia/Jakarta",
        "forecast_days": 1
    }
    try:
        resp = requests.get(url, params=params, timeout=5)
        print(f"Status: {resp.status_code}")
        print("Response weather hourly units snippet:")
        print(resp.text[:300])
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    print("Firing simulated client API requests to the mock server...")
    test_tomtom_traffic()
    time.sleep(0.5)
    test_bmkg_earthquakes()
    time.sleep(0.5)
    test_openmeteo_weather()
    print("\nSimulations complete! Open http://localhost:8081/dashboard to view these in the request history.")
