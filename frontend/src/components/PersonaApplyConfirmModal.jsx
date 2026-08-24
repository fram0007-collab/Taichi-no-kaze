import React from 'react';
import { Map, X } from 'lucide-react';

export default function PersonaApplyConfirmModal({
  isOpen,
  personaLabel,
  theme = 'light',
  onApply,
  onPersonaOnly,
  onClose,
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  return (
    <div
      className={`fixed inset-0 z-[10001] flex items-center justify-center p-4 ${
        isLight ? 'bg-slate-900/50' : 'bg-black/70'
      } backdrop-blur-sm`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-apply-confirm-title"
        className={`w-full max-w-sm rounded-2xl border shadow-2xl ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`shrink-0 p-2 rounded-lg ${
                isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-300'
              }`}
            >
              <Map className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 id="persona-apply-confirm-title" className="text-base font-bold">
                Apply map settings?
              </h2>
              <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Apply recommended map settings for <span className="font-semibold">{personaLabel}</span>?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 p-2 rounded-lg ${
              isLight ? 'hover:bg-slate-100 text-slate-500' : 'hover:bg-slate-800 text-slate-400'
            }`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2">
          <button
            type="button"
            onClick={onApply}
            className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-sm font-semibold transition-all"
          >
            Apply settings
          </button>
          <button
            type="button"
            onClick={onPersonaOnly}
            className={`w-full min-h-[44px] rounded-xl border text-sm font-semibold transition-colors ${
              isLight
                ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Persona only
          </button>
        </div>
      </div>
    </div>
  );
}
