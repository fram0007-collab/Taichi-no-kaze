"""
push_sender.py — sends Web Push notifications to all subscribers
when a new MEDIUM/HIGH alert fires in the scoring cycle.

Called from engine.py after a new alert is committed to DB.
Requires env vars:
  VAPID_PRIVATE_KEY  — base64url-encoded private key
  VAPID_SUBJECT      — mailto:your@email.com
"""
import json
import logging
import os

logger = logging.getLogger(__name__)

try:
    from pywebpush import WebPushException, webpush
    WEBPUSH_AVAILABLE = True
except ImportError:
    WEBPUSH_AVAILABLE = False
    logger.warning("[Push] pywebpush not installed — push notifications disabled")


def _get_subscriptions(db_conn) -> list:
    """Fetch all push subscriptions from Supabase."""
    try:
        cur = db_conn.cursor()
        cur.execute("""
            SELECT endpoint, p256dh, auth, preferences
            FROM push_subscriptions
        """)
        rows = cur.fetchall()
        cur.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"[Push] Failed to fetch subscriptions: {e}")
        return []


def _build_payload(alert: dict) -> dict:
    """Build the push notification payload from an alert dict."""
    zone_name = alert.get("zone_name") or f"Zone {alert.get('zone_id', '?')}"
    severity = (alert.get("severity") or "MEDIUM").upper()
    disruption = (alert.get("disruption_type") or "disruption").capitalize()
    score = float(alert.get("probability_percentage") or 0)

    emoji = {
        "traffic": "🚗", "crowd": "👥", "weather": "⛈️",
        "waterway": "🌊", "earthquake": "🌍",
    }.get(alert.get("disruption_type", "").lower(), "⚠️")

    return {
        "title": f"DIS-RUPTURE — {severity} Alert",
        "body":  f"{emoji} {disruption} disruption at {zone_name} (score {score:.0f}/100)",
        "message": alert.get("message", ""),
        "alert_id": alert.get("alert_id"),
        "zone_id": alert.get("zone_id"),
        "zone_name": zone_name,
        "severity": severity,
        "disruption_type": alert.get("disruption_type"),
        "url": "/",
        "map_link": "/",
        "icon": "/icons/icon-192.png",
        "badge": "/icons/icon-192.png",
        "tag": f"alert-{alert.get('zone_id')}-{alert.get('disruption_type')}",
    }


def _matches_preferences(alert: dict, prefs: dict) -> bool:
    """Return True if alert matches subscriber's notification preferences."""
    if not prefs:
        return True  # no preferences = receive everything

    # Severity filter
    min_severity = (prefs.get("min_severity") or "MEDIUM").upper()
    severity_rank = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
    alert_rank = severity_rank.get((alert.get("severity") or "MEDIUM").upper(), 1)
    min_rank = severity_rank.get(min_severity, 1)
    if alert_rank < min_rank:
        return False

    # Disruption type filter
    allowed_types = prefs.get("disruption_types")
    if allowed_types and alert.get("disruption_type") not in allowed_types:
        return False

    return True


def send_push_for_alert(alert: dict, db_conn) -> int:
    """
    Send push notifications to all matching subscribers for a new alert.
    Returns number of notifications successfully sent.
    """
    if not WEBPUSH_AVAILABLE:
        return 0

    vapid_private_key = os.environ.get("VAPID_PRIVATE_KEY")
    vapid_subject = os.environ.get("VAPID_SUBJECT", "mailto:alerts@dis-rupture.app")

    if not vapid_private_key:
        logger.warning("[Push] VAPID_PRIVATE_KEY not set — skipping push")
        return 0

    subscriptions = _get_subscriptions(db_conn)
    if not subscriptions:
        return 0

    payload = _build_payload(alert)
    sent = 0
    stale = []

    for sub in subscriptions:
        prefs = {}
        try:
            raw = sub.get("preferences")
            if isinstance(raw, str):
                prefs = json.loads(raw)
            elif isinstance(raw, dict):
                prefs = raw
        except Exception:
            prefs = {}

        if not _matches_preferences(alert, prefs):
            continue

        try:
            webpush(
                subscription_info={
                    "endpoint": sub["endpoint"],
                    "keys": {
                        "p256dh": sub.get("p256dh") or "",
                        "auth":   sub.get("auth") or "",
                    },
                },
                data=json.dumps(payload),
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": vapid_subject},
                ttl=300,  # 5 minutes
            )
            sent += 1
            logger.info(f"[Push] Sent to {sub['endpoint'][:40]}...")
        except WebPushException as e:
            status = getattr(e.response, "status_code", None) if hasattr(e, "response") else None
            if status in (404, 410):
                # Subscription expired — clean up
                stale.append(sub["endpoint"])
            else:
                logger.warning(f"[Push] Failed for {sub['endpoint'][:40]}: {e}")
        except Exception as e:
            logger.warning(f"[Push] Error: {e}")

    # Remove stale subscriptions
    if stale:
        try:
            cur = db_conn.cursor()
            for endpoint in stale:
                cur.execute("DELETE FROM push_subscriptions WHERE endpoint = %s", (endpoint,))
            db_conn.commit()
            cur.close()
            logger.info(f"[Push] Removed {len(stale)} stale subscriptions")
        except Exception as e:
            logger.error(f"[Push] Stale cleanup failed: {e}")

    return sent
