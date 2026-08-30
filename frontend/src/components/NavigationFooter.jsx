import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Zap } from 'lucide-react';
import { buildRouteIndex } from '../utils/routeGeometry.js';
import { findNearbyDisruptionsAlongRoute } from '../utils/nearbyDisruptionAlongRoute.js';
import { formatDistanceM, formatEtaClock } from '../utils/navUi.js';

function zoneCount(route, predictions, distanceAlongM) {
  const coords = route?.geometry?.coordinates ?? [];
  if (coords.length < 2) return 0;
  const index = buildRouteIndex(coords);
  return findNearbyDisruptionsAlongRoute({
    predictions,
    routeIndex: index,
    distanceAlongM: distanceAlongM ?? 0,
  }).length;
}

function variantAvoidsPrediction(route, prediction, distanceAlongM) {
  if (!route || !prediction) return false;
  const coords = route.geometry?.coordinates ?? [];
  if (coords.length < 2) return true;
  const index = buildRouteIndex(coords);
  const hits = findNearbyDisruptionsAlongRoute({
    predictions: [prediction],
    routeIndex: index,
    distanceAlongM: distanceAlongM ?? 0,
  });
  return hits.length === 0;
}

export default function NavigationFooter({
  session,
  predictions = [],
  theme = 'light',
  isMobile = true,
  follow = true,
  onRecenter,
  onSwitchVariant,
  switchingKey = null,
  promptedZoneIds,
}) {
  const isLight = theme === 'light';
  const [expanded, setExpanded] = useState(!isMobile);
  const panel = isLight
    ? 'bg-white/95 border-slate-200 text-slate-900'
    : 'bg-slate-950/95 border-slate-700 text-white';

  useEffect(() => {
    if (!isMobile || !expanded) return undefined;
    const t = setTimeout(() => setExpanded(false), 6000);
    return () => clearTimeout(t);
  }, [expanded, isMobile]);

  const activeKey = session?.activeKey || 'safer';
  const otherKey = activeKey === 'safer' ? 'faster' : 'safer';
  const nearby = session?.nearbyDisruption;
  const otherRoute = session?.routes?.[otherKey]?.route;
  const risk = nearby?.prediction?.risk_level;
  const showAvoid = Boolean(
    nearby
    && (risk === 'High' || risk === 'Critical')
    && otherRoute
    && variantAvoidsPrediction(otherRoute, nearby.prediction, session?.distanceAlongM)
    && !promptedZoneIds?.has(nearby.prediction?.id)
  );

  const rows = useMemo(() => {
    if (!session) return [];
    return ['safer', 'faster'].map((key) => {
      const entry = session.routes?.[key];
      const route = entry?.route;
      if (!route) return null;
      const count = zoneCount(route, predictions, session.distanceAlongM);
      const deltaMin = route.durationMin - (session.remainingDurationMin || route.durationMin);
      return {
        key,
        route,
        stale: entry.stale,
        count,
        deltaMin,
        active: key === activeKey,
      };
    }).filter(Boolean);
  }, [session, predictions, activeKey]);

  return (
    <div className="pointer-events-auto">
      {showAvoid && (
        <div className={`mx-3 mb-2 rounded-xl border px-3 py-2 shadow-lg flex items-center gap-2 ${
          isLight ? 'bg-white border-orange-200 text-slate-900' : 'bg-slate-900 border-orange-500/40 text-white'
        }`}>
          <p className="min-w-0 flex-1 text-xs font-semibold">
            {nearby.prediction?.zone?.name || 'Disruption'} in {formatDistanceM(nearby.aheadM)} — switch to {otherKey === 'safer' ? 'Safer' : 'Faster'}?
          </p>
          <button
            type="button"
            onClick={() => onSwitchVariant?.(otherKey, nearby.prediction?.id)}
            className="shrink-0 min-h-[44px] rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"
          >
            Avoid it
          </button>
        </div>
      )}

      <div
        className={`rounded-t-2xl border-t shadow-lg ${panel}`}
        style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          className="mx-auto mt-1 block h-1.5 w-10 rounded-full bg-slate-400/50"
          aria-label={expanded ? 'Hide route options' : 'Show route options'}
          onClick={() => setExpanded((v) => !v)}
        />
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold leading-none tabular-nums">
              {formatEtaClock(session?.etaClock)}
            </p>
            <p className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {Math.max(0, session?.remainingDurationMin || 0)} min · {(session?.remainingDistanceKm ?? 0).toFixed(1)} km
            </p>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wide ${activeKey === 'safer' ? 'text-emerald-500' : 'text-orange-400'}`}>
            {activeKey === 'safer' ? <Shield className="w-4 h-4 inline" /> : <Zap className="w-4 h-4 inline" />}
          </span>
          {!follow && (
            <button
              type="button"
              onClick={onRecenter}
              className="min-h-[44px] rounded-full px-3 text-xs font-bold bg-indigo-600 text-white"
            >
              Recenter
            </button>
          )}
        </div>

        {expanded && (
          <div className="px-3 pb-2 space-y-2 max-h-[30vh] overflow-y-auto">
            {rows.map((row) => (
              <button
                key={row.key}
                type="button"
                disabled={row.active || switchingKey === row.key}
                onClick={() => onSwitchVariant?.(row.key)}
                className={`w-full min-h-[44px] rounded-xl border px-3 py-2 text-left ${
                  row.active
                    ? row.key === 'safer'
                      ? 'border-emerald-500 bg-emerald-500/15'
                      : 'border-orange-500 bg-orange-500/15'
                    : isLight
                      ? 'border-slate-200 bg-white'
                      : 'border-slate-700 bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold capitalize">{row.key}</span>
                  <span className="text-xs font-semibold">
                    {switchingKey === row.key ? 'Updating…' : `${row.route.durationMin} min · ${row.route.distanceKm} km`}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {row.stale ? 'May be outdated · tap to refresh. ' : ''}
                  {row.count === 0 ? 'Avoids disruption zones' : `Passes ${row.count} disruption zone${row.count === 1 ? '' : 's'}`}
                  {row.active ? '' : row.deltaMin !== 0 ? ` · ${row.deltaMin > 0 ? '+' : ''}${row.deltaMin} min vs current ETA` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
