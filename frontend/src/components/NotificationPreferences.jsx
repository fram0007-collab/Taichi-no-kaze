import React from 'react';
import { Bell, X } from 'lucide-react';

const TYPE_OPTIONS = [
  { id: 'traffic', label: 'Traffic' },
  { id: 'weather', label: 'Weather' },
  { id: 'flood', label: 'Flood / River' },
  { id: 'crowd', label: 'Crowd' },
  { id: 'earthquake', label: 'Earthquake' },
  { id: 'waterway', label: 'Waterway' },
];

export default function NotificationPreferences({
  preferences,
  onToggleEnabled,
  onRadiusChange,
  onToggleType,
  onClose,
  isEmbedded = false,
  permissionStatus = 'default',
  message = '',
  messageTone = 'info',
}) {
  const { enabled, radiusKm, types } = preferences;
  const selectedCount = Object.values(types).filter(Boolean).length;
  const permissionLabel = {
    granted: 'Browser notifications are enabled',
    denied: 'Browser notifications are blocked',
    default: 'Browser permission has not been requested yet',
    unsupported: 'This browser does not support notifications',
  }[permissionStatus] || 'Notification permission status unknown';

  const toneClasses = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
    info: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  }[messageTone] || 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300';

  return (
    <div className={`w-full ${isEmbedded ? '' : 'min-h-[420px]'} bg-slate-950/95 p-5 ${isEmbedded ? 'rounded-3xl border border-slate-800/70' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-2">
            <Bell className="w-5 h-5" />
            <h2 className="text-lg font-bold">Notification Preferences</h2>
          </div>
          <p className="text-sm text-slate-400">Control local push alert settings and disruption type preferences.</p>
        </div>
        {!isEmbedded && onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-900/80 text-slate-300 hover:bg-slate-800"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-5 space-y-5">
        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">Enable Push Alerts</p>
              <p className="text-xs text-slate-500 mt-1">This requests browser permission when you turn alerts on.</p>
            </div>
            <button
              onClick={onToggleEnabled}
              className={`relative inline-flex h-8 w-14 flex-shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-indigo-500' : 'bg-slate-700'}`}
              aria-pressed={enabled}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>

        {message && (
          <div className={`rounded-2xl border px-3 py-2 text-sm ${toneClasses}`}>
            {message}
          </div>
        )}

        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">Alert Radius</p>
              <p className="text-xs text-slate-500 mt-1">Set the distance around you for notification eligibility.</p>
            </div>
            <span className="text-sm font-bold text-indigo-400">{radiusKm} km</span>
          </div>
          <input
            type="range"
            min="1"
            max="20"
            value={radiusKm}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            className="w-full h-1.5 rounded-lg bg-slate-800 accent-indigo-500 cursor-pointer"
          />
        </div>

        <div className="rounded-3xl border border-slate-800/70 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-slate-100">Disruption Types</p>
              <p className="text-xs text-slate-500 mt-1">Choose the alert categories you want to receive.</p>
            </div>
            <span className="text-xs uppercase tracking-wider text-slate-500">{selectedCount} selected</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {TYPE_OPTIONS.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-3 rounded-2xl border border-slate-800/70 bg-slate-950/90 px-3 py-3 cursor-pointer transition hover:border-indigo-500/40"
              >
                <input
                  type="checkbox"
                  checked={!!types[option.id]}
                  onChange={() => onToggleType(option.id)}
                  className="h-4 w-4 accent-indigo-500 rounded"
                />
                <span className="text-sm text-slate-100 font-medium">{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {isEmbedded && (
        <div className="mt-5 space-y-2">
          <p className="text-xs text-slate-500">Preferences are saved to localStorage and loaded automatically next time.</p>
          <p className="text-xs text-slate-500">Browser status: {permissionLabel}</p>
        </div>
      )}
    </div>
  );
}
