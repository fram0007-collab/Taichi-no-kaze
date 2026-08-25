import { calculateDistanceKm } from './haversine';

const DEFAULT_POI_MATCH_METERS = 300;

export function findNearestPoi(lat, lon, pois, maxMeters = DEFAULT_POI_MATCH_METERS) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(pois) || pois.length === 0) {
    return null;
  }

  const maxKm = maxMeters / 1000;
  let best = null;
  let bestDist = Infinity;

  for (const poi of pois) {
    const poiLat = poi.lat ?? poi.latitude;
    const poiLon = poi.lon ?? poi.longitude;
    if (!Number.isFinite(poiLat) || !Number.isFinite(poiLon)) continue;

    const distKm = calculateDistanceKm(lat, lon, poiLat, poiLon);
    if (distKm <= maxKm && distKm < bestDist) {
      best = poi;
      bestDist = distKm;
    }
  }

  return best;
}

export function findContainingZone(lat, lon, allZones) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(allZones) || allZones.length === 0) {
    return null;
  }

  const containing = allZones.filter((zs) => {
    const zone = zs.zone ?? zs;
    const zoneLat = zone.latitude;
    const zoneLon = zone.longitude;
    const radiusM = zone.radius_m ?? 1000;
    if (!Number.isFinite(zoneLat) || !Number.isFinite(zoneLon)) return false;

    const distKm = calculateDistanceKm(lat, lon, zoneLat, zoneLon);
    return distKm * 1000 <= radiusM;
  });

  if (containing.length === 0) return null;

  containing.sort((a, b) => {
    const radiusA = (a.zone ?? a).radius_m ?? 1000;
    const radiusB = (b.zone ?? b).radius_m ?? 1000;
    return radiusA - radiusB;
  });

  return containing[0];
}

export function resolveCrowdScore({ lat, lon, pois = [], allZones = [] }) {
  const nearestPoi = findNearestPoi(lat, lon, pois);
  if (nearestPoi && Number.isFinite(nearestPoi.crowd_score)) {
    return {
      crowd_score: nearestPoi.crowd_score,
      crowd_source: 'poi',
    };
  }

  const zoneStatus = findContainingZone(lat, lon, allZones);
  if (zoneStatus && Number.isFinite(zoneStatus.crowd_score)) {
    return {
      crowd_score: zoneStatus.crowd_score,
      crowd_source: 'zone',
    };
  }

  return {
    crowd_score: null,
    crowd_source: null,
  };
}
