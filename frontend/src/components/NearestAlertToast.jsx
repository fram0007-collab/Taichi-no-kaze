import React, { useEffect, useState } from 'react';

const SESSION_KEY = 'disruptionNearestToastsPlayed';
const ADVANCE_MS = 4000;

export default function NearestAlertToast({
  items = [],
  theme = 'light',
  offsetBelowChip = false,
  onSelect,
}) {
  const isLight = theme === 'light';
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(() => {
    try {
      return window.sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (finished || items.length === 0) return;
    if (index >= items.length) {
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* ignore */
      }
      setFinished(true);
      return undefined;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, items.length, finished]);

  if (finished || items.length === 0 || index >= items.length) return null;

  const item = items[index];

  return (
    <div
      className={`absolute left-3 right-3 z-[1250] pointer-events-auto ${
        offsetBelowChip ? 'top-16' : 'top-3'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect?.(item.prediction)}
        className={`w-full max-w-xl mx-auto flex items-start text-left rounded-2xl px-3.5 py-2.5 border shadow-lg backdrop-blur-md ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900'
            : 'bg-slate-900/95 border-slate-700 text-slate-100'
        }`}
      >
        <span className="min-w-0 text-sm font-medium leading-snug">
          {item.message}
        </span>
      </button>
    </div>
  );
}
