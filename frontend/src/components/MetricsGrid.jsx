import React from 'react';
import { ShieldAlert, CloudRain, Clock, Landmark } from 'lucide-react';

export default function MetricsGrid({ predictions = [], theme = 'light' }) {
  const isLight = theme === 'light';
  const muted = isLight ? 'text-slate-600' : 'text-slate-400';
  const title = isLight ? 'text-slate-900' : 'text-slate-100';
  const subtitle = isLight ? 'text-slate-700' : 'text-slate-200';
  const idleIcon = isLight ? 'bg-slate-200/80 text-slate-500' : 'bg-slate-500/10 text-slate-400';

  const criticalCount = predictions.filter(p => p.risk_level === 'Critical' || p.risk_level === 'High').length;

  const activeZones = predictions.map(p => p.zone);
  const maxVulnerability = activeZones.length > 0
    ? Math.max(...activeZones.map(z => z.historical_flood_vulnerability))
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className={`p-3 rounded-lg ${criticalCount > 0 ? 'bg-red-500/10 text-risk-critical animate-pulse' : idleIcon}`}>
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <p className={`text-xs font-medium ${muted}`}>Active Threat Zones</p>
          <p className={`text-xl font-bold tracking-tight ${title}`}>
            {criticalCount} <span className={`text-xs font-normal ${muted}`}>/ {predictions.length}</span>
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-orange-500/10 text-risk-high">
          <Landmark className="w-6 h-6" />
        </div>
        <div>
          <p className={`text-xs font-medium ${muted}`}>Max Flood Index</p>
          <p className={`text-xl font-bold tracking-tight ${title}`}>
            {(maxVulnerability * 100).toFixed(0)}<span className={`text-xs font-normal ${muted}`}>%</span>
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-yellow-500/10 text-risk-medium">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className={`text-xs font-medium ${muted}`}>Standard Peak Hour</p>
          <p className={`text-sm font-semibold tracking-tight ${subtitle}`}>
            07:00 - 09:00
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-emerald-500/10 text-risk-low">
          <CloudRain className="w-6 h-6" />
        </div>
        <div>
          <p className={`text-xs font-medium ${muted}`}>BPBD Gate Feed</p>
          <p className={`text-sm font-semibold tracking-tight ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
            Connected
          </p>
        </div>
      </div>
    </div>
  );
}
