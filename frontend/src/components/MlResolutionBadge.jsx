import { useMlResolution } from '../hooks/useMlResolution';
import { formatRemainingTimeLabel } from '../utils/remainingTime';

/**
 * MlResolutionBadge.jsx
 * ───────────────────────────────────────────────────────────────────────────
 * ML-based resolution-time estimate — a learned alternative to the
 * rule-based ResolutionBadge (fixed rush-hour windows, Omori-Utsu constants,
 * etc. in worker/engine.py's compute_resolution()). Trained on real
 * historical alert durations (risk_alerts.resolved_at), so it should get
 * more accurate as more alerts open and close in production, unlike the
 * fixed formulas it sits alongside.
 *
 * Shown as a secondary line UNDER the rule-based estimate, not as a
 * replacement — until you've watched its accuracy for a while, the existing
 * rule-based number is the one to trust by default.
 * ───────────────────────────────────────────────────────────────────────────
 */

function formatRelativeWIB(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const now = new Date();
    const jakartaOffset = 7 * 60;
    const dateWIB = new Date(date.getTime() + (jakartaOffset - date.getTimezoneOffset()) * 60000);
    const nowWIB = new Date(now.getTime() + (jakartaOffset - now.getTimezoneOffset()) * 60000);
    const sameDay = dateWIB.toDateString() === nowWIB.toDateString();
    const time = date.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: true,
    });
    return sameDay ? `${time} WIB` : `Tomorrow ${time} WIB`;
  } catch {
    return null;
  }
}

function confColor(pct) {
  if (pct >= 75) return { text: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-400' };
  if (pct >= 50) return { text: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-400' };
  return { text: 'text-red-600 dark:text-red-400', bar: 'bg-red-400' };
}

export function MlResolutionBadgeCompact({ alertId }) {
  const { prediction, loading, unavailable } = useMlResolution(alertId);
  if (loading || unavailable || !prediction) return null;

  const time = formatRelativeWIB(prediction.estimated_resolution_at);
  const conf = Math.round(prediction.resolution_confidence || 0);
  if (!time) return null;
  const { text } = confColor(conf);
  const remainingLabel = formatRemainingTimeLabel(prediction.estimated_resolution_at);

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-slate-800 dark:text-slate-200">
      <span>🧠</span>
      <span>
        <span className="font-medium text-slate-800 dark:text-slate-200">AI prediction:</span>{' '}
        <span className={`font-bold ${text}`}>{time}</span>
        {remainingLabel && <span className="ml-1 text-slate-700 dark:text-slate-300">· {remainingLabel}</span>}
        <span className="ml-1 text-slate-700 dark:text-slate-300">({conf}% confidence)</span>
      </span>
    </div>
  );
}

export function MlResolutionBadgeExpanded({ alertId }) {
  const { prediction, loading, unavailable } = useMlResolution(alertId);

  if (loading) {
    return <p className="text-[10px] text-slate-600 italic">Loading ML resolution estimate…</p>;
  }
  if (unavailable || !prediction) return null;

  const time = formatRelativeWIB(prediction.estimated_resolution_at);
  const conf = Math.round(prediction.resolution_confidence || 0);
  const { text, bar } = confColor(conf);
  const remainingLabel = formatRemainingTimeLabel(prediction.estimated_resolution_at);

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">🧠</span>
        <div>
          <p className="text-[10px] text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wide">
            AI-Powered Prediction
          </p>
          <p className={`font-bold text-sm ${text}`}>{time}</p>
          {remainingLabel && (
            <p className="mt-1 text-[11px] font-medium text-slate-700 dark:text-slate-200">
              {remainingLabel}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-slate-700 dark:text-slate-300">Prediction reliability</span>
          <span className={`font-bold ${text}`}>{conf}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
        </div>
      </div>

      <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed">
        Estimated time remaining: {prediction.hours_remaining_low}–{prediction.hours_remaining_high} hours.
        This prediction is based on patterns from past alerts in this area — it learns and improves over time as more real events are recorded.
      </p>
    </div>
  );
}
