import React from 'react';
import { Phone, X } from 'lucide-react';

export function dialPhoneNumber(number) {
  const cleaned = String(number ?? '').replace(/[^0-9+]/g, '');
  if (!cleaned) return;
  window.location.href = `tel:${cleaned}`;
}

export default function EmergencyCallConfirmModal({
  isOpen,
  contactName,
  phoneNumber,
  theme = 'light',
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  return (
    <div
      className={`fixed inset-0 z-[10002] flex items-center justify-center p-4 ${
        isLight ? 'bg-slate-900/50' : 'bg-black/70'
      } backdrop-blur-sm`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-call-confirm-title"
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
                isLight ? 'bg-red-100 text-red-600' : 'bg-red-500/20 text-red-300'
              }`}
            >
              <Phone className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 id="emergency-call-confirm-title" className="text-base font-bold">
                Call emergency?
              </h2>
              <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Call <span className="font-semibold">{contactName}</span> at{' '}
                <span className="font-semibold">{phoneNumber}</span>?
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
            onClick={onConfirm}
            className="w-full min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.98] text-white text-sm font-semibold transition-all"
          >
            Call now
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`w-full min-h-[44px] rounded-xl border text-sm font-semibold transition-colors ${
              isLight
                ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
