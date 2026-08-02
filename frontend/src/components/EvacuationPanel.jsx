/**
 * EvacuationPanel.jsx
 * ───────────────────────────────────────────────────────────────────────────
 * Shows when a user has active threats in their radius and taps
 * "Get Evacuation Guidance". Provides:
 *   1. TomTom routing to nearest safe POI, avoiding threat zone bboxes
 *   2. Step-by-step text guide per disruption type
 *   3. Relevant emergency hotlines (tap-to-call)
 *
 * i18n note: all user-facing strings are in the CONTENT object at the top
 * of this file — easy to extract into a translation file when Bahasa
 * Indonesia support is added.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X, Phone, Navigation, ChevronDown, ChevronUp,
  AlertTriangle, MapPin, Loader2, ShieldCheck
} from 'lucide-react';
import { getApiUrl } from '../utils/getApiUrl';
import { ResolutionBadgeExpanded } from './ResolutionBadge';
import { MlResolutionBadgeExpanded } from './MlResolutionBadge';

// ── i18n-ready content block ────────────────────────────────────────────────
const COMMON_EMERGENCY_HOTLINES = [
  { name: 'BPBD Jakarta', number: '021-1123', role: 'City disaster management' },
  { name: 'Basarnas (SAR)', number: '115', role: 'Search & rescue operations' },
  { name: 'PMI', number: '021-7992325', role: 'Emergency support & relief' },
  { name: 'Ambulance', number: '119', role: 'Medical emergency' },
];

const CONTENT = {
  // Step-by-step guides per disruption type
  guides: {
    traffic: {
      title: 'Traffic Disruption — What To Do',
      icon: '🚦',
      steps: [
        'Stay calm. Do not attempt to drive through gridlocked areas.',
        'Check live traffic on this map before moving.',
        'If on foot, move to the nearest covered public space (mall or station) to wait.',
        'Avoid main arterials — use Jalan Tol inner-city or TransJakarta bus corridors if available.',
        'If you must drive, follow the evacuation route shown on the map.',
        'Keep your fuel tank above half — fuel stations may be congested.',
      ],
    },
    weather: {
      title: 'Severe Weather — What To Do',
      icon: '⛈️',
      steps: [
        'Move indoors immediately. Avoid open areas, trees, and metal structures.',
        'Stay away from windows and glass doors.',
        'If driving, pull over safely and wait for the weather to pass.',
        'Avoid underpasses and low-lying roads — flash flooding can occur rapidly.',
        'Keep your phone charged and monitor BMKG alerts.',
        'If conditions worsen, follow the evacuation route to the nearest hospital or covered shelter.',
      ],
    },
    flood: {
      title: 'Flood — What To Do',
      icon: '🌊',
      steps: [
        'Move to higher ground immediately. Do not wait for water to reach you.',
        'Avoid walking or driving through floodwater — 15 cm of moving water can knock you off your feet.',
        'Turn off electricity at the main breaker if water is entering your building.',
        'Do not use elevators in flooded buildings.',
        'Take essential documents, medicine, and emergency supplies.',
        'Follow the evacuation route to the nearest elevated shelter or hospital.',
      ],
    },
    waterway: {
      title: 'Waterway Alert — What To Do',
      icon: '🌧️',
      steps: [
        'A waterway in your area is approaching or has exceeded safe capacity.',
        'Move away from riverbanks, canals, and low-lying areas near water.',
        'Avoid crossing bridges over flooded waterways.',
        'Monitor water levels — conditions can change quickly during heavy rainfall.',
        'Prepare to evacuate if the alert level escalates to Siaga 1 or 2.',
        'Follow the evacuation route shown on the map to a safe hospital or elevated shelter.',
      ],
    },
    earthquake: {
      title: 'Earthquake — What To Do',
      icon: '🌍',
      steps: [
        'DROP to your hands and knees immediately.',
        'Take COVER under a sturdy desk or table, or against an interior wall. Cover your head and neck.',
        'HOLD ON until shaking stops. Do not run outside during shaking.',
        'Once shaking stops, check yourself and others for injuries.',
        'Evacuate the building calmly using stairs — do not use elevators.',
        'Move to an open area away from buildings, trees, and power lines.',
        'Follow the evacuation route to the nearest hospital or police coordination point.',
        'Expect aftershocks. Stay alert.',
      ],
    },
    crowd: {
      title: 'Crowd Surge — What To Do',
      icon: '👥',
      steps: [
        'Do not panic. Stay on your feet — falling in a crowd is dangerous.',
        'Move diagonally toward the edge of the crowd, not against the flow.',
        'Keep your arms up near your chest to protect your breathing space.',
        'Avoid bottlenecks — doors, gates, and narrow corridors are the most dangerous.',
        'If you fall, curl into a ball and protect your head until you can stand.',
        'Once clear of the crowd, move to the nearest hospital or police station for safety.',
      ],
    },
  },

  // Emergency hotlines per disruption type
  // Only include contacts relevant to each disruption — no firemen for traffic, etc.
  hotlines: {
    traffic: [
      { name: 'Jasa Marga Hotline',      number: '14080',      role: 'Toll road incidents & rerouting' },
      { name: 'Dishub DKI Jakarta',      number: '021-3813939', role: 'Traffic management & public transport' },
      { name: 'Polisi Lalu Lintas (TMC)', number: '021-5591-2669', role: 'Traffic police & accident response' },
    ],
    weather: [
      { name: 'BPBD Jakarta',            number: '021-3905939', role: 'City disaster management agency' },
      { name: 'BMKG',                    number: '021-4246321', role: 'Weather & meteorology updates' },
      { name: 'Emergency (Ambulance)',   number: '119',         role: 'Medical emergency' },
    ],
    flood: [
      { name: 'BPBD Jakarta',            number: '021-3905939', role: 'Flood evacuation coordination' },
      { name: 'BNPB National',           number: '117',         role: 'National disaster agency' },
      { name: 'Basarnas (SAR)',          number: '115',         role: 'Search & rescue operations' },
      { name: 'Emergency (Ambulance)',   number: '119',         role: 'Medical emergency' },
      { name: 'Damkar (Fire & Rescue)', number: '113',         role: 'Water rescue & pumping' },
    ],
    waterway: [
      { name: 'BPBD Jakarta',            number: '021-3905939', role: 'Waterway & flood coordination' },
      { name: 'BNPB National',           number: '117',         role: 'National disaster agency' },
      { name: 'Basarnas (SAR)',          number: '115',         role: 'Search & rescue' },
      { name: 'Damkar (Fire & Rescue)', number: '113',         role: 'Water rescue' },
    ],
    earthquake: [
      { name: 'BNPB National',           number: '117',         role: 'National disaster agency' },
      { name: 'Basarnas (SAR)',          number: '115',         role: 'Search & rescue from rubble' },
      { name: 'Emergency (Ambulance)',   number: '119',         role: 'Medical emergency' },
      { name: 'Polisi (Emergency)',      number: '110',         role: 'Police emergency & coordination' },
      { name: 'BMKG',                    number: '021-4246321', role: 'Aftershock & tsunami updates' },
    ],
    crowd: [
      { name: 'Polisi (Emergency)',      number: '110',         role: 'Crowd control & emergency response' },
      { name: 'Emergency (Ambulance)',   number: '119',         role: 'Medical emergency' },
      { name: 'Basarnas (SAR)',          number: '115',         role: 'Search & rescue' },
    ],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a circle (center + radius_m) to a TomTom-compatible bounding box.
 * TomTom avoidAreas expects: { southWestCorner, northEastCorner } in lat/lon.
 */
function circleToBbox(lat, lon, radiusM) {
  const latDelta = radiusM / 111320;
  const lonDelta = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    southWestCorner: { latitude: lat - latDelta, longitude: lon - lonDelta },
    northEastCorner: { latitude: lat + latDelta, longitude: lon + lonDelta },
  };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── Main component ───────────────────────────────────────────────────────────

export default function EvacuationPanel({
  userLocation,          // { lat, lon } | null
  predictions,           // active threat predictions array
  safePois,              // POIs fetched from /safe-zones (already tier-sorted)
  activeThreatZones,     // [{ lat, lon, radius_m, name }] for avoid-area calc
  tomtomApiKey,          // VITE_TOMTOM_API_KEY from env
  onRouteReady,          // (routeGeoJSON) => void — sends route to MapView
  onClose,               // () => void
  onRequestLocation,     // () => void — triggers the location prompt in App
  activePrediction = null, // the primary active prediction (for resolution data)
  allZones = [], // live zone_status data — current scores, NOT the stale alert-time snapshot
}) {
  const [phase, setPhase] = useState('idle'); // idle | routing | done | error
  const [routeInfo, setRouteInfo] = useState(null);  // { destination, distanceKm, durationMin, steps }
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedGuide, setExpandedGuide] = useState(null);
  const [selectedCrowdPoi, setSelectedCrowdPoi] = useState(null);
  const [globalPois, setGlobalPois] = useState([]);
  const [expandedHotlines, setExpandedHotlines] = useState(false);

  // Derive the primary disruption type from the zone actually being viewed —
  // NOT predictions[0], which is an unrelated list that doesn't track what
  // the user selected (this previously caused guidance to always show
  // whichever disruption type happened to sort first in that list).
  // Compute all alerts for this zone first, sorted by severity descending.
  // This lets primaryDisruption be determined by the HIGHEST severity threat
  // rather than whichever alert happened to be tapped — so safe zone logic
  // always reflects the most critical condition in the zone.
  const currentZoneId = activePrediction?.zone?.zone_id ?? activePrediction?.zone?.id ?? null;
  const zoneAlerts = currentZoneId != null
    ? (predictions ?? []).filter(p => String(p?.zone?.zone_id ?? p?.zone?.id) === String(currentZoneId))
    : (activePrediction ? [activePrediction] : []);

  const SEVERITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const sortedZoneAlerts = [...zoneAlerts].sort(
    (a, b) => (SEVERITY_RANK[b.severity?.toUpperCase()] ?? 0) - (SEVERITY_RANK[a.severity?.toUpperCase()] ?? 0)
  );

  // Primary disruption = highest severity active threat in this zone.
  // Falls back to activePrediction (tapped alert) if zone has no other alerts.
  const highestAlert = sortedZoneAlerts[0] ?? activePrediction;
  const primaryDisruption = (highestAlert?.disruption_type ?? 'traffic').toLowerCase();

  // For crowd disruption: fetch ALL POIs to let user pick any quieter spot
  // (not just hospitals — any POI with lower crowd score than the alert score)
  useEffect(() => {
    if (primaryDisruption !== 'crowd') return;
    fetch(`${getApiUrl()}/pois`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setGlobalPois(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [primaryDisruption]);

  const guide = CONTENT.guides[primaryDisruption] ?? CONTENT.guides.traffic;
  const hotlines = [
    ...COMMON_EMERGENCY_HOTLINES,
    ...(CONTENT.hotlines[primaryDisruption] ?? CONTENT.hotlines.traffic),
  ];

  const seenTypes = new Set();
  const zoneGuidances = [];
  for (const alert of sortedZoneAlerts) {
    const dtype = alert.disruption_type?.toLowerCase();
    if (!dtype || seenTypes.has(dtype)) continue;
    seenTypes.add(dtype);
    zoneGuidances.push({
      disruption_type: dtype,
      guide: CONTENT.guides[dtype] ?? CONTENT.guides.traffic,
      hotlines: [...COMMON_EMERGENCY_HOTLINES, ...(CONTENT.hotlines[dtype] ?? CONTENT.hotlines.traffic)],
    });
  }
  // Fallback so the panel never renders with zero guidance sections (e.g. if
  // no predictions prop was passed for some reason).
  if (zoneGuidances.length === 0) {
    zoneGuidances.push({ disruption_type: primaryDisruption, guide, hotlines });
  }

  // Shown in the panel header so it's always visible WHICH zone this guidance
  // is actually for — previously there was no way to confirm this from the
  // UI itself, which made "wrong disruption type showing" reports hard to
  // diagnose (is it the wrong zone, or the right zone with a real bug?).
  const zoneNameLabel = activePrediction?.zone?.name
    ? `${activePrediction.zone.name}${zoneGuidances.length > 1 ? ` — ${zoneGuidances.length} active disruptions` : ''}`
    : null;

  // ── Route calculation ──────────────────────────────────────────────────────
  const calculateRoute = useCallback(async (forcedDestination = null) => {
    if (!userLocation) {
      onRequestLocation?.();
      return;
    }
    if (!safePois || safePois.length === 0) {
      setErrorMsg('No safe locations found nearby. Contact emergency services directly.');
      setPhase('error');
      return;
    }

    setPhase('routing');
    setErrorMsg('');

    try {
      // Normalise lat/lon field names from either pois (/api/pois → lat/lon)
      // or safe-zones (/api/safe-zones → latitude/longitude)
      const dest = forcedDestination
        ? (forcedDestination.latitude
            ? forcedDestination
            : { ...forcedDestination, latitude: forcedDestination.lat, longitude: forcedDestination.lon })
        : null;

      // 1. Find the nearest safe POI that is NOT inside a threat zone
      const threatCircles = (activeThreatZones ?? []).map(z => ({
        lat: z.lat, lon: z.lon, radiusKm: (z.radius_m ?? 1000) / 1000,
      }));

      const isInsideThreat = (poi) =>
        threatCircles.some(
          c => haversineKm(poi.latitude, poi.longitude, c.lat, c.lon) <= c.radiusKm
        );

      const candidates = safePois
        .filter(p => !isInsideThreat(p))
        .map(p => ({
          ...p,
          distKm: haversineKm(userLocation.lat, userLocation.lon, p.latitude, p.longitude),
        }))
        .sort((a, b) => a.distKm - b.distKm);

      if (candidates.length === 0) {
        setErrorMsg('All nearby safe locations are inside active threat zones. Contact emergency services directly.');
        setPhase('error');
        return;
      }

      const destination = dest ?? candidates[0];

      // 2. Build avoid areas from threat zones (max 10 for TomTom free tier)
      const avoidAreas = (activeThreatZones ?? [])
        .slice(0, 10)
        .map(z => circleToBbox(z.lat, z.lon, z.radius_m ?? 1000));

      // 3. Call TomTom Routing API
      // avoidAreas is only supported via POST body — not as a GET query param.
      const origin = `${userLocation.lat},${userLocation.lon}`;
      const coordStr = `${destination.latitude},${destination.longitude}`;
      const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin}:${dest}/json` +
        `?key=${tomtomApiKey}` +
        `&travelMode=pedestrian` +
        `&instructionsType=text` +
        `&language=en-GB`;

      const body = avoidAreas.length
        ? JSON.stringify({ avoidAreas: { rectangles: avoidAreas } })
        : null;

      const res = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      if (!res.ok) throw new Error(`TomTom API error: ${res.status}`);
      const data = await res.json();

      const route   = data.routes?.[0];
      if (!route) throw new Error('No route returned by TomTom.');
      // Debug: log route structure to confirm geometry path
      console.log('[Route] legs count:', route.legs?.length);
      console.log('[Route] first leg points count:', route.legs?.[0]?.points?.length);
      console.log('[Route] summary:', route.summary);

      const summary = route.summary;
      const steps   = route.guidance?.instructions?.map(i => i.message).filter(Boolean) ?? [];
      const geoJSON = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: route.legs
            .flatMap(leg => leg.points.map(p => [p.longitude, p.latitude])),
        },
      };

      setRouteInfo({
        destination,
        distanceKm: (summary.lengthInMeters / 1000).toFixed(1),
        durationMin: Math.ceil(summary.travelTimeInSeconds / 60),
        steps,
        avoidedZones: activeThreatZones?.map(z => z.name).filter(Boolean) ?? [],
      });
      setPhase('done');
      console.log('[Route] GeoJSON coordinates count:', geoJSON.geometry?.coordinates?.length);
      onRouteReady?.(geoJSON, destination);

    } catch (err) {
      console.error('[Evacuation] Route error:', err);
      setErrorMsg(err.message ?? 'Could not calculate route. Please try again.');
      setPhase('error');
    }
  }, [userLocation, safePois, activeThreatZones, tomtomApiKey, onRouteReady, onRequestLocation]);

  // ── Location prompt (no location yet) ─────────────────────────────────────
  if (!userLocation) {
    return (
      <div className="flex flex-col h-full">
        <PanelHeader onClose={onClose} title="Evacuation Guidance" subtitle={zoneNameLabel} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <MapPin className="w-8 h-8 text-amber-400" />
          </div>
          <div>
            <p className="font-bold text-slate-100 text-base mb-1">Your location is needed</p>
            <p className="text-sm text-slate-400 leading-relaxed">
              To calculate a safe evacuation route away from active threats,
              we need to know where you are right now.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Your location is only used for routing and is never stored or shared.
            </p>
          </div>
          <button
            onClick={onRequestLocation}
            className="mt-2 w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            Enable My Location
          </button>
        </div>
        {zoneGuidances.length > 1 && (
          <p className="px-4 text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
            This zone has {zoneGuidances.length} active disruption types
          </p>
        )}
        {zoneGuidances.map((zg, i) => (
          <GuidanceAccordion key={zg.disruption_type} guide={zg.guide} hotlines={zg.hotlines} defaultGuideOpen={i === 0} />
        ))}
      </div>
    );
  }

  // ── Main panel ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PanelHeader onClose={onClose} title="Evacuation Guidance" subtitle={zoneNameLabel} />

      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 p-4">

        {/* Medium severity heads-up — sticky so it stays visible when scrolling to route */}
        {(() => {
          const sev = (
            highestAlert?.severity ??
            activePrediction?.severity ??
            activePrediction?.risk_level ?? ''
          ).toUpperCase();
          return sev === 'MEDIUM';
        })() && (
          <div className="sticky top-0 z-10 pb-1 bg-white dark:bg-brand-elevated">
            <MediumSeverityBanner disruption={primaryDisruption} />
          </div>
        )}

        {/* Resolution prediction */}
        {activePrediction?.estimated_resolution_at && (
          <ResolutionBadgeExpanded
            estimated_resolution_at={activePrediction.estimated_resolution_at}
            resolution_confidence={activePrediction.resolution_confidence}
            disruption_type={activePrediction.disruption_type}
          />
        )}

        {/* ML resolution-time estimate — sits next to the rule-based one above */}
        {activePrediction?.id && (
          <MlResolutionBadgeExpanded alertId={activePrediction.id} />
        )}


          {/* Multiple threats notice */}
        {sortedZoneAlerts.length > 1 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              ⚠️ This zone has <strong>{sortedZoneAlerts.length} active threats</strong>:{' '}
              {sortedZoneAlerts.map(a => a.disruption_type).join(', ')}.{' '}
              Safe zone guidance below applies to the <strong>{primaryDisruption}</strong> threat.
            </p>
          </div>
        )}

        {/* Route section */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <Navigation className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                {primaryDisruption === 'crowd'
                  ? 'Find a Less Crowded Area'
                  : primaryDisruption === 'traffic'
                  ? 'Alternate Route'
                  : 'Nearest Safe Location'}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {primaryDisruption === 'crowd'
                ? 'Showing nearby places currently less crowded than this area.'
                : primaryDisruption === 'traffic'
                ? 'Shows an alternate route away from congestion.'
                : 'Route avoids all active threat zones. Walking directions.'}
            </p>
          </div>

          <div className="p-4">
            {phase === 'idle' && (
              primaryDisruption === 'crowd' && safePois && safePois.length > 0 ? (
                /* Crowd: show POI list — user picks destination before routing */
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-600 dark:text-slate-500 font-semibold uppercase tracking-wide mb-2">
                    Choose a destination
                  </p>
                  {(() => {
                    // Use the LIVE zone_status.crowd_score, not the alert's
                    // probability_percentage — that field is a snapshot taken
                    // when the alert first fired and does not update afterward.
                    // A zone can still show 78% from 2 hours ago even if the
                    // crowd has since dispersed to 30%.
                    const zoneId = activePrediction?.zone?.zone_id ?? activePrediction?.zone?.id;
                    const liveZone = allZones.find(z => String(z.zone_id) === String(zoneId));
                    const threshold = liveZone?.crowd_score ?? activePrediction?.probability_percentage ?? 55;
                    const zoneLat = activePrediction?.zone?.latitude;
                    const zoneLon = activePrediction?.zone?.longitude;
                    const zoneRadius = ((activePrediction?.zone?.radius_m ?? 1000) + 1000) / 1000;
                    const poiSource = globalPois.length > 0
                      ? globalPois.filter(p => {
                          const score = parseFloat(p.crowd_score || 0);
                          if (score >= threshold) return false;
                          if (zoneLat && zoneLon) {
                            const d = haversineKm(zoneLat, zoneLon, p.lat ?? p.latitude, p.lon ?? p.longitude);
                            return d <= zoneRadius;
                          }
                          return true;
                        }).sort((a, b) => (a.crowd_score || 0) - (b.crowd_score || 0))
                      : safePois;
                    return poiSource.slice(0, 8).map((poi, idx) => {
                    // normalise lat/lon field names (pois endpoint uses lat/lon, safe-zones uses latitude/longitude)
                    const lat = poi.latitude ?? poi.lat;
                    const lon = poi.longitude ?? poi.lon;
                    const distKm = userLocation
                      ? haversineKm(userLocation.lat, userLocation.lon, lat, lon).toFixed(1)
                      : null;
                    const crowdPct = poi.crowd_score ? Math.round(poi.crowd_score) : null;
                    const crowdColor = !crowdPct ? 'text-slate-500' :
                      crowdPct >= 65 ? 'text-red-500' :
                      crowdPct >= 35 ? 'text-amber-500' : 'text-emerald-500';
                    return (
                      <div key={idx}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">{poi.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-slate-500 capitalize">{poi.category}</span>
                            {distKm && <span className="text-[10px] text-slate-500">· {distKm} km</span>}
                            {crowdPct != null && (
                              <span className={`text-[10px] font-semibold ${crowdColor}`}>
                                · 👥 {crowdPct}%
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedCrowdPoi(poi);
                            calculateRoute(poi);
                          }}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all flex items-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          Route
                        </button>
                      </div>
                    );
                  });
                  })()}
                </div>
              ) : (
                <button
                  onClick={() => calculateRoute()}
                  className={`w-full py-3 rounded-xl active:scale-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    primaryDisruption === 'traffic'
                      ? 'bg-slate-600 hover:bg-slate-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  <Navigation className="w-4 h-4" />
                  {primaryDisruption === 'traffic' ? 'Show Alternate Route' : 'Get Evacuation Route'}
                </button>
              )
            )}

            {phase === 'routing' && (
              <div className="flex items-center justify-center gap-3 py-4 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-sm">Calculating safe route…</span>
              </div>
            )}

            {phase === 'error' && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 text-red-400">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs leading-relaxed">{errorMsg}</p>
                </div>
                <button
                  onClick={() => setPhase('idle')}
                  className="w-full py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}

            {phase === 'done' && routeInfo && (
              <div className="space-y-3">
                {/* Destination */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-emerald-400 text-sm truncate">{routeInfo.destination.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{routeInfo.destination.category?.replace('_', ' ')}</p>
                  </div>
                  <div className="ml-auto text-right shrink-0">
                    <p className="font-bold text-white text-sm">{routeInfo.distanceKm} km</p>
                    <p className="text-xs text-slate-400">~{routeInfo.durationMin} min walk</p>
                  </div>
                </div>

                {/* Warning: destination inside threat zone (mass emergency fallback) */}
                {routeInfo.destination.inside_threat_zone && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>All nearby safe locations are within active threat areas. This is the least affected option — proceed with caution and follow emergency services guidance.</span>
                  </div>
                )}

                {/* Avoided zones notice */}
                {routeInfo.avoidedZones.length > 0 && (
                  <div className="flex items-start gap-2 text-amber-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>Route avoids: {routeInfo.avoidedZones.join(', ')}</span>
                  </div>
                )}

                {/* Turn-by-turn steps */}
                {routeInfo.steps.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Turn-by-turn</p>
                    {routeInfo.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="text-[10px] font-bold text-indigo-400 w-4 shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-xs text-slate-300 leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recalculate */}
                <button
                  onClick={() => calculateRoute()}
                  className="w-full py-2 rounded-xl border border-slate-600 text-slate-400 text-xs font-semibold hover:bg-slate-700 transition-colors"
                >
                  Recalculate Route
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step-by-step guide(s) — one per active disruption type at this zone */}
        {zoneGuidances.length > 1 && (
          <p className="px-4 text-[11px] font-semibold text-amber-400 uppercase tracking-wide">
            This zone has {zoneGuidances.length} active disruption types
          </p>
        )}
        {zoneGuidances.map((zg, i) => (
          <GuidanceAccordion key={zg.disruption_type} guide={zg.guide} hotlines={zg.hotlines} defaultGuideOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

// ── Medium severity banner ───────────────────────────────────────────────────

const MEDIUM_ADVICE = {
  traffic: {
    icon: '🚗',
    headline: 'Traffic is heavy but manageable',
    body: 'You do not need to evacuate. Consider delaying your trip, using public transport (MRT / TransJakarta), or waiting 30–60 minutes for congestion to ease. Monitor conditions and leave early if it worsens.',
  },
  crowd: {
    icon: '👥',
    headline: 'Area is getting crowded',
    body: 'No need to leave urgently. Avoid the densest spots, stay aware of your surroundings, and move to a quieter nearby area if you feel uncomfortable. Check back — crowd levels can change quickly.',
  },
  weather: {
    icon: '⛈️',
    headline: 'Weather risk is building',
    body: 'Conditions are concerning but not yet severe. Move indoors if possible, avoid flooded roads and underpasses, and keep an eye on BMKG updates. Be ready to move to higher ground if rainfall intensifies.',
  },
  waterway: {
    icon: '🌊',
    headline: 'River levels are rising',
    body: 'No immediate evacuation needed yet. Stay away from riverbanks and low-lying areas. If you are near the river, start preparing an emergency bag. Act immediately if the level reaches Siaga 2.',
  },
  earthquake: {
    icon: '🌍',
    headline: 'Tremor detected in the area',
    body: 'Stay calm. Move away from windows and heavy objects. If inside, take cover under a sturdy table. Check BMKG for aftershock advisories before resuming normal activity.',
  },
};

function MediumSeverityBanner({ disruption }) {
  const [expanded, setExpanded] = useState(false);
  const advice = MEDIUM_ADVICE[disruption] ?? MEDIUM_ADVICE.weather;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/8 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        <span className="text-lg shrink-0 mt-0.5">{advice.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-0.5">
            Medium alert — monitor & prepare
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {advice.headline}
          </p>
        </div>
        <span className="text-amber-500 text-xs mt-1 shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {advice.body}
          </p>
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-500 font-medium">
            Evacuation routes and safe areas below are available as a precaution — you do not need to use them unless conditions worsen.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PanelHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-lg">🚨</span>
        <div className="min-w-0">
          <span className="font-bold text-slate-100 text-sm block">{title}</span>
          {subtitle && (
            <span className="text-[11px] text-slate-600 dark:text-slate-400 truncate block">{subtitle}</span>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:text-slate-200 transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function GuidanceAccordion({ guide, hotlines, defaultGuideOpen = false }) {
  const [guideOpen, setGuideOpen] = useState(defaultGuideOpen);
  const [hotlinesOpen, setHotlinesOpen] = useState(false);

  return (
    <div className="space-y-3 p-4 pt-0">
      {/* Step-by-step guide */}
      <div className="rounded-xl border border-slate-700 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setGuideOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">{guide.icon}</span>
            <span className="font-bold text-sm text-slate-100">{guide.title}</span>
          </div>
          {guideOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {guideOpen && (
          <div className="px-4 pb-4 space-y-2.5 border-t border-slate-700 pt-3">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-[10px] font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Emergency hotlines */}
      <div className="rounded-xl border border-slate-200 bg-white/90 dark:border-slate-700 dark:bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setHotlinesOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm text-slate-100">Emergency Contacts</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              {hotlines.length}
            </span>
          </div>
          {hotlinesOpen
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {hotlinesOpen && (
          <div className="border-t border-slate-700 divide-y divide-slate-700/60">
            {hotlines.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">{h.name}</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">{h.role}</p>
                </div>
                <a
                  href={`tel:${h.number.replace(/[^0-9+]/g, '')}`}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition-all"
                >
                  <Phone className="w-3 h-3" />
                  {h.number}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
