import { useMlResolution } from '../hooks/useMlResolution';

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
    return sameDay ? `${time} WIB` : `Tomorrow ${time} WIB`;
  } catch {
    return null;
  }
}

function confColor(pct) {
  if (pct >= 75) return { text: 'text-emerald-400', bar: 'bg-emerald-400' };
  if (pct >= 50) return { text: 'text-amber-400', bar: 'bg-amber-400' };
  return { text: 'text-red-400', bar: 'bg-red-400' };
}

export function MlResolutionBadgeCompact({ alertId }) {
  const { prediction, loading, unavailable } = useMlResolution(alertId);
  if (loading || unavailable || !prediction) return null;

  const time = formatRelativeWIB(prediction.estimated_resolution_at);
  const conf = Math.round(prediction.resolution_confidence || 0);
  if (!time) return null;
  const { text } = confColor(conf);

  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${text}`}>
      <span>🧠</span>
      <span>
        ML estimate: <span className="font-bold">{time}</span>
        <span className="opacity-70 ml-1">({conf}% confidence)</span>
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

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-base">🧠</span>
        <div>
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">
            ML Resolution Estimate
          </p>
          <p className={`font-bold text-sm ${text}`}>{time}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-slate-500">Model confidence</span>
          <span className={`font-bold ${text}`}>{conf}%</span>
        </div>
        <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
        </div>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Range: {prediction.hours_remaining_low}h – {prediction.hours_remaining_high}h remaining.
        Learned from real historical alert durations for this zone/hazard —
        distinct from the rule-based estimate above, which uses fixed
        time-of-day and decay assumptions.
      </p>
    </div>
  );
}
