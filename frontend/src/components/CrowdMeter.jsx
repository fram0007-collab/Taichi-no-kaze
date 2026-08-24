import React from 'react';

function crowdLevel(score) {
  if (score >= 65) return { label: 'High', text: 'text-red-400', bar: 'bg-red-500' };
  if (score >= 35) return { label: 'Moderate', text: 'text-amber-400', bar: 'bg-amber-400' };
  return { label: 'Low', text: 'text-emerald-400', bar: 'bg-emerald-400' };
}

export default function CrowdMeter({
  score,
  theme = 'light',
  compact = false,
  source,
}) {
  if (!Number.isFinite(score)) return null;

  const rounded = Math.round(score);
  const level = crowdLevel(score);
  const isLight = theme === 'light';
  const trackClass = isLight ? 'bg-slate-300' : 'bg-slate-800';
  const mutedClass = isLight ? 'text-slate-500' : 'text-slate-500';
  const barHeight = compact ? 'h-1' : 'h-1.5';

  return (
    <div className={compact ? 'mt-1.5' : ''}>
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-[9px] font-semibold ${mutedClass}`}>
          👥 Crowd{source === 'zone' ? ' (area)' : ''}
        </span>
        <span className={`text-[9px] font-bold ${level.text}`}>
          {level.label}
          <span className={`font-normal ml-1 ${mutedClass}`}>({rounded}/100)</span>
        </span>
      </div>
      <div className={`w-full ${trackClass} rounded-full ${barHeight} overflow-hidden`}>
        <div
          className={`${barHeight} rounded-full transition-all ${level.bar}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}
