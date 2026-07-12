from __future__ import annotations

from typing import Any, Dict, List, Optional


def _normalize_disruption_type(disruption_type: Optional[str]) -> str:
    if not disruption_type:
        return "general"
    value = str(disruption_type).strip().lower()
    value = value.replace("/", " ").replace("-", " ")
    value = " ".join(value.split())
    if value in {"flood river", "river flood", "flood"}:
        return "flood"
    if value in {"waterway", "river", "canal"}:
        return "flood"
    if value == "traffic":
        return "traffic"
    if value == "weather":
        return "weather"
    if value == "crowd":
        return "crowd"
    if value == "earthquake":
        return "earthquake"
    return value or "general"


def _coerce_number(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_distance(distance_km: Optional[float]) -> str:
    distance = _coerce_number(distance_km)
    if distance is None:
        return "nearby"
    return f"{distance:.1f}"


def _classify_weather_risk(alert: Dict[str, Any]) -> str:
    explicit = str(alert.get("weather_risk_level") or "").strip().upper()
    if explicit in {"LOW", "MEDIUM", "HIGH"}:
        return explicit

    severity = str(alert.get("severity") or "").strip().upper()
    if severity == "HIGH":
        return "HIGH"
    if severity == "MEDIUM":
        return "MEDIUM"
    return "LOW"


def matches_preferences(alert: Optional[Dict[str, Any]], preferences: Optional[Dict[str, Any]]) -> bool:
    if not alert or not preferences:
        return False
    if not preferences.get("enabled", False):
        return False

    disruption_type = _normalize_disruption_type(alert.get("disruption_type"))
    types_preferences = preferences.get("types") or {}
    if not types_preferences.get(disruption_type, False):
        return False

    severity = str(alert.get("severity") or "").strip().upper()
    if severity not in {"HIGH", "MEDIUM"}:
        return False

    radius_km = _coerce_number(preferences.get("radiusKm"))
    distance_km = _coerce_number(alert.get("distance_km"))
    if radius_km is not None and distance_km is not None and distance_km > radius_km:
        return False

    return True


def find_safe_area_recommendation(alert: Optional[Dict[str, Any]], safe_areas: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    if not safe_areas:
        if alert and alert.get("safe_area"):
            return alert.get("safe_area")
        return None

    candidates = [item for item in safe_areas if item.get("name")]
    if not candidates:
        return None

    def sort_key(item: Dict[str, Any]) -> tuple[float, str]:
        distance = _coerce_number(item.get("distance_km"))
        if distance is None:
            return (float("inf"), "")
        return (distance, str(item.get("name", "")))

    return min(candidates, key=sort_key)


def format_safe_area_recommendation(safe_area: Optional[Dict[str, Any]]) -> str:
    if not safe_area:
        return "No nearby safe area is available yet. Follow official emergency guidance and avoid the affected zone."

    name = safe_area.get("name") or "a nearby safe area"
    distance_km = _coerce_number(safe_area.get("distance_km"))
    distance_text = f"about {distance_km:.1f} km away" if distance_km is not None else "a short distance away"
    return f"Recommended nearby safe area: {name}, {distance_text}."


def build_calm_alert_message(alert: Optional[Dict[str, Any]], safe_area: Optional[Dict[str, Any]] = None) -> str:
    if not alert:
        return "Stay aware: A disruption was detected nearby. Move carefully, avoid risky areas, and consider heading to a nearby safe location."

    zone_name = alert.get("zone_name") or alert.get("zone") or "the affected area"
    if isinstance(zone_name, dict):
        zone_name = zone_name.get("name") or "the affected area"

    distance_km = _format_distance(alert.get("distance_km"))
    disruption_type = _normalize_disruption_type(alert.get("disruption_type"))
    severity = str(alert.get("severity") or "MEDIUM").strip().upper()

    if disruption_type == "traffic":
        current_speed = _coerce_number(alert.get("current_speed"))
        normal_speed = _coerce_number(alert.get("normal_speed"))
        congestion_level = alert.get("congestion_level") or alert.get("traffic_condition")
        message = (
            f"Stay aware: Heavy traffic is reported near {zone_name}, about {distance_km} km from you."
        )
        if current_speed is not None and normal_speed is not None:
            message += f" Current speed is about {int(current_speed)} km/h versus a typical {int(normal_speed)} km/h."
        if congestion_level:
            message += f" Congestion is {congestion_level}."
        message += " Avoid driving through this area if possible and consider using an alternate route."
    elif disruption_type == "crowd":
        crowd_score = _coerce_number(alert.get("crowd_score"))
        nearby_pois = alert.get("nearby_crowded_pois") or []
        message = (
            f"Stay aware: A crowd buildup is detected near {zone_name}, about {distance_km} km from you."
        )
        if crowd_score is not None:
            message += f" Crowd activity is around {crowd_score:.0f}."
        if nearby_pois:
            poi_names = ", ".join(str(item) for item in nearby_pois[:3])
            message += f" Nearby crowded spots include {poi_names}."
        message += " Avoid passing through the area if possible, keep distance from dense crowds, and use a safer nearby route."
    elif disruption_type == "weather":
        weather_type = alert.get("weather_type") or alert.get("condition") or "weather"
        rain_intensity = _coerce_number(alert.get("rainfall_intensity_mm"))
        wind_speed = _coerce_number(alert.get("wind_speed_kmh"))
        humidity = _coerce_number(alert.get("humidity_pct"))
        risk_level = _classify_weather_risk(alert)
        message = f"Stay aware: {weather_type} is expected near {zone_name}, about {distance_km} km from you."
        if rain_intensity is not None:
            message += f" Rainfall intensity is about {rain_intensity:.0f} mm."
        if wind_speed is not None:
            message += f" Wind speed is around {wind_speed:.0f} km/h."
        if humidity is not None:
            message += f" Humidity is around {humidity:.0f}%."
        if risk_level == "HIGH":
            message += " Avoid unnecessary travel and move to a safer covered location."
        elif risk_level == "MEDIUM":
            message += " Use caution and avoid exposed or low-lying areas."
        else:
            message += " Conditions appear safe, but stay aware."
    elif disruption_type == "flood":
        water_level_cm = _coerce_number(alert.get("water_level_cm"))
        river_name = alert.get("river_name") or alert.get("canal_name") or alert.get("waterway_name")
        alert_level = alert.get("alert_level")
        message = f"Stay aware: Rising water is reported near {zone_name}, about {distance_km} km from you."
        if water_level_cm is not None:
            message += f" Water level is around {int(water_level_cm)} cm."
        if river_name:
            message += f" The {river_name} area is being monitored."
        if alert_level:
            message += f" Current alert level is {alert_level}."
        if severity == "HIGH":
            message += " Avoid low-lying roads, riverbanks, underpasses, and consider moving toward higher ground."
        else:
            message += " Avoid low-lying roads and riverbanks if possible and keep to higher ground."
    elif disruption_type == "earthquake":
        magnitude = alert.get("magnitude")
        location = alert.get("location") or alert.get("earthquake_location") or zone_name
        impact_radius = alert.get("impact_radius_km")
        event_time = alert.get("event_time") or alert.get("event_timestamp")
        message = f"Stay aware: An earthquake of magnitude {magnitude} was recorded near {location}."
        if impact_radius is not None:
            message += f" The affected area extends about {impact_radius} km."
        if event_time:
            message += f" Event time was {event_time}."
        message += " If you are inside the affected radius, check your surroundings, avoid damaged buildings, and move calmly to an open safe area."
    else:
        message = (
            f"Stay aware: A {severity.lower()} disruption was detected near {zone_name}, about {distance_km} km from you."
            " Move carefully, avoid risky areas, and consider heading to a nearby safe location."
        )

    return f"{message} {format_safe_area_recommendation(safe_area)}"


def build_alert_notification_payload(
    alert: Optional[Dict[str, Any]],
    preferences: Optional[Dict[str, Any]] = None,
    safe_areas: Optional[List[Dict[str, Any]]] = None,
    user_location: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if not alert:
        return None
    if not matches_preferences(alert, preferences):
        return None

    safe_area = find_safe_area_recommendation(alert, safe_areas)
    message = build_calm_alert_message(alert, safe_area=safe_area)
    severity = str(alert.get("severity") or "MEDIUM").strip().upper()
    zone_id = alert.get("zone_id")
    alert_id = alert.get("alert_id") or alert.get("id")
    zone_name = alert.get("zone_name") or (alert.get("zone") or {}).get("name") if isinstance(alert.get("zone"), dict) else None

    return {
        "alert_id": alert_id,
        "disruption_type": _normalize_disruption_type(alert.get("disruption_type")),
        "severity": severity,
        "zone_name": zone_name or "the affected area",
        "distance_km": _coerce_number(alert.get("distance_km")),
        "message": message,
        "safe_area": safe_area,
        "map_link": f"/?alert_id={alert_id}&zone_id={zone_id}" if alert_id is not None and zone_id is not None else f"/?alert_id={alert_id}" if alert_id is not None else "/",
    }
