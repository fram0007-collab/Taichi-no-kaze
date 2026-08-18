from backend.alert_notifications import build_alert_notification_payload, matches_preferences


def test_matches_preferences_for_enabled_high_severity_alert():
    preferences = {
        "enabled": True,
        "radiusKm": 5,
        "types": {
            "traffic": True,
            "weather": True,
            "flood": True,
            "crowd": True,
            "earthquake": True,
        },
    }
    alert = {
        "alert_id": 10,
        "disruption_type": "traffic",
        "severity": "HIGH",
        "zone_name": "Pondok Aren",
        "distance_km": 3.2,
    }

    assert matches_preferences(alert, preferences) is True


def test_builds_calm_alert_payload_with_safe_area_recommendation():
    preferences = {
        "enabled": True,
        "radiusKm": 10,
        "types": {
            "traffic": True,
            "weather": True,
            "flood": True,
            "crowd": True,
            "earthquake": True,
        },
    }
    alert = {
        "alert_id": 21,
        "disruption_type": "flood",
        "severity": "HIGH",
        "zone_name": "Pondok Aren",
        "distance_km": 3.2,
        "water_level_cm": 180,
        "alert_level": "Siaga 3",
        "river_name": "Ciliwung",
    }
    safe_areas = [
        {"name": "RS Jakarta Medical Center", "distance_km": 1.4, "category": "hospital"}
    ]

    payload = build_alert_notification_payload(alert, preferences, safe_areas=safe_areas)

    assert payload is not None
    assert payload["disruption_type"] == "flood"
    assert "Stay aware" in payload["message"]
    assert "Recommended nearby safe area" in payload["message"]
    assert payload["safe_area"]["name"] == "RS Jakarta Medical Center"
    assert payload["threshold_km"] == 2.0
    assert payload["zone_radius_km"] == 2.0


def test_build_alert_notification_payload_includes_spatial_coordinates():
    preferences = {"enabled": True, "types": {"weather": True}}
    alert = {
        "alert_id": 50,
        "disruption_type": "weather",
        "severity": "HIGH",
        "zone_name": "Kebayoran Baru",
        "latitude": -6.2443,
        "longitude": 106.7972,
        "radius_km": 3.0,
    }

    payload = build_alert_notification_payload(alert, preferences)

    assert payload is not None
    assert payload["zone_lat"] == -6.2443
    assert payload["zone_lng"] == 106.7972
    assert payload["threshold_km"] == 3.0
    assert payload["zone_radius_km"] == 3.0


def test_build_alert_notification_payload_includes_probability_percentage():
    preferences = {"enabled": True, "types": {"flood": True}}
    alert = {
        "alert_id": 999,
        "zone_id": 1,
        "disruption_type": "flood",
        "severity": "HIGH",
        "zone_name": "Pondok Aren",
        "latitude": -6.27,
        "longitude": 106.72,
        "radius_km": 2.0,
        "probability_percentage": 75.0,
        "distance_km": 3.2,
    }

    payload = build_alert_notification_payload(alert, preferences)

    assert payload is not None
    assert payload["zone_name"] == "Pondok Aren"
    assert payload["zone_lat"] == -6.27
    assert payload["zone_lng"] == 106.72
    assert payload["zone_radius_km"] == 2.0
    assert payload["threshold_km"] == 2.0
    assert payload["probability_percentage"] == 75.0


def test_resolve_zone_radius_km_from_radius_m():
    preferences = {"enabled": True, "types": {"crowd": True}}
    alert = {
        "alert_id": 12,
        "disruption_type": "crowd",
        "severity": "HIGH",
        "zone_name": "Sudirman",
        "latitude": -6.21,
        "longitude": 106.82,
        "radius_m": 1500,
    }

    payload = build_alert_notification_payload(alert, preferences)

    assert payload is not None
    assert payload["zone_radius_km"] == 1.5
    assert payload["threshold_km"] == 2.0

