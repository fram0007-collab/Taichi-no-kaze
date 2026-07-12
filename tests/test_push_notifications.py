from backend import push_notifications
from backend.push_notifications import list_subscriptions, save_subscription, send_alert_to_matching_subscriptions


def setup_function():
    push_notifications.PUSH_SUBSCRIPTIONS.clear()


def test_save_subscription_and_list_subscriptions():
    subscription = {
        "endpoint": "https://example.test/push/1",
        "keys": {"auth": "auth-value", "p256dh": "dh-value"},
    }
    preferences = {
        "enabled": True,
        "radiusKm": 5,
        "types": {"flood": True, "traffic": False},
    }

    saved = save_subscription(subscription, preferences)

    assert saved["endpoint"] == subscription["endpoint"]
    assert list_subscriptions()[0]["endpoint"] == subscription["endpoint"]


def test_send_alert_to_matching_subscriptions_respects_preferences(monkeypatch):
    calls = []

    def fake_sender(subscription, payload):
        calls.append((subscription["endpoint"], payload))

    save_subscription(
        {"endpoint": "https://example.test/push/2", "keys": {"auth": "auth", "p256dh": "dh"}},
        {"enabled": True, "radiusKm": 5, "types": {"flood": True}},
    )

    alert = {
        "alert_id": 77,
        "disruption_type": "flood",
        "severity": "HIGH",
        "zone_name": "Pondok Aren",
        "distance_km": 3.2,
        "zone_id": 7,
    }

    send_alert_to_matching_subscriptions(alert, {"enabled": True, "radiusKm": 5, "types": {"flood": True}}, sender=fake_sender)

    assert len(calls) == 1
    assert calls[0][0] == "https://example.test/push/2"
    assert calls[0][1]["alert_id"] == 77
    assert calls[0][1]["severity"] == "HIGH"
