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

import { formatRemainingTimeLabel } from '../utils/remainingTime';

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
    return sameDay ? `${time} Jakarta time` : `Tomorrow ${time} Jakarta time`;
  } catch {
    return formatWIB(isoString);
  }
}

/**
 * Confidence colour — green >75, amber 50-75, red <50.
 */
function confColor(pct) {
  if (pct >= 75) return { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-400' };
  if (pct >= 50) return { text: 'text-amber-600 dark:text-amber-400',   bar: 'bg-amber-400'   };
  return            { text: 'text-red-600 dark:text-red-400',    bar: 'bg-red-400'    };
}

/**
 * Compact variant — one line, used in sidebar card and map popup.
 */
export function ResolutionBadgeCompact({ estimated_resolution_at, resolution_confidence, theme = 'light' }) {
  const time = formatRelativeWIB(estimated_resolution_at);
  const conf = Math.round(resolution_confidence || 0);
  if (!time || conf === 0) return null;

  const { text } = confColor(conf);
  const uncertain = conf < 60;
  const remainingLabel = formatRemainingTimeLabel(estimated_resolution_at);
  const isLight = theme === 'light';
  const mutedText = isLight ? 'text-slate-700' : 'text-slate-300';

  return (
    <div className={`flex items-center gap-1.5 text-[10px] font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
      <span>🕐</span>
      <span>
        <span>Est. clear</span>{' '}
        <span className={`font-bold ${text}`}>
          {uncertain ? 'Clear time uncertain' : time}
        </span>
        {remainingLabel && <span className={`ml-1 ${mutedText}`}>· {remainingLabel}</span>}
        {uncertain ? (
          <span className={`ml-1 ${mutedText}`}>(confidence below 60%)</span>
        ) : (
          <span className={`ml-1 ${mutedText}`}>({conf}% confidence)</span>
        )}
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
  const remainingLabel = formatRemainingTimeLabel(estimated_resolution_at);

  const disclaimer = {
    traffic:    'Based on historical rush hour patterns for this zone.',
    weather:    'Based on Open-Meteo hourly precipitation forecast.',
    crowd:      'Based on typical crowd dispersal times for this hour.',
    earthquake: 'Based on Omori-Utsu aftershock decay model.',
    waterway:   'Based on gate level readings and downstream travel time.',
    flood:      'Based on Katulampa gate readings + 8–12h Jakarta travel time.',
  }[disruption_type?.toLowerCase()] ?? 'Based on current data and historical patterns.';

  return (
    <div className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">🕐</span>
        <div>
          <p className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wide">
            Estimated Resolution
          </p>
          <p className={`font-bold text-sm ${text}`}>
            {conf < 60 ? 'Estimate uncertain' : time}
          </p>
          {remainingLabel && (
            <p className="mt-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {remainingLabel}
            </p>
          )}
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-slate-700 dark:text-slate-300">Prediction reliability</span>
          <span className={`font-bold ${text}`}>{conf}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${bar} transition-all duration-700`}
            style={{ width: `${conf}%` }}
          />
        </div>
        {conf < 60 && (
          <p className="text-[9px] text-slate-700 dark:text-slate-300 mt-1 italic">
            Prediction reliability is low — we have hidden the specific time to avoid giving a misleading estimate.
          </p>
        )}
      </div>

      <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed">{disclaimer}</p>
    </div>
  );
}
