from worker.push_sender import _build_payload


def _sample_alert(**overrides):
    alert = {
        "alert_id": 42,
        "zone_id": 7,
        "zone_name": "Pondok Aren",
        "disruption_type": "waterway",
        "severity": "HIGH",
        "zone_lat": -6.27,
        "zone_lng": 106.72,
        "zone_radius_km": 2.0,
        "threshold_km": 2.0,
        "probability_percentage": 75.0,
        "message": "Pondok Aren: HIGH waterway risk - score 75.0/100.",
    }
    alert.update(overrides)
    return alert


def test_build_payload_includes_spatial_fields():
    payload = _build_payload(_sample_alert())

    assert payload["zone_lat"] == -6.27
    assert payload["zone_lng"] == 106.72
    assert payload["threshold_km"] == 2.0
    assert payload["zone_radius_km"] == 2.0


def test_build_payload_includes_score_fields():
    payload = _build_payload(_sample_alert(probability_percentage=75.0))

    assert payload["probability_percentage"] == 75.0
    assert payload["score"] == 75.0


def test_build_payload_builds_deep_link():
    payload = _build_payload(_sample_alert(alert_id=42, zone_id=7))

    assert payload["url"] == "/?alert_id=42&zone_id=7"
    assert payload["map_link"] == "/?alert_id=42&zone_id=7"


def test_build_payload_deep_link_defaults_without_ids():
    payload = _build_payload(_sample_alert(alert_id=None, zone_id=None))

    assert payload["url"] == "/"
    assert payload["map_link"] == "/"


def test_build_payload_preserves_existing_body():
    payload = _build_payload(_sample_alert(disruption_type="waterway", probability_percentage=75.0))

    assert payload["body"] == "🌊 Waterway disruption at Pondok Aren (score 75/100)"
