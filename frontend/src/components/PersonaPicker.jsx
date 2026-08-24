import React from 'react';
import { Briefcase, Bike, Home } from 'lucide-react';
import { PERSONA_PRESETS } from '../constants/personaPresets';

const ICONS = {
  kantor: Briefcase,
  ojek: Bike,
  rumah: Home,
};

export default function PersonaPicker({
  theme = 'light',
  isMobile = false,
  changeMode = false,
  currentPersona = null,
  onSelect,
  onSkip,
}) {
  const isLight = theme === 'light';
  const personas = [PERSONA_PRESETS.kantor, PERSONA_PRESETS.ojek, PERSONA_PRESETS.rumah];

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${
        isLight ? 'bg-slate-900/40' : 'bg-black/70'
      } backdrop-blur-sm`}
    >
      <div
        className={`w-full max-w-lg rounded-2xl border p-5 sm:p-6 shadow-2xl ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900'
            : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}
      >
        <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          {changeMode ? 'How do you use this app?' : 'I use this app for…'}
        </h2>
        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
          {changeMode
            ? 'Pick a profile to update your default map and alert settings.'
            : 'We will tune your map radius and alerts. You can change this later in Settings.'}
        </p>

        <ul className={`mt-4 space-y-2 ${isMobile ? '' : 'sm:space-y-3'}`}>
          {personas.map((p) => {
            const Icon = ICONS[p.id];
            const active = currentPersona === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect?.(p.id)}
                  className={`w-full min-h-[44px] text-left rounded-xl border px-4 py-3 flex items-start gap-3 transition-all ${
                    active
                      ? isLight
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500/30'
                        : 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-400/30'
                      : isLight
                        ? 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50'
                        : 'border-slate-700 bg-slate-800/50 hover:border-indigo-500/40 hover:bg-slate-800'
                  }`}
                >
                  <span
                    className={`shrink-0 mt-0.5 p-2 rounded-lg ${
                      isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-indigo-500/20 text-indigo-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{p.label}</span>
                    <span className={`block text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {p.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {!changeMode && onSkip && (
          <button
            type="button"
            onClick={() => onSkip()}
            className={`mt-4 w-full min-h-[44px] text-xs font-semibold rounded-xl border transition-colors ${
              isLight
                ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'border-slate-700 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Skip for now (use office defaults)
          </button>
        )}
      </div>
    </div>
  );
}
