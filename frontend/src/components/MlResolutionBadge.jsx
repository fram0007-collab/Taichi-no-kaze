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
    const time = date.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return sameDay ? `${time} Jakarta time` : `Tomorrow ${time} Jakarta time`;
  } catch {
    return null;
  }
}

function confColor(pct, isLight = true) {
  if (pct >= 75) return { text: isLight ? 'text-emerald-600' : 'text-emerald-400', bar: 'bg-emerald-400' };
  if (pct >= 50) return { text: isLight ? 'text-amber-600' : 'text-amber-400', bar: 'bg-amber-400' };
  return { text: isLight ? 'text-red-600' : 'text-red-400', bar: 'bg-red-400' };
}

export function MlResolutionBadgeCompact({ alertId, theme = 'light' }) {
  const { prediction, loading, unavailable } = useMlResolution(alertId);
  if (loading || unavailable || !prediction) return null;

  const time = formatRelativeWIB(prediction.estimated_resolution_at);
  const conf = Math.round(prediction.resolution_confidence || 0);
  if (!time) return null;
  const isLight = theme === 'light';
  const { text } = confColor(conf, isLight);
  const remainingLabel = formatRemainingTimeLabel(prediction.estimated_resolution_at);
  const mutedText = isLight ? 'text-slate-700' : 'text-slate-300';

  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
      <span>🧠</span>
      <span>
        <span className="font-medium">AI prediction:</span>{' '}
        <span className={`font-bold ${text}`}>{time}</span>
        {remainingLabel && <span className={`ml-1 ${mutedText}`}>· {remainingLabel}</span>}
        <span className={`ml-1 ${mutedText}`}>({conf}% confidence)</span>
      </span>
    </div>
  );
}

export function MlResolutionBadgeExpanded({ alertId, theme = 'light' }) {
  const { prediction, loading, unavailable } = useMlResolution(alertId);
  const isLight = theme === 'light';
  const muted = isLight ? 'text-slate-700' : 'text-slate-300';

  if (loading) {
    return <p className={`text-[10px] italic ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Loading ML resolution estimate…</p>;
  }
  if (unavailable || !prediction) return null;

  const time = formatRelativeWIB(prediction.estimated_resolution_at);
  const conf = Math.round(prediction.resolution_confidence || 0);
  const { text, bar } = confColor(conf, isLight);
  const remainingLabel = formatRemainingTimeLabel(prediction.estimated_resolution_at);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-800/60'}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">🧠</span>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
            AI-Powered Prediction
          </p>
          <p className={`font-bold text-sm ${text}`}>{time}</p>
          {remainingLabel && (
            <p className={`mt-1 text-[11px] font-medium ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
              {remainingLabel}
            </p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className={muted}>Prediction reliability</span>
          <span className={`font-bold ${text}`}>{conf}%</span>
        </div>
        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`}>
          <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
        </div>
      </div>

      <p className={`text-[10px] leading-relaxed ${muted}`}>
        Estimated time remaining: {prediction.hours_remaining_low}–{prediction.hours_remaining_high} hours.
        This prediction is based on patterns from past alerts in this area — it learns and improves over time as more real events are recorded.
      </p>
    </div>
  );
}
