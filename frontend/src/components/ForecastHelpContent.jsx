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

export default function ForecastHelpContent() {
  return (
    <>
      <p>
        These graphs help explain what may happen in this area over the next few hours.
        They support the warning card, but they are only estimates.
      </p>

      {BLOCKS.map((block) => (
        <div
          key={block.title}
          className={
            block.tone === 'note'
              ? 'rounded-xl border border-indigo-200/80 bg-indigo-50/80 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20'
              : 'rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/70'
          }
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{block.title}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{block.body}</p>
        </div>
      ))}
    </>
  );
}
