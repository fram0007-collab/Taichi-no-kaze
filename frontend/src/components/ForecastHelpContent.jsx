import React from 'react';

const BLOCKS = [
  {
    title: 'How far ahead?',
    body: 'Use 3h, 6h, 12h, or 24h to choose how many hours ahead the graphs look. For example, 12h shows the next 12 hours.',
    tone: 'default',
  },
  {
    title: 'Rain and humidity',
    body: 'Time moves from left to right. The blue line is humidity (%). The bars are rainfall (mm). If they go up, it is getting wetter — roads may flood and trips can take longer.',
    tone: 'default',
  },
  {
    title: 'Traffic speed',
    body: 'This graph shows how fast traffic is likely to move. The dashed line is the usual speed. The red line is the predicted speed. If red is lower, expect slower roads — useful if you ride ojek or deliver. If it climbs toward the dashed line, traffic is getting better.',
    tone: 'default',
  },
  {
    title: 'Note',
    body: 'These graphs are predictions, not guarantees. In an emergency, follow BMKG, BPBD, and local officials.',
    tone: 'note',
  },
];

function blockShellClass(tone, isLight) {
  if (tone === 'note') {
    return isLight
      ? 'rounded-xl border border-indigo-200/80 bg-indigo-50/80 p-4'
      : 'rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4';
  }
  return isLight
    ? 'rounded-xl border border-slate-200/80 bg-slate-50/80 p-4'
    : 'rounded-xl border border-slate-700 bg-slate-800/70 p-4';
}

export default function ForecastHelpContent({ theme = 'light' }) {
  const isLight = theme === 'light';
  const titleClass = isLight ? 'text-slate-900' : 'text-slate-100';
  const bodyClass = isLight ? 'text-slate-600' : 'text-slate-300';
  const introClass = isLight ? 'text-slate-700' : 'text-slate-300';

  return (
    <>
      <p className={introClass}>
        These graphs help explain what may happen in this area over the next few hours.
        They support the warning card, but they are only estimates.
      </p>

      {BLOCKS.map((block) => (
        <div
          key={block.title}
          className={blockShellClass(block.tone, isLight)}
        >
          <p className={`text-sm font-semibold ${titleClass}`}>{block.title}</p>
          <p className={`mt-2 text-sm ${bodyClass}`}>{block.body}</p>
        </div>
      ))}
    </>
  );
}
