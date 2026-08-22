import React, { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { searchZonesByName } from '../utils/zoneSearch';

const DEBOUNCE_MS = 250;

export default function AreaSearchInput({
  allZones = [],
  value = '',
  onChange,
  onZoneSelected,
  placeholder = 'Search area (e.g. Menteng, Pondok Aren)',
  className = '',
  theme = 'dark',
}) {
  const isLight = theme === 'light';
  const listId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setMatches([]);
      setOpen(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      const results = searchZonesByName(q, allZones);
      setMatches(results);
      setHighlight(0);
      setOpen(results.length > 0);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, allZones]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (entry) => {
    const name = entry?.zone?.name ?? '';
    onChange?.(name);
    onZoneSelected?.(entry);
    setOpen(false);
    setMatches([]);
  };

  const onKeyDown = (e) => {
    if (!open || matches.length === 0) {
      if (e.key === 'Enter' && matches.length === 1) pick(matches[0]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showEmpty = value.trim().length >= 2 && matches.length === 0 && !open;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => {
            if (matches.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`w-full min-h-[44px] pl-9 pr-3 rounded-lg border text-sm ${
            isLight
              ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
              : 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500'
          }`}
        />
      </div>

      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute z-[1200] left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border shadow-xl ${
            isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-900'
          }`}
        >
          {matches.map((entry, i) => {
            const name = entry?.zone?.name ?? `Zone ${entry?.zone_id}`;
            return (
              <li key={entry.zone_id ?? entry.zone?.zone_id ?? i} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(entry)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-2.5 text-sm ${
                    i === highlight
                      ? isLight
                        ? 'bg-indigo-50 text-indigo-900'
                        : 'bg-indigo-600/30 text-white'
                      : isLight
                        ? 'text-slate-800 hover:bg-slate-50'
                        : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {name}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showEmpty && (
        <p className={`mt-1.5 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          No matching areas — try Menteng, Bekasi, or Pondok Aren.
        </p>
      )}
    </div>
  );
}
