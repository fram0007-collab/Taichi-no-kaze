import React, { useEffect, useState } from 'react';
import {
  Shield,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

const SKIP_DELAY_MS = 1500;

const CHECK_ROWS = [
  { key: 'api', label: 'API' },
  { key: 'database', label: 'Database' },
  { key: 'zones', label: 'Zones' },
  { key: 'alerts', label: 'Live alerts' },
];

function CheckRow({ label, status, isLight }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
        {label}
      </span>
      {status === 'ok' ? (
        <CheckCircle2 className={`w-4 h-4 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
      ) : status === 'fail' ? (
        <AlertTriangle className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
      ) : (
        <Loader2 className={`w-4 h-4 shrink-0 animate-spin ${isLight ? 'text-indigo-500' : 'text-indigo-400'}`} />
      )}
    </div>
  );
}

export default function StackLoadingScreen({
  checks = { api: 'pending', database: 'pending', zones: 'pending', alerts: 'pending' },
  timedOut = false,
  theme = 'light',
  onSkip,
}) {
  const isLight = theme === 'light';
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), SKIP_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const doneCount = CHECK_ROWS.filter((row) => checks[row.key] === 'ok').length;
  const progress = (doneCount / CHECK_ROWS.length) * 100;
  const allReady = doneCount === CHECK_ROWS.length;

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center p-4 ${
        isLight ? 'bg-slate-50' : 'bg-slate-950'
      }`}
      role="status"
      aria-live="polite"
      aria-busy={!allReady}
    >
      <div className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col items-center text-center mb-6">
          <div className={`p-3 rounded-xl border mb-3 ${
            isLight
              ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
              : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
          }`}>
            <Shield className="w-7 h-7" />
          </div>
          <h1 className={`text-lg font-extrabold tracking-wide uppercase ${
            isLight ? 'text-slate-900' : 'text-slate-100'
          }`}>
            DIS-RUPTURE
          </h1>
          <p className={`text-[11px] font-medium tracking-widest uppercase mt-1 ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            Jabodetabek disruption alerts
          </p>
        </div>

        <div className={`h-1 w-full rounded-full overflow-hidden mb-5 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
          <div
            className="h-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="space-y-3 mb-6">
          {CHECK_ROWS.map((row) => (
            <CheckRow
              key={row.key}
              label={row.label}
              status={checks[row.key] || 'pending'}
              isLight={isLight}
            />
          ))}
        </div>

        <p className={`text-xs text-center ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {timedOut
            ? 'Continuing with limited data…'
            : allReady
              ? 'Ready'
              : 'Connecting to live feeds…'}
        </p>

        {showSkip && (
          <button
            type="button"
            onClick={onSkip}
            className={`mt-4 w-full min-h-[44px] rounded-xl text-xs font-semibold border transition-colors ${
              isLight
                ? 'border-slate-300 text-slate-600 hover:bg-slate-50'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Skip and open map
          </button>
        )}
      </div>
    </div>
  );
}
