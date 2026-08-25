import { Waves } from 'lucide-react';
import {
  getTsunamiRisk,
  getTsunamiRiskLabel,
  translatePotensiToEnglish,
} from '../utils/formatEarthquake';

function chipClasses(level, isLight) {
  switch (level) {
    case 'none':
      return isLight
        ? 'border-emerald-300/80 bg-emerald-50 text-emerald-800'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'watch':
      return isLight
        ? 'border-amber-400/80 bg-amber-50 text-amber-900'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'high':
      return isLight
        ? 'border-red-500/40 bg-red-50 text-red-700 animate-pulse'
        : 'border-red-500/30 bg-red-500/10 text-red-400 animate-pulse';
    default:
      return isLight
        ? 'border-dashed border-slate-300 bg-slate-50 text-slate-600'
        : 'border-dashed border-slate-600 bg-slate-900/40 text-slate-400';
  }
}

export default function TsunamiRiskBadge({ potensi, isLight = true, compact = true }) {
  const level = getTsunamiRisk(potensi);
  const label = getTsunamiRiskLabel(level);
  const tooltip = translatePotensiToEnglish(potensi);

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded border font-extrabold uppercase tracking-wide shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9px]'
      } ${chipClasses(level, isLight)}`}
      title={tooltip}
      aria-label={tooltip}
      tabIndex={0}
      role="note"
    >
      <Waves className={compact ? 'h-2.5 w-2.5 shrink-0' : 'h-3 w-3 shrink-0'} aria-hidden />
      <span className="max-w-[4.5rem] truncate sm:max-w-none">{label}</span>
    </span>
  );
}
