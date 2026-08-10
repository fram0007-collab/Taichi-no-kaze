import React from 'react';
import { ShieldAlert, CloudRain, Clock, Landmark } from 'lucide-react';

export default function MetricsGrid({ predictions = [] }) {
  // Compute analytics from active predictions
  const criticalCount = predictions.filter(p => p.risk_level === 'Critical' || p.risk_level === 'High').length;
  
  // Find highest rain accumulation in active prediction zones
  const activeZones = predictions.map(p => p.zone);
  const maxVulnerability = activeZones.length > 0
    ? Math.max(...activeZones.map(z => z.historical_flood_vulnerability))
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {/* Card 1: Critical Risks */}
      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className={`p-3 rounded-lg ${criticalCount > 0 ? 'bg-red-500/10 text-risk-critical animate-pulse' : 'bg-slate-500/10 text-slate-400'}`}>
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-medium">Active Threat Zones</p>
          <p className="text-xl font-bold tracking-tight text-slate-100">
            {criticalCount} <span className="text-xs font-normal text-slate-400">/ {predictions.length}</span>
          </p>
        </div>
      </div>

      {/* Card 2: Highest Vulnerability */}
      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-orange-500/10 text-risk-high">
          <Landmark className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-medium">Max Flood Index</p>
          <p className="text-xl font-bold tracking-tight text-slate-100">
            {(maxVulnerability * 100).toFixed(0)}<span className="text-xs font-normal text-slate-400">%</span>
          </p>
        </div>
      </div>

      {/* Card 3: Commuter Capacity */}
      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-yellow-500/10 text-risk-medium">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-medium">Standard Peak Hour</p>
          <p className="text-sm font-semibold tracking-tight text-slate-200">
            07:00 - 09:00
          </p>
        </div>
      </div>

      {/* Card 4: Monitoring Status */}
      <div className="glass-panel rounded-xl p-4 flex items-center space-x-4">
        <div className="p-3 rounded-lg bg-emerald-500/10 text-risk-low">
          <CloudRain className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs text-slate-400 font-medium">BPBD Gate Feed</p>
          <p className="text-sm font-semibold tracking-tight text-emerald-400">
            Connected
          </p>
        </div>
      </div>
    </div>
  );
}
