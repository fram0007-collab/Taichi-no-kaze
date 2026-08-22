import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const top = offsetBelowChip
    ? 'calc(4rem + 4.25rem)'
    : 'calc(4rem + 0.75rem)';

  return createPortal(
    <div
      className="fixed left-3 right-3 z-[2000] pointer-events-none sm:left-6 sm:right-auto sm:w-[min(28rem,calc(100vw-24rem))]"
      style={{ top }}
    >
      <button
        type="button"
        onClick={() => onSelect?.(item.prediction)}
        className={`pointer-events-auto w-full flex items-start text-left rounded-2xl px-3.5 py-2.5 border shadow-lg backdrop-blur-md ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-900'
            : 'bg-slate-900/95 border-slate-700 text-slate-100'
        }`}
      >
        <span className="min-w-0 text-sm font-medium leading-snug">
          {item.message}
        </span>
      </button>
    </div>,
    document.body
  );
}
