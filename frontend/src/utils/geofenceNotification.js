/**
 * geofenceNotification.js — Pure push notification body/suppression logic.
 * Testable without service worker or IndexedDB.
 *
 * Behavior: notifications are SUPPRESSED (not just shortened) when the
 * user is outside their configured radius from the alert zone, or when no
 * usable location is available. This keeps notification volume relevant —
 * users are not bothered by alerts far from wherever they last were.
 */

import { calculateDistanceKm } from './haversine';

// A saved location is used regardless of age up to this limit. Beyond it,
// the position is considered too stale to trust for filtering (the user
// may have moved significantly), so we fall back to showing a generic,
// unfiltered notification rather than either suppressing incorrectly or
// filtering against a day-old position.
export const MAX_STALENESS_MS = 24 * 60 * 60 * 1000; // 24 hours

export function buildShortBody(payload) {
  const type = payload.disruption_type || 'disruption';
  const zone = payload.zone_name || 'the affected area';
  const score = Math.round(payload.probability_percentage ?? payload.score ?? 0);
  return `${type} at ${zone}. Score (${score}/100)`;
}

/**
 * Returns { body, shouldShow, reason, useFallbackTag? }
 *
 * shouldShow=false means the caller should suppress the notification
 * entirely — no card shown, no fallback tag needed since nothing renders.
 */
export function resolveNotificationBody({ payload, cachedLocation, prefs, now = Date.now() }) {
  const zoneLat = Number(payload.zone_lat);
  const zoneLng = Number(payload.zone_lng);

  // No zone coordinates in the payload at all — nothing to filter against,
  // so show unfiltered rather than guessing.
  if (!Number.isFinite(zoneLat) || !Number.isFinite(zoneLng)) {
    return { body: buildShortBody(payload), shouldShow: true, reason: 'show_no_coords' };
  }

  const hasTimestamp = cachedLocation && Number.isFinite(Number(cachedLocation.timestamp));
  const isStale = !cachedLocation || !hasTimestamp || (now - Number(cachedLocation.timestamp) > MAX_STALENESS_MS);

  const userLat = Number(cachedLocation?.lat);
  const userLng = Number(cachedLocation?.lng);
  const hasValidCoords = cachedLocation && Number.isFinite(userLat) && Number.isFinite(userLng);

  // No location ever saved, or last save is older than 24h — can't
  // reliably filter, so fall back to a generic notification rather than
  // either suppressing (which could hide a genuinely relevant alert) or
  // filtering against a position that's a day old.
  if (!hasValidCoords || isStale) {
    return {
      body: buildShortBody(payload),
      shouldShow: true,
      reason: !cachedLocation ? 'fallback_no_location' : (isStale ? 'fallback_stale' : 'fallback_malformed'),
      useFallbackTag: true,
    };
  }

  const zoneRadiusKm = Number(payload.zone_radius_km) || Number(payload.threshold_km) || 2.0;
  const userRadiusKm = Number(prefs?.radiusKm) || 5;

  const centerDistKm = calculateDistanceKm(userLat, userLng, zoneLat, zoneLng);
  const distanceToEdgeKm = Math.max(0, centerDistKm - zoneRadiusKm);
  const isInsideZone = centerDistKm <= zoneRadiusKm;
  const isNearZone = distanceToEdgeKm <= userRadiusKm;

  if (isInsideZone || isNearZone) {
    const body = payload.message || payload.body || buildShortBody(payload);
    return {
      body,
      shouldShow: true,
      reason: isInsideZone ? 'show_inside_zone' : 'show_near_zone',
      centerDistKm,
      distanceToEdgeKm,
    };
  }

  // Outside the user's configured radius and outside the zone itself —
  // genuinely not relevant to this device right now. Suppress.
  return {
    body: buildShortBody(payload),
    shouldShow: false,
    reason: 'suppressed_too_far',
    centerDistKm,
    distanceToEdgeKm,
  };
}
