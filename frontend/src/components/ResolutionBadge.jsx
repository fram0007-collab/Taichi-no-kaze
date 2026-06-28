/**
 * ResolutionBadge.jsx
 * ───────────────────────────────────────────────────────────────────────────
 * Shared component used in three places:
 *   1. Sidebar alert card       → compact inline variant
 *   2. Map zone popup           → compact inline variant
 *   3. Evacuation panel         → expanded variant with confidence bar
 *
 * i18n note: all strings are in this file for easy extraction later.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Format an ISO timestamp as "HH:MM WIB" in Jakarta local time.
 */
function formatWIB(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }) + ' WIB';
  } catch {
    return null;
  }
}

/**
 * Format as "Today HH:MM" or "Tomorrow HH:MM" for clarity.
 */
function formatRelativeWIB(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const now = new Date();
    const jakartaOffset = 7 * 60; // WIB = UTC+7
    const dateWIB = new Date(date.getTime() + (jakartaOffset - date.getTimezoneOffset()) * 60000);
    const nowWIB  = new Date(now.getTime()  + (jakartaOffset - now.getTimezoneOffset())  * 60000);

    const sameDay = dateWIB.toDateString() === nowWIB.toDateString();
    const time = date.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return sameDay ? `${time} WIB` : `Tomorrow ${time} WIB`;
  } catch {
    return formatWIB(isoString);
  }
}

/**
 * Confidence colour — green >75, amber 50-75, red <50.
 */
function confColor(pct) {
  if (pct >= 75) return { text: 'text-emerald-400', bar: 'bg-emerald-400' };
  if (pct >= 50) return { text: 'text-amber-400',   bar: 'bg-amber-400'   };
  return            { text: 'text-red-400',    bar: 'bg-red-400'    };
}

/**
 * Compact variant — one line, used in sidebar card and map popup.
 */
export function ResolutionBadgeCompact({ estimated_resolution_at, resolution_confidence }) {
  const time = formatRelativeWIB(estimated_resolution_at);
  const conf = Math.round(resolution_confidence || 0);
  if (!time || conf === 0) return null;

  const { text } = confColor(conf);

  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${text}`}>
      <span>🕐</span>
      <span>
        Est. clear <span className="font-bold">{time}</span>
        <span className="opacity-70 ml-1">({conf}% confidence)</span>
      </span>
    </div>
  );
}

/**
 * Expanded variant — used in evacuation panel, shows confidence bar.
 */
export function ResolutionBadgeExpanded({ estimated_resolution_at, resolution_confidence, disruption_type }) {
  const time = formatRelativeWIB(estimated_resolution_at);
  const conf = Math.round(resolution_confidence || 0);
  if (!time || conf === 0) return null;

  const { text, bar } = confColor(conf);

  const disclaimer = {
    traffic:    'Based on historical rush hour patterns for this zone.',
    weather:    'Based on Open-Meteo hourly precipitation forecast.',
    crowd:      'Based on typical crowd dispersal times for this hour.',
    earthquake: 'Based on Omori-Utsu aftershock decay model.',
    waterway:   'Based on gate level readings and downstream travel time.',
    flood:      'Based on Katulampa gate readings + 8–12h Jakarta travel time.',
  }[disruption_type?.toLowerCase()] ?? 'Based on current data and historical patterns.';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">🕐</span>
        <div>
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
            Estimated Resolution
          </p>
          <p className={`font-bold text-sm ${text}`}>{time}</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-slate-500">Prediction confidence</span>
          <span className={`font-bold ${text}`}>{conf}%</span>
        </div>
        <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${bar} transition-all duration-700`}
            style={{ width: `${conf}%` }}
          />
        </div>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">{disclaimer}</p>
    </div>
  );
}
