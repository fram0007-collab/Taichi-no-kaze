from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover - optional dependency for local/dev environments
    WebPushException = Exception
    webpush = None

try:
    from .alert_notifications import build_alert_notification_payload, matches_preferences
except ImportError:  # pragma: no cover - allows direct script execution
    from alert_notifications import build_alert_notification_payload, matches_preferences

PUSH_SUBSCRIPTIONS: List[Dict[str, Any]] = []


def _normalize_subscription(subscription: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not subscription:
        return None
    endpoint = subscription.get("endpoint") or subscription.get("url")
    if not endpoint:
        return None
    normalized: Dict[str, Any] = {
        "endpoint": str(endpoint),
        "keys": dict(subscription.get("keys") or {}),
        "preferences": dict(subscription.get("preferences") or {}),
        "created_at": subscription.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return normalized


def save_subscription(subscription: Optional[Dict[str, Any]], preferences: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    normalized = _normalize_subscription(subscription)
    if not normalized:
        return None

    if preferences is not None:
        normalized["preferences"] = dict(preferences)

    for index, existing in enumerate(PUSH_SUBSCRIPTIONS):
        if existing.get("endpoint") == normalized["endpoint"]:
            normalized["created_at"] = existing.get("created_at") or normalized["created_at"]
            PUSH_SUBSCRIPTIONS[index] = normalized
            return normalized

    PUSH_SUBSCRIPTIONS.append(normalized)
    return normalized


def remove_subscription(subscription_or_endpoint: Any) -> bool:
    endpoint = None
    if isinstance(subscription_or_endpoint, dict):
        endpoint = subscription_or_endpoint.get("endpoint") or subscription_or_endpoint.get("url")
    else:
        endpoint = str(subscription_or_endpoint)

    if not endpoint:
        return False

    original_length = len(PUSH_SUBSCRIPTIONS)
    PUSH_SUBSCRIPTIONS[:] = [item for item in PUSH_SUBSCRIPTIONS if item.get("endpoint") != endpoint]
    return len(PUSH_SUBSCRIPTIONS) != original_length


def list_subscriptions() -> List[Dict[str, Any]]:
    return [dict(item) for item in PUSH_SUBSCRIPTIONS]


def build_push_payload(
    alert: Optional[Dict[str, Any]],
    preferences: Optional[Dict[str, Any]] = None,
    safe_areas: Optional[List[Dict[str, Any]]] = None,
    user_location: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    payload = build_alert_notification_payload(alert, preferences, safe_areas=safe_areas, user_location=user_location)
    if not payload:
        return None

    alert_id = payload.get("alert_id") or alert.get("alert_id") if alert else None
    zone_id = None
    if alert:
        zone_id = alert.get("zone_id") or ((alert.get("zone") or {}).get("zone_id") if isinstance(alert.get("zone"), dict) else None)
    url = payload.get("map_link") or f"/?alert_id={alert_id}&zone_id={zone_id}" if alert_id is not None and zone_id is not None else "/"

    return {
        "title": "DIS-RUPTURE Alert",
        "body": payload.get("message"),
        "message": payload.get("message"),
        "alert_id": alert_id,
        "zone_id": zone_id,
        "disruption_type": payload.get("disruption_type"),
        "severity": payload.get("severity"),
        "zone_name": payload.get("zone_name"),
        "safe_area": payload.get("safe_area"),
        "url": url,
        "map_link": url,
    }


def send_push_notification(
    subscription: Optional[Dict[str, Any]],
    payload: Optional[Dict[str, Any]],
    sender: Optional[Any] = None,
) -> Dict[str, Any]:
    if sender is not None:
        return {"status": "sent", "sender": "custom", "result": sender(subscription, payload)}

    if not subscription or not payload:
        return {"status": "skipped", "reason": "missing subscription or payload"}

    if webpush is None:
        return {"status": "skipped", "reason": "pywebpush is not installed"}

    subscription_info = {
        "endpoint": subscription.get("endpoint"),
        "keys": subscription.get("keys") or {},
    }
    vapid_private_key = os.getenv("VAPID_PRIVATE_KEY")
    vapid_claims = {
        "sub": os.getenv("VAPID_SUBJECT", "mailto:alerts@example.com"),
    }

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=vapid_private_key,
            vapid_claims=vapid_claims,
            ttl=60,
        )
        return {"status": "sent", "endpoint": subscription_info["endpoint"]}
    except Exception as exc:  # pragma: no cover - depends on runtime webpush availability
        return {"status": "failed", "error": str(exc)}


def send_alert_to_matching_subscriptions(
    alert: Optional[Dict[str, Any]],
    preferences: Optional[Dict[str, Any]] = None,
    subscriptions: Optional[List[Dict[str, Any]]] = None,
    safe_areas: Optional[List[Dict[str, Any]]] = None,
    user_location: Optional[Dict[str, Any]] = None,
    sender: Optional[Any] = None,
) -> List[Dict[str, Any]]:
    """Deliver a push notification to matching subscribers.

    TODO: wire this into the worker or scheduler once new alerts are detected.
    """
    payload = build_push_payload(alert, preferences, safe_areas=safe_areas, user_location=user_location)
    if not payload:
        return []

    target_subscriptions = subscriptions if subscriptions is not None else list_subscriptions()
    deliveries = []

    for subscription in target_subscriptions:
        subscription_preferences = subscription.get("preferences") or preferences or {}
        if not matches_preferences(alert, subscription_preferences):
            continue
        delivery_result = send_push_notification(subscription, payload, sender=sender)
        deliveries.append({"endpoint": subscription.get("endpoint"), **delivery_result})

    return deliveries
