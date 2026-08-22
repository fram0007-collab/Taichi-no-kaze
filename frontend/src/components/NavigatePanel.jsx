import React, { useEffect, useState } from 'react';
import { Navigation, Search, Locate, Loader2, MapPin } from 'lucide-react';
import { circleToBbox, fetchTomtomRoute, searchTomtomPlaces } from '../utils/tomtomRoute';

const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY || '';

export default function NavigatePanel({
  userLocation,
  onRequestLocation,
  threatZones = [],
  theme = 'light',
  onRoutesReady,
  onClose,
}) {
  const isLight = theme === 'light';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    if (!TOMTOM_KEY) {
      setError('TomTom API key is missing.');
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const hits = await searchTomtomPlaces({
          apiKey: TOMTOM_KEY,
          query: q,
          lat: userLocation?.lat,
          lon: userLocation?.lon,
        });
        setResults(hits);
      } catch (err) {
        setError(err.message || 'Search failed.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, userLocation?.lat, userLocation?.lon]);

  const pickPlace = async (place) => {
    if (!userLocation) {
      onRequestLocation?.();
      setError('Turn on location to get a route.');
      return;
    }
    setRouting(true);
    setError('');
    const origin = { lat: userLocation.lat, lon: userLocation.lon };
    const dest = { lat: place.lat, lon: place.lon };
    const avoidRects = (threatZones ?? [])
      .filter((z) => Number.isFinite(z.lat) && Number.isFinite(z.lon))
      .slice(0, 10)
      .map((z) => circleToBbox(z.lat, z.lon, z.radius_m ?? 1000));

    let safer = null;
    let faster = null;
    let saferError = '';

    try {
      faster = await fetchTomtomRoute({
        apiKey: TOMTOM_KEY,
        origin,
        dest,
        travelMode: 'car',
      });
    } catch (err) {
      setError(err.message || 'Could not calculate a route.');
      setRouting(false);
      return;
    }

    if (avoidRects.length > 0) {
      try {
        safer = await fetchTomtomRoute({
          apiKey: TOMTOM_KEY,
          origin,
          dest,
          avoidRects,
          travelMode: 'car',
        });
      } catch (err) {
        saferError = err.message || 'No route that avoids disruptions.';
      }
    }

    setRouting(false);
    onRoutesReady?.({
      destination: place,
      safer,
      faster,
      saferError,
    });
  };

  return (
    <div className={`h-full overflow-y-auto p-5 space-y-4 ${isLight ? 'bg-slate-50 text-slate-900' : 'bg-brand-dark text-slate-100'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-indigo-400" />
          <h2 className="text-base font-bold">Navigate</h2>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-400">
            Close
          </button>
        )}
      </div>

      {!userLocation && (
        <div className={`rounded-xl border p-3 space-y-2 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/50'}`}>
          <p className="text-xs">Turn on location so we can route from where you are.</p>
          <button
            type="button"
            onClick={onRequestLocation}
            className="w-full min-h-[44px] rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2"
          >
            <Locate className="w-4 h-4" />
            Use my location
          </button>
        </div>
      )}

      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place (hospital, mall, station…)"
          className={`w-full min-h-[44px] pl-9 pr-3 rounded-lg border text-sm ${
            isLight
              ? 'border-slate-300 bg-white text-slate-900'
              : 'border-slate-700 bg-slate-950 text-slate-100'
          }`}
        />
      </div>

      {searching && (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
        </p>
      )}
      {routing && (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating routes…
        </p>
      )}
      {error && <p className="text-xs text-amber-500">{error}</p>}

      <ul className="space-y-2">
        {results.map((place) => (
          <li key={place.id}>
            <button
              type="button"
              disabled={routing}
              onClick={() => pickPlace(place)}
              className={`w-full text-left rounded-xl border p-3 ${
                isLight ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800/60'
              }`}
            >
              <p className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                {place.name}
              </p>
              {place.address && (
                <p className={`mt-1 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{place.address}</p>
              )}
            </button>
          </li>
        ))}
      </ul>

      <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
        We will show a safer route that tries to skip disruption zones, and a faster route that may go through them.
      </p>
    </div>
  );
}

export function NavigateRouteBar({
  destination,
  safer,
  faster,
  selected,
  onSelect,
  onClear,
  theme = 'light',
}) {
  const isLight = theme === 'light';
  if (!safer && !faster) return null;
  const destName = destination?.name || 'Destination';
  const btn = (key, label, route) => {
    if (!route) return null;
    const active = selected === key;
    return (
      <button
        type="button"
        onClick={() => onSelect(key)}
        className={`flex-1 min-h-[44px] rounded-lg px-2 py-2 text-left ${
          active
            ? 'bg-indigo-600 text-white'
            : isLight
              ? 'bg-slate-100 text-slate-800'
              : 'bg-slate-800 text-slate-200'
        }`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wide">{label}</div>
        <div className="text-xs font-semibold">{route.durationMin} min · {route.distanceKm} km</div>
      </button>
    );
  };
  return (
    <div className={`rounded-xl border p-3 shadow-lg ${isLight ? 'bg-white/95 border-slate-200' : 'bg-slate-900/95 border-slate-700'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold truncate">{destName}</p>
        {onClear && (
          <button type="button" onClick={onClear} className="text-[10px] font-bold text-slate-400">Clear</button>
        )}
      </div>
      <div className="flex gap-2">
        {btn('safer', 'Safer', safer)}
        {btn('faster', 'Faster', faster)}
      </div>
    </div>
  );
}
