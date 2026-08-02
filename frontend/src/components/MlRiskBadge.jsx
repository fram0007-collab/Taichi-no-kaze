import { useMlPrediction } from '../hooks/useMlPrediction';

/**
 * MlRiskBadge.jsx
 * ───────────────────────────────────────────────────────────────────────────
 * Early-warning indicator from the ML risk-prediction model (see
 * ml-service/ + frontend/api/ml_predict.py). Separate from
 * ResolutionBadge — that one estimates when an ALREADY-OPEN alert will
 * clear; this one estimates the chance a NEW high-severity alert appears
 * in the next few hours, even before the rule-based score crosses a
 * threshold.
 *
 * Renders nothing while loading, if the model isn't trained yet (503), or
 * if predicted probability is low — this is meant to surface signal, not
 * add noise to every card.
 * ───────────────────────────────────────────────────────────────────────────
 */

const SEVERITY_STYLE = {
  HIGH:   { text: 'text-red-600 dark:text-red-400',    bar: 'bg-red-400',    border: 'border-red-500/20',    bg: 'bg-red-500/5' },
  MEDIUM: { text: 'text-amber-600 dark:text-amber-400',  bar: 'bg-amber-400',  border: 'border-amber-500/20',  bg: 'bg-amber-500/5' },
  LOW:    { text: 'text-slate-500 dark:text-slate-400',  bar: 'bg-slate-500',  border: 'border-slate-300 dark:border-slate-700',     bg: 'bg-slate-100/80 dark:bg-slate-900/40' },
  NONE:   { text: 'text-slate-600 dark:text-slate-400',  bar: 'bg-slate-600',  border: 'border-slate-800',     bg: 'bg-slate-100/80 dark:bg-slate-900/40' },
};

// Below this, don't bother showing the badge — not worth the visual noise.
const MIN_PROBABILITY_TO_SHOW = 0.15;

export function MlRiskBadgeCompact({ zoneId }) {
  const { prediction, loading, unavailable } = useMlPrediction(zoneId);

  if (loading || unavailable || !prediction) return null;
  if (prediction.probability_high < MIN_PROBABILITY_TO_SHOW) return null;

  const style = SEVERITY_STYLE[prediction.predicted_severity] ?? SEVERITY_STYLE.NONE;
  const pct = Math.round(prediction.probability_high * 100);

  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${style.text}`}>
      <span>🤖</span>
      <span>
        <span className="font-bold">{pct}% chance of worsening</span>
        <span className="opacity-70 ml-1">in the next {prediction.horizon_hours}h</span>
      </span>
    </div>
  );
}

/**
 * Expanded variant with a probability bar across all four classes — for
 * use in EvacuationPanel or a zone detail view.
 */
export function MlRiskBadgeExpanded({ zoneId }) {
  const { prediction, loading, unavailable } = useMlPrediction(zoneId);

  if (loading) {
    return <p className="text-[10px] text-slate-600 italic">Loading risk outlook…</p>;
  }
  if (unavailable || !prediction) return null;

  const style = SEVERITY_STYLE[prediction.predicted_severity] ?? SEVERITY_STYLE.NONE;

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <span className="text-base">🤖</span>
        <div>
          <p className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wide">
            Risk Outlook — next {prediction.horizon_hours}h
          </p>
          <p className={`font-bold text-sm ${style.text}`}>
            Predicted: {prediction.predicted_severity}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {Object.entries(prediction.probabilities).map(([label, p]) => (
          <div key={label} className="flex items-center gap-2 text-[10px]">
            <span className="w-14 text-slate-600 dark:text-slate-400">{label}</span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${SEVERITY_STYLE[label]?.bar ?? 'bg-slate-500'} transition-all duration-700`}
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </div>
            <span className="w-9 text-right text-slate-500 dark:text-slate-400">{Math.round(p * 100)}%</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
        Based on current conditions and recent trends — this is a forward-looking estimate, not a confirmed alert.
      </p>
    </div>
  );
}
