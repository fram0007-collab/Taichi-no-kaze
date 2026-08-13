import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + '/..'))
import unittest
from fastapi.testclient import TestClient
from mockserver.main import app

class TestMockServerZones(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_mock_zones_crud_flow(self):
        # 1. Fetch initially (should be 200 OK)
        response = self.client.get("/api/mock_zones")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("zones", data)
        initial_count = data["total"]

        # 2. Create a new zone
        new_zone_payload = {
            "name": "Test Ciliwung Flood Zone",
            "latitude": -6.2200,
            "longitude": 106.8300,
            "radius_km": 2.5,
            "disruption_type": "flood",
            "severity": "HIGH",
            "probability_percentage": 90.0,
            "message": "Water overflow detected near Ciliwung",
            "status": "OPEN"
        }

        create_resp = self.client.post("/api/mock_zones", json=new_zone_payload)
        self.assertEqual(create_resp.status_code, 200)
        create_data = create_resp.json()
        self.assertEqual(create_data["status"], "success")
        zone_id = create_data["zone_id"]
        self.assertIsNotNone(zone_id)

        # 3. Verify it appears in GET /api/mock_zones
        fetch_resp = self.client.get("/api/mock_zones")
        self.assertEqual(fetch_resp.status_code, 200)
        fetch_data = fetch_resp.json()
        self.assertEqual(fetch_data["total"], initial_count + 1)
        created = next((z for z in fetch_data["zones"] if z["zone_id"] == zone_id), None)
        self.assertIsNotNone(created)
        self.assertEqual(created["name"], "Test Ciliwung Flood Zone")
        self.assertEqual(created["disruption_type"], "flood")
        self.assertEqual(created["radius_km"], 2.5)

        # 4. Update the zone
        update_payload = {
            "name": "Updated Ciliwung Flood Zone",
            "latitude": -6.2250,
            "longitude": 106.8350,
            "radius_km": 3.0,
            "disruption_type": "flood",
            "severity": "CRITICAL",
            "probability_percentage": 95.0,
            "message": "Critical flood level reached",
            "status": "OPEN"
        }
        update_resp = self.client.put(f"/api/mock_zones/{zone_id}", json=update_payload)
        self.assertEqual(update_resp.status_code, 200)

        # Verify update
        fetch_after_update = self.client.get("/api/mock_zones").json()
        updated = next((z for z in fetch_after_update["zones"] if z["zone_id"] == zone_id), None)
        self.assertIsNotNone(updated)
        self.assertEqual(updated["name"], "Updated Ciliwung Flood Zone")
        self.assertEqual(updated["severity"], "CRITICAL")
        self.assertEqual(updated["radius_km"], 3.0)

        # 5. Delete the zone
        del_resp = self.client.delete(f"/api/mock_zones/{zone_id}")
        self.assertEqual(del_resp.status_code, 200)

        # Verify deletion
        fetch_after_del = self.client.get("/api/mock_zones").json()
        self.assertEqual(fetch_after_del["total"], initial_count)
        self.assertFalse(any(z["zone_id"] == zone_id for z in fetch_after_del["zones"]))

if __name__ == "__main__":
    unittest.main()
