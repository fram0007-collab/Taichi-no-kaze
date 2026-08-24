import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ADVANCE_MS = 4000;

export default function NearestAlertToast({
  items = [],
  theme = 'light',
  offsetBelowChip = false,
  playKey = 0,
  active = true,
  visible = true,
  onSelect,
  onFinished,
}) {
  const isLight = theme === 'light';
  const [index, setIndex] = useState(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    setIndex(0);
    finishedRef.current = false;
  }, [playKey]);

  useEffect(() => {
    if (!active || !visible || items.length === 0) return undefined;
    if (index >= items.length) {
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinished?.();
      }
      return undefined;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [active, visible, index, items.length, playKey, onFinished]);

  if (!active || !visible || items.length === 0 || index >= items.length) return null;

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
        key={`${playKey}-${item.id}`}
        type="button"
        onClick={() => onSelect?.(item.prediction)}
        className={`nearest-alert-toast-flash pointer-events-auto w-full flex items-start text-left rounded-2xl px-3.5 py-2.5 border shadow-lg backdrop-blur-md ${
          isLight
            ? 'nearest-alert-toast-flash--light text-slate-900'
            : 'nearest-alert-toast-flash--dark text-slate-100'
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
