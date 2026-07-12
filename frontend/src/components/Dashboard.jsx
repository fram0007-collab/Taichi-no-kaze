import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip as ChartTooltip, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { X, ArrowLeft, AlertTriangle, Activity, TrendingUp, MapPin } from 'lucide-react';
import { getApiUrl } from '../utils/getApiUrl';

const TYPE_EMOJI = { traffic: '🚗', crowd: '👥', weather: '⛈️', waterway: '🌊', earthquake: '🌍' };
const SEV_COLOR = { HIGH: '#ef4444', MEDIUM: '#eab308' };
const PIE_COLORS = ['#6366f1', '#94a3b8'];

// ── Shared helpers ─────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color = 'text-slate-100' }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{label}</p>
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function AlertCard({ alert }) {
  const sevColor = alert.severity === 'HIGH' ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  const statusColor = alert.status === 'OPEN' ? 'text-emerald-400' : 'text-slate-500';
  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  };
  return (
    <div className={`p-2.5 rounded-xl border text-[10px] ${alert.status === 'OPEN' ? 'border-orange-500/20 bg-orange-500/5' : 'border-slate-800/60 bg-slate-900/30'}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded font-bold text-[9px] border ${sevColor}`}>{alert.severity}</span>
          <span className="text-slate-300 capitalize font-semibold">{TYPE_EMOJI[alert.disruption_type]} {alert.disruption_type}</span>
          {alert.zone?.name && <><span className="text-slate-600">·</span><span className="text-slate-400">{alert.zone.name}</span></>}
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${statusColor}`}>{alert.status}</span>
      </div>
      <div className="text-slate-500 flex items-center gap-2 flex-wrap">
        <span>🕐 {formatDate(alert.alert_timestamp)}</span>
        {alert.probability_percentage > 0 && <span>· Score: {alert.probability_percentage.toFixed(1)}%</span>}
      </div>
    </div>
  );
}

// ── Overall View ───────────────────────────────────────────────────
function OverallView({ onSelectZone }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    fetch(`${getApiUrl()}/dashboard/summary?days=${days}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setSummary(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-500 text-sm animate-pulse">Loading dashboard data...</div>
    </div>
  );

  if (!summary) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-500 text-sm">Failed to load dashboard data.</div>
    </div>
  );

  const { totals, dominant_type, hotspot, daily_trend, severity_breakdown, zone_rankings } = summary;
  const pieData = [
    { name: 'Open', value: totals.open },
    { name: 'Closed', value: totals.closed },
  ];

  return (
    <div className="space-y-6">
      {/* Days filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 font-semibold">Time range:</span>
        {[1, 3, 7].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`text-xs px-3 py-1 rounded-lg border font-semibold transition-all ${days === d ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-slate-800 text-slate-500 hover:text-slate-300'}`}>
            {d}d
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Total Alerts" value={totals.total} sub={`Last ${days} days`} />
        <SummaryCard label="Active Now" value={totals.open} sub={`${totals.closed} resolved`} color="text-orange-400" />
        <SummaryCard label="Dominant Type" value={dominant_type?.charAt(0).toUpperCase() + dominant_type?.slice(1)} sub="Most frequent disruption" color="text-indigo-400" />
        <SummaryCard label="Hotspot Zone" value={hotspot?.name || '—'} sub={hotspot ? `${hotspot.total_alerts} alerts` : ''} color="text-red-400" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily trend */}
        <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">📈 Daily Alert Trend</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily_trend} margin={{ top: 4, right: 8, left: -28, bottom: 0 }}>
                <XAxis dataKey="day" stroke="#475569" fontSize={9} tickFormatter={d => d.slice(5)} />
                <YAxis stroke="#475569" fontSize={9} allowDecimals={false} />
                <ChartTooltip contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }} />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} name="Alerts" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Open vs Closed donut */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">⚡ Alert Status</p>
          <div className="h-44 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="80%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <ChartTooltip contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"/> Open ({totals.open})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500 inline-block"/> Closed ({totals.closed})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Severity breakdown + Zone rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Severity breakdown */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">📊 Severity by Type</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severity_breakdown} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <XAxis dataKey="type" stroke="#475569" fontSize={9} />
                <YAxis stroke="#475569" fontSize={9} allowDecimals={false} />
                <ChartTooltip contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
                <Bar dataKey="HIGH" name="High" fill="#ef4444" radius={[3,3,0,0]} stackId="a" />
                <Bar dataKey="MEDIUM" name="Medium" fill="#eab308" radius={[3,3,0,0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Zone rankings */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">🏆 Zone Alert Rankings</p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {zone_rankings.map((z, i) => {
              const color = z.open_alerts > 0 ? 'text-orange-400' : z.high_alerts > 0 ? 'text-red-400' : 'text-slate-400';
              const badge = z.open_alerts > 0 ? '🔴' : z.high_alerts > 0 ? '🟠' : '🟡';
              return (
                <button key={z.zone_id} onClick={() => onSelectZone(z)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50 transition-all text-left group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-600 w-4 font-mono">#{i+1}</span>
                    <span className="text-[9px]">{badge}</span>
                    <span className="text-[11px] font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors">{z.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold ${color}`}>{z.total_alerts} alerts</span>
                    <span className="text-slate-600 text-[10px]">›</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Zone Detail View ───────────────────────────────────────────────
function ZoneDetailView({ zone, allZones, onBack }) {
  const [alerts, setAlerts] = useState([]);
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alertFilter, setAlertFilter] = useState('all');

  const zoneStatus = allZones?.find(z => z.zone_id === zone.zone_id);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${getApiUrl()}/alerts/history?days=7&zone_id=${zone.zone_id}`).then(r => r.ok ? r.json() : []),
      fetch(`${getApiUrl()}/predictions/zone/${zone.zone_id}?hours=24`).then(r => r.ok ? r.json() : null),
    ]).then(([alertData, timelineData]) => {
      setAlerts(alertData);
      setTimeline(timelineData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [zone.zone_id]);

  const filteredAlerts = alertFilter === 'all' ? alerts
    : alerts.filter(a => a.status === alertFilter);

  const scores = zoneStatus ? [
    { dim: 'Traffic', score: zoneStatus.traffic_score || 0, color: '#f97316' },
    { dim: 'Weather', score: zoneStatus.weather_score || 0, color: '#3b82f6' },
    { dim: 'Crowd', score: zoneStatus.crowd_score || 0, color: '#eab308' },
    { dim: 'Earthquake', score: zoneStatus.earthquake_score || 0, color: '#ef4444' },
    { dim: 'Waterway', score: zoneStatus.waterway_score || 0, color: '#06b6d4' },
  ] : [];

  return (
    <div className="space-y-5">
      {/* Back + zone header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-400 transition-colors font-semibold">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="h-4 w-px bg-slate-700" />
        <div>
          <h3 className="text-base font-bold text-slate-100">{zone.name}</h3>
          <p className="text-[10px] text-slate-500">{zone.total_alerts} alerts in last 7 days · {zone.open_alerts} currently open</p>
        </div>
      </div>

      {/* Current dimension scores */}
      {scores.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Risk Scores</p>
          <div className="grid grid-cols-5 gap-2">
            {scores.map(s => (
              <div key={s.dim} className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase mb-1">{s.dim}</p>
                <p className="text-lg font-extrabold" style={{ color: s.color }}>{s.score.toFixed(0)}</p>
                <div className="mt-1.5 w-full bg-slate-800 rounded-full h-1">
                  <div className="h-1 rounded-full transition-all" style={{ width: `${Math.min(100, s.score)}%`, background: s.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline chart */}
      {timeline?.timeline?.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">📈 24h Trend</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={(() => {
                  // 1. Normalize congestion 0-1 → 0-100
                  const pts = timeline.timeline.map(d => ({
                    ...d,
                    traffic_pct: d.congestion != null ? Math.min(100, Math.round(d.congestion * 100)) : null,
                  }));

                  // 2. Forward-fill last known values so lines extend to "now"
                  //    instead of abruptly stopping when snapshots end
                  let lastCrowd = null, lastHumidity = null, lastTraffic = null;
                  const filled = pts.map(d => {
                    if (d.crowd_score != null) lastCrowd = d.crowd_score;
                    if (d.weather_score != null) lastHumidity = d.weather_score;
                    if (d.traffic_pct != null) lastTraffic = d.traffic_pct;
                    return {
                      ...d,
                      crowd_score: d.crowd_score ?? lastCrowd,
                      weather_score: d.weather_score ?? lastHumidity,
                      traffic_pct: d.traffic_pct ?? lastTraffic,
                    };
                  });

                  // 3. Append a synthetic "now" point if the last timestamp
                  //    is more than 30 min old, so the line reaches the present
                  const last = filled[filled.length - 1];
                  if (last) {
                    const lastTime = new Date(last.timestamp.endsWith('Z') ? last.timestamp : last.timestamp + 'Z');
                    const now = new Date();
                    if (now - lastTime > 30 * 60 * 1000) {
                      filled.push({
                        ...last,
                        timestamp: now.toISOString(),
                      });
                    }
                  }
                  return filled;
                })()}
                margin={{ top: 4, right: 8, left: -28, bottom: 0 }}
              >
                <XAxis
                  dataKey="timestamp"
                  stroke="#475569"
                  fontSize={8}
                  interval="preserveStartEnd"
                  tickFormatter={t => {
                    if (!t) return '';
                    try {
                      const d = new Date(t.endsWith('Z') ? t : t + 'Z');
                      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' });
                    } catch { return ''; }
                  }}
                />
                <YAxis stroke="#475569" fontSize={9} domain={[0, 100]} />
                <ChartTooltip
                  contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                  labelFormatter={t => {
                    try {
                      const d = new Date(t.endsWith('Z') ? t : t + 'Z');
                      return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
                    } catch { return t; }
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
                {timeline.timeline.some(t => t.crowd_score != null) && (
                  <Line type="monotone" dataKey="crowd_score" stroke="#eab308" strokeWidth={2} dot={false} activeDot={false} connectNulls={true} name="Crowd" />
                )}
                {timeline.timeline.some(t => t.weather_score != null) && (
                  <Line type="monotone" dataKey="weather_score" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={false} connectNulls={true} name="Humidity %" />
                )}
                {timeline.timeline.some(t => t.congestion != null) && (
                  <Line type="monotone" dataKey="traffic_pct" stroke="#f97316" strokeWidth={2} dot={false} activeDot={false} connectNulls={true} name="Traffic %" />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Alert history */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alert History (7 days)</p>
          <div className="flex gap-1.5">
            {['all','OPEN','CLOSED'].map(f => (
              <button key={f} onClick={() => setAlertFilter(f)}
                className={`text-[9px] px-2 py-0.5 rounded font-semibold border transition-all ${
                  alertFilter === f ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-slate-800 text-slate-500 hover:text-slate-300'
                }`}>{f === 'all' ? 'All' : f}</button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="text-center py-8 text-slate-500 text-xs animate-pulse">Loading alerts...</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl">
            <p className="text-xs text-slate-500">No alerts found.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filteredAlerts.map(a => <AlertCard key={a.alert_id} alert={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard Component ───────────────────────────────────────
export default function Dashboard({ isOpen, onClose, allZones = [] }) {
  const [selectedZone, setSelectedZone] = useState(null);

  // Reset to overall view when dashboard closes
  useEffect(() => {
    if (!isOpen) setSelectedZone(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-brand-elevated border border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {selectedZone ? selectedZone.name : 'Threat Intelligence Dashboard'}
              </h2>
              <p className="text-[10px] text-slate-500">
                {selectedZone ? 'Zone detail analysis' : 'Jabodetabek overview · last 7 days'}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {selectedZone ? (
            <ZoneDetailView
              zone={selectedZone}
              allZones={allZones}
              onBack={() => setSelectedZone(null)}
            />
          ) : (
            <OverallView onSelectZone={setSelectedZone} />
          )}
        </div>

      </div>
    </div>
  );
}
