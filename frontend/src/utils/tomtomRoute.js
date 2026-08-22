/**
 * Shared TomTom helpers used by evacuation and Navigate.
 */

export function circleToBbox(lat, lon, radiusM) {
  const latDelta = radiusM / 111320;
  const lonDelta = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    southWestCorner: { latitude: lat - latDelta, longitude: lon - lonDelta },
    northEastCorner: { latitude: lat + latDelta, longitude: lon + lonDelta },
  };
}

export function parseTomtomRoute(data) {
  const route = data.routes?.[0];
  if (!route) return null;
  const summary = route.summary ?? {};
  const coordinates = (route.legs ?? []).flatMap((leg) =>
    (leg.points ?? []).map((p) => [p.longitude, p.latitude])
  );
  return {
    durationMin: Math.ceil((summary.travelTimeInSeconds ?? 0) / 60),
    distanceKm: Number(((summary.lengthInMeters ?? 0) / 1000).toFixed(1)),
    geometry: { type: 'LineString', coordinates },
  };
}

export async function fetchTomtomRoute({
  apiKey,
  origin,
  dest,
  avoidRects = [],
  travelMode = 'car',
}) {
  const originStr = `${origin.lat},${origin.lon}`;
  const destStr = `${dest.lat},${dest.lon}`;
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${originStr}:${destStr}/json` +
    `?key=${apiKey}` +
    `&travelMode=${travelMode}` +
    `&instructionsType=text` +
    `&language=en-GB`;

  const body = avoidRects.length
    ? JSON.stringify({ avoidAreas: { rectangles: avoidRects } })
    : null;

  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body,
  });
  if (!res.ok) {
    throw new Error(`TomTom routing failed (${res.status})`);
  }
  const parsed = parseTomtomRoute(await res.json());
  if (!parsed || parsed.geometry.coordinates.length < 2) {
    throw new Error('No route returned by TomTom.');
  }
  return parsed;
}

export async function searchTomtomPlaces({ apiKey, query, lat, lon, limit = 8 }) {
  const params = new URLSearchParams({
    key: apiKey,
    typeahead: 'true',
    limit: String(limit),
    countrySet: 'ID',
    language: 'en-GB',
  });
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    params.set('lat', String(lat));
    params.set('lon', String(lon));
  }
  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom search failed (${res.status})`);
  const data = await res.json();
  return (data.results ?? [])
    .map((r) => ({
      id: r.id,
      name: r.poi?.name || r.address?.freeformAddress || 'Place',
      address: r.address?.freeformAddress || '',
      lat: r.position?.lat,
      lon: r.position?.lon,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}
