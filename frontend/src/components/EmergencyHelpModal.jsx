import { Phone, X } from 'lucide-react';
import { EMERGENCY_HOTLINES } from '../constants/emergencyHotlines';

function telHref(number) {
  return `tel:${number.replace(/[^0-9+]/g, '')}`;
}

export default function EmergencyHelpModal({ isOpen, onClose, theme }) {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md max-h-[85vh] overflow-hidden rounded-2xl border shadow-2xl ${
          isDark
            ? 'border-slate-700 bg-brand-elevated text-slate-100'
            : 'border-slate-200 bg-white text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div>
            <h2 className="text-lg font-bold text-red-500">Need Help?</h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Tap a number to call immediately
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
            aria-label="Close emergency help"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`overflow-y-auto max-h-[70vh] divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
          {EMERGENCY_HOTLINES.map((h) => (
            <div key={h.number} className="flex items-center justify-between px-5 py-3.5 gap-3">
              <div className="min-w-0">
                <p className={`font-semibold text-sm truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {h.name}
                </p>
                <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {h.role}
                </p>
              </div>
              <a
                href={telHref(h.number)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-bold transition-all"
              >
                <Phone className="w-3 h-3" />
                {h.number}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
