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

function severityStyle(severity, isLight) {
  const map = {
    HIGH: {
      text: isLight ? 'text-red-600' : 'text-red-400',
      bar: 'bg-red-400',
      border: 'border-red-500/20',
      bg: 'bg-red-500/5',
    },
    MEDIUM: {
      text: isLight ? 'text-amber-600' : 'text-amber-400',
      bar: 'bg-amber-400',
      border: 'border-amber-500/20',
      bg: 'bg-amber-500/5',
    },
    LOW: {
      text: isLight ? 'text-slate-500' : 'text-slate-400',
      bar: 'bg-slate-500',
      border: isLight ? 'border-slate-300' : 'border-slate-700',
      bg: isLight ? 'bg-slate-100/80' : 'bg-slate-900/40',
    },
    NONE: {
      text: isLight ? 'text-slate-600' : 'text-slate-400',
      bar: 'bg-slate-600',
      border: isLight ? 'border-slate-300' : 'border-slate-800',
      bg: isLight ? 'bg-slate-100/80' : 'bg-slate-900/40',
    },
  };
  return map[severity] ?? map.NONE;
}

const MIN_PROBABILITY_TO_SHOW = 0.15;

export function MlRiskBadgeCompact({ zoneId, theme = 'light' }) {
  const isLight = theme === 'light';
  const { prediction, loading, unavailable } = useMlPrediction(zoneId);

  if (loading || unavailable || !prediction) return null;
  if (prediction.probability_high < MIN_PROBABILITY_TO_SHOW) return null;

  const style = severityStyle(prediction.predicted_severity, isLight);
  const pct = Math.round(prediction.probability_high * 100);

  return (
    <div className={`flex items-center gap-1.5 text-[10px] ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
      <span>🤖</span>
      <span>
        <span className="font-semibold">Worsening risk:</span>{' '}
        <span className={`font-semibold ${style.text}`}>{pct}% chance in the next {prediction.horizon_hours} hours</span>
      </span>
    </div>
  );
}

export function MlRiskBadgeExpanded({ zoneId, theme = 'light' }) {
  const isLight = theme === 'light';
  const muted = isLight ? 'text-slate-600' : 'text-slate-400';
  const trackBg = isLight ? 'bg-slate-200' : 'bg-slate-700';
  const { prediction, loading, unavailable } = useMlPrediction(zoneId);

  if (loading) {
    return <p className={`text-[10px] italic ${muted}`}>Loading risk outlook…</p>;
  }
  if (unavailable || !prediction) return null;

  const style = severityStyle(prediction.predicted_severity, isLight);

  return (
    <div className={`rounded-lg border ${style.border} ${style.bg} p-3 space-y-2`}>
      <div className="flex items-center gap-2">
        <span className="text-base">🤖</span>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>
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
            <span className={`w-14 ${muted}`}>{label}</span>
            <div className={`flex-1 ${trackBg} h-1.5 rounded-full overflow-hidden`}>
              <div
                className={`h-full rounded-full ${severityStyle(label, isLight).bar} transition-all duration-700`}
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </div>
            <span className={`w-9 text-right ${muted}`}>{Math.round(p * 100)}%</span>
          </div>
        ))}
      </div>

      <p className={`text-[10px] leading-relaxed ${muted}`}>
        Based on current conditions and recent trends — this is a forward-looking estimate, not a confirmed alert.
      </p>
    </div>
  );
}
