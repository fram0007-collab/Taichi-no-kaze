/**
 * geofenceNotification.js — Pure push notification body resolution logic.
 * Testable without service worker or IndexedDB.
 */

import { calculateDistanceKm } from './haversine';

export const MAX_STALENESS_MS = 30 * 60 * 1000;

export function buildShortBody(payload) {
  const type = payload.disruption_type || 'disruption';
  const zone = payload.zone_name || 'the affected area';
  const score = Math.round(payload.probability_percentage ?? payload.score ?? 0);
  return `${type} at ${zone}. Score (${score}/100)`;
}

export function resolveNotificationBody({ payload, cachedLocation, prefs, now = Date.now() }) {
  const zoneLat = Number(payload.zone_lat);
  const zoneLng = Number(payload.zone_lng);

  if (!Number.isFinite(zoneLat) || !Number.isFinite(zoneLng)) {
    return { body: buildShortBody(payload), reason: 'short_no_coords' };
  }

  const isStale =
    !cachedLocation ||
    !cachedLocation.timestamp ||
    now - cachedLocation.timestamp > MAX_STALENESS_MS;

  if (isStale) {
    return { body: buildShortBody(payload), reason: 'short_stale' };
  }

  const userLat = Number(cachedLocation.lat);
  const userLng = Number(cachedLocation.lng);

  if (!Number.isFinite(userLat) || !Number.isFinite(userLng)) {
    return { body: buildShortBody(payload), reason: 'short_stale' };
  }

  const zoneRadiusKm = Number(payload.zone_radius_km) || Number(payload.threshold_km) || 2.0;
  const userRadiusKm = prefs?.radiusKm ?? 5;

  const centerDistKm = calculateDistanceKm(userLat, userLng, zoneLat, zoneLng);
  const distanceToEdgeKm = Math.max(0, centerDistKm - zoneRadiusKm);
  const isInsideZone = centerDistKm <= zoneRadiusKm;
  const isNearZone = distanceToEdgeKm <= userRadiusKm;

  if (isInsideZone && isNearZone) {
    const body = payload.message || payload.body || buildShortBody(payload);
    return { body, reason: 'full' };
  }

  return { body: buildShortBody(payload), reason: 'short_outside' };
}
