import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/getApiUrl';
import { calculateDistanceKm } from '../utils/haversine';
import { ResolutionBadgeCompact } from './ResolutionBadge';
import { MlRiskBadgeCompact } from './MlRiskBadge';
import { MlResolutionBadgeCompact } from './MlResolutionBadge';
import { useMlResolution } from '../hooks/useMlResolution';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  BarChart,
  Area, 
  Bar, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip as ChartTooltip, 
  Legend, 
  LineChart,
  ReferenceLine
} from 'recharts';
import { MapPin, CloudRain, TrendingDown, Users, Bell, ShoppingBag, Train, Building, Store, Layers, Info, X, BarChart3, Clock3, Sparkles } from 'lucide-react';

export default function Sidebar({ 
  predictions = [], 
  selectedPrediction, 
  onSelectPrediction,
  timelineData,
  timelineLoading,
  selectedHours = 12,
  setSelectedHours,
  earthquakes = [],
  selectedEarthquake = null,
  onSelectEarthquake,
  allZones = [],
  nearMeFilterActive = false,
  nearMeRadius = 5,
  onClearNearMeFilter,
  onGetEvacuation,
  showEvacuationPanel = false,
  evacuationPanelNode = null,
  theme = 'light',
}) {
  const [poiFilter, setPoiFilter] = useState('all');
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [showPredictionHelp, setShowPredictionHelp] = useState(false);
  const [helpTab, setHelpTab] = useState('read');
  const { prediction: mlPrediction } = useMlResolution(selectedPrediction?.id);

  const isLight = theme === 'light' || (typeof document !== 'undefined' && document.documentElement.classList.contains('light-mode'));

  // LOW tier: zones monitored with no OPEN alert
  const activeZoneIds = new Set(
    predictions.map(p => p.zone?.zone_id ?? p.zone?.id).filter(Boolean)
  );
  const lowZones = allZones.filter(zs =>
    !activeZoneIds.has(zs.zone_id) && zs.zone &&
    (zs.overall_risk_score > 0 || zs.traffic_score > 0 || zs.crowd_score > 0)
  );
  const showingLowTier = severityFilter === 'Low';

  // Fetch global POIs for Nearby Infrastructure section
  const [globalPois, setGlobalPois] = useState([]);
  useEffect(() => {
    fetch(`${getApiUrl()}/pois`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setGlobalPois(data))
      .catch(() => {});
  }, []);

  // Filter POIs near the selected zone (within zone radius + 500m buffer)
  const nearbyPois = useMemo(() => {
    if (!selectedPrediction?.zone || globalPois.length === 0) return [];
    const z = selectedPrediction.zone;
    const lat = z.latitude ?? z.geometry?.coordinates?.[0]?.[0]?.[1];
    const lon = z.longitude ?? z.geometry?.coordinates?.[0]?.[0]?.[0];
    if (!lat || !lon) return [];
    const radiusKm = ((z.radius_m ?? 1000) + 500) / 1000;
    return globalPois.filter(poi =>
      calculateDistanceKm(lat, lon, poi.lat, poi.lon) <= radiusKm
    );
  }, [selectedPrediction, globalPois]);

  // Dashboard tab state


  // Severity breakdown chart data
  const breakdownData = (() => {
    const types = ['traffic', 'crowd', 'waterway', 'weather', 'earthquake'];
    const byType = {};
    types.forEach(t => { byType[t] = { type: t.charAt(0).toUpperCase() + t.slice(1), HIGH: 0, MEDIUM: 0 }; });
    predictions.forEach(p => {
      const t = (p.disruption_type || '').toLowerCase();
      if (byType[t]) {
        const sev = (p.risk_level || p.severity || '').toUpperCase();
        if (sev === 'HIGH' || sev === 'MEDIUM') byType[t][sev]++;
      }
    });
    return types.filter(t => byType[t].HIGH + byType[t].MEDIUM > 0).map(t => byType[t]);
  })();


  
  // Format dates to human-readable strings (treating naive timestamps as UTC and using 24h format)
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    let normalizedStr = timeStr;
    if (!timeStr.endsWith('Z') && !timeStr.includes('+') && !timeStr.includes('-T') && !timeStr.match(/-\d{2}:\d{2}$/)) {
      normalizedStr = timeStr + 'Z';
    }
    const date = new Date(normalizedStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'Critical': return 'text-risk-critical border-red-500/20 bg-red-500/5';
      case 'High': return 'text-risk-high border-orange-500/20 bg-orange-500/5';
      case 'Medium': return 'text-risk-medium border-yellow-500/20 bg-yellow-500/5';
      case 'Low':
      default: return 'text-risk-low border-emerald-500/20 bg-emerald-500/5';
    }
  };

  const getConfidenceColor = (prob) => {
    if (prob >= 80) return 'text-red-400 font-bold';
    if (prob >= 60) return 'text-orange-400 font-bold';
    if (prob >= 40) return 'text-yellow-400 font-semibold';
    return 'text-emerald-400 font-medium';
  };

  const getPoiIcon = (category) => {
    switch (category) {
      case 'hospital':        return <span className="text-base">🏥</span>;
      case 'police':          return <span className="text-base">🚔</span>;
      case 'university':      return <span className="text-base">🎓</span>;
      case 'mall':            return <ShoppingBag className="w-4 h-4 text-pink-400" />;
      case 'market':          return <Store className="w-4 h-4 text-amber-400" />;
      case 'station':         return <Train className="w-4 h-4 text-blue-400" />;
      case 'unique_building': return <Building className="w-4 h-4 text-purple-400" />;
      case 'small_business':  return <Store className="w-4 h-4 text-amber-400" />;
      default:                return <MapPin className="w-4 h-4 text-indigo-400" />;
    }
  };

  const filteredPois = (poiFilter === 'all'
    ? nearbyPois
    : nearbyPois.filter(poi => poi.category === poiFilter)
  );

  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  
  const PREVIEW_COUNT = 5;
  const filteredByType = showingLowTier
    ? []
    : predictions.filter(pred => {
        if (severityFilter === 'all') return true;
        return pred.risk_level.toLowerCase() === severityFilter.toLowerCase();
      });
  const displayedWarnings = showAllWarnings
    ? filteredByType
    : filteredByType.slice(0, PREVIEW_COUNT);

  const nowLabel = timelineData?.timeline?.[0] ? formatTime(timelineData.timeline[0].timestamp) : null;

  const formatHoursLabel = (hours) => {
    if (hours == null || Number.isNaN(hours)) return 'Unknown';
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 2) return `${hours.toFixed(1)} hour`;
    return `${hours.toFixed(1)} hours`;
  };

  const getMinutesRemaining = (estimate) => {
    if (!estimate) return null;
    const diff = Math.round((new Date(estimate) - new Date()) / 60000);
    return diff > 0 ? diff : 0;
  };

  const selectedAlertComparison = useMemo(() => {
    if (!selectedPrediction) {
      return {
        isExample: true,
        rows: [
          { label: 'Standard estimate', valueLabel: '2.7 hours remaining', confidence: '65% confidence', percent: 70, tint: 'bg-indigo-500' },
          { label: 'ML estimate', valueLabel: '2.0 hours remaining', confidence: '47% confidence', percent: 50, tint: 'bg-cyan-500' },
        ],
      };
    }

    const standardHours = selectedPrediction.estimated_resolution_at
      ? Math.max(0.1, getMinutesRemaining(selectedPrediction.estimated_resolution_at) / 60)
      : null;
    const mlHours = mlPrediction?.estimated_resolution_at
      ? Math.max(0.1, getMinutesRemaining(mlPrediction.estimated_resolution_at) / 60)
      : null;

    const rows = [];
    if (standardHours != null) {
      rows.push({
        label: 'Standard estimate',
        valueLabel: `${formatHoursLabel(standardHours)} remaining`,
        confidence: `${Math.round(selectedPrediction.resolution_confidence || selectedPrediction.probability_percentage || 0)}% confidence`,
        percent: Math.min(100, Math.max(20, Math.round(standardHours / 3 * 100))),
        tint: 'bg-indigo-500',
      });
    }
    if (mlHours != null) {
      rows.push({
        label: 'ML estimate',
        valueLabel: `${formatHoursLabel(mlHours)} remaining`,
        confidence: `${Math.round(mlPrediction?.resolution_confidence || 0)}% confidence`,
        percent: Math.min(100, Math.max(20, Math.round(mlHours / 3 * 100))),
        tint: 'bg-cyan-500',
      });
    }

    return { isExample: false, rows: rows.length > 0 ? rows : [
      { label: 'Standard estimate', valueLabel: 'Estimate pending', confidence: 'Waiting for fresh telemetry', percent: 25, tint: 'bg-indigo-500' },
    ]};
  }, [selectedPrediction, mlPrediction]);

  const confidenceBreakdown = useMemo(() => {
    const buckets = [
      { label: 'High confidence', min: 70, count: 0, accent: 'bg-emerald-500' },
      { label: 'Medium confidence', min: 40, count: 0, accent: 'bg-amber-500' },
      { label: 'Low confidence', min: 0, count: 0, accent: 'bg-rose-500' },
    ];

    predictions.forEach((prediction) => {
      const value = Number(prediction.probability_percentage ?? 0);
      if (value >= 70) buckets[0].count += 1;
      else if (value >= 40) buckets[1].count += 1;
      else buckets[2].count += 1;
    });

    return buckets;
  }, [predictions]);

  const clearTimeTimeline = useMemo(() => {
    const buckets = [
      { label: '0-15 min', count: 0 },
      { label: '15-30 min', count: 0 },
      { label: '30-60 min', count: 0 },
      { label: '60+ min', count: 0 },
    ];

    predictions.forEach((prediction) => {
      const estimate = selectedPrediction?.id === prediction.id && mlPrediction?.estimated_resolution_at
        ? mlPrediction.estimated_resolution_at
        : prediction.estimated_resolution_at;
      const minutes = getMinutesRemaining(estimate);
      if (minutes == null) return;
      if (minutes <= 15) buckets[0].count += 1;
      else if (minutes <= 30) buckets[1].count += 1;
      else if (minutes <= 60) buckets[2].count += 1;
      else buckets[3].count += 1;
    });

    return buckets.filter((bucket) => bucket.count > 0);
  }, [predictions, mlPrediction, selectedPrediction]);

  return (
    <div data-tour="sidebar-filters" className="w-full flex flex-col h-full bg-brand-elevated border-l border-slate-800 overflow-hidden">

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Active Notifications Block */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className={`flex items-center space-x-2 font-bold text-lg min-w-0 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
            <Bell className={`w-5 h-5 shrink-0 ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`} />
            <h2 className="truncate">Predictive Warning Feed</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowPredictionHelp(true)}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
              isLight
                ? 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 hover:border-indigo-500 hover:text-indigo-600'
                : 'border-slate-700/80 bg-slate-900/50 text-slate-300 hover:border-indigo-500/60 hover:text-indigo-400'
            }`}
            title="How to read predictions"
            aria-label="How to read predictions"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {/* Evacuation guidance button — shown when active threats exist */}
        {predictions.length > 0 && !showEvacuationPanel && onGetEvacuation && (
            <button
              data-tour="evacuation-control"
              onClick={onGetEvacuation}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center space-x-2 border shadow-sm ${
                isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              <span>🧭 Open Evacuation Route Guidance</span>
            </button>
        )}

        {/* Evacuation panel rendered inside sidebar */}
        {showEvacuationPanel && evacuationPanelNode && (
          <div className={`mb-3 rounded-xl border overflow-hidden ${isLight ? 'border-slate-300 shadow-sm' : 'border-slate-700'}`}>
            {evacuationPanelNode}
          </div>
        )}

        {nearMeFilterActive && (
          <div className={`px-3 py-2.5 rounded-xl border text-xs flex items-center justify-between animate-pulse mb-3 mt-1 shrink-0 select-none ${
            isLight
              ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
              : 'glass-panel border-indigo-500/20 text-indigo-400'
          }`}>
            <div className="flex items-center space-x-1.5 font-semibold">
              <span>📍 Within {nearMeRadius} km of my location</span>
            </div>
            <button 
              onClick={onClearNearMeFilter}
              className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded transition-all ${
                isLight
                  ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900'
                  : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300'
              }`}
            >
              Reset
            </button>
          </div>
        )}

        {/* Severity Filter Tabs */}
        <div className={`flex flex-wrap gap-1 mb-4 pb-2 border-b ${isLight ? 'border-slate-200' : 'border-slate-800/40'}`}>
          {[
            { id: 'all', label: 'All' },
            { id: 'Critical', label: 'Critical', color: isLight ? 'border-red-300 text-red-700 bg-red-50 font-bold' : 'border-red-500/20 text-red-400 bg-red-500/5' },
            { id: 'High', label: 'High', color: isLight ? 'border-orange-300 text-orange-700 bg-orange-50 font-bold' : 'border-orange-500/20 text-orange-400 bg-orange-500/5' },
            { id: 'Medium', label: 'Medium', color: isLight ? 'border-yellow-300 text-yellow-800 bg-yellow-50 font-bold' : 'border-yellow-500/20 text-yellow-400 bg-yellow-500/5' },
            { id: 'Low', label: 'Low', color: isLight ? 'border-emerald-300 text-emerald-700 bg-emerald-50 font-bold' : 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' }
          ].map(tab => {
            const isActive = severityFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSeverityFilter(tab.id)}
                className={`text-[9px] px-2 py-0.5 rounded font-semibold border transition-all duration-200 ${
                  isActive
                    ? tab.id === 'all'
                      ? isLight ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold shadow-sm' : 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                      : tab.color + ' font-bold scale-105'
                    : isLight ? 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200' : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        
        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
          {showingLowTier ? (
            lowZones.length === 0 ? (
              <div className={`text-center py-6 border border-dashed rounded-xl ${isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-800'}`}>
                <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>All zones have active alerts or no data yet.</p>
              </div>
            ) : (
              lowZones.map(zs => (
                <div key={zs.zone_id} className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 ${
                  isLight ? 'border-emerald-300 bg-emerald-50/80 shadow-sm' : 'border-emerald-500/20 bg-emerald-500/5'
                }`}>
                  <div>
                    <p className={`text-xs font-bold ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>{zs.zone?.name ?? `Zone ${zs.zone_id}`}</p>
                    <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>No active alerts — being monitored</p>
                    {zs.overall_risk_score > 0 && (
                      <p className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>Risk score: {Number(zs.overall_risk_score).toFixed(1)}</p>
                    )}
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${
                    isLight ? 'border-emerald-300 text-emerald-800 bg-emerald-100' : 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5'
                  }`}>LOW</span>
                </div>
              ))
            )
          ) : displayedWarnings.length === 0 ? (
            <div className={`text-center py-6 border border-dashed rounded-xl ${isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-800'}`}>
              <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>No warnings match this filter.</p>
            </div>
          ) : (
            displayedWarnings.map(pred => {
              const isSelected = selectedPrediction?.id === pred.id;
              return (
                <div 
                  key={pred.id}
                  onClick={() => onSelectPrediction(pred)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 ${
                    isSelected 
                      ? isLight ? 'border-indigo-600 bg-indigo-50/90 shadow-md ring-1 ring-indigo-500' : 'border-indigo-500 bg-indigo-500/10' 
                      : isLight ? 'border-slate-200 bg-white hover:bg-slate-50 shadow-sm' : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`font-bold text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{pred.zone.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRiskColor(pred.risk_level)}`}>
                      {pred.risk_level}
                    </span>
                  </div>
                  <div className={`mt-2 text-xs flex justify-between items-center ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    <span>Threat: <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>{pred.disruption_type}</span></span>
                    <span>Peak: <span className={`font-bold ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`}>{formatTime(pred.estimated_time_to_peak)}</span></span>
                  </div>
                  <div className={`mt-1.5 text-[10px] flex justify-between items-center border-t pt-1.5 ${isLight ? 'border-slate-100 text-slate-600' : 'border-slate-800/40 text-slate-500'}`}>
                    <span>Confidence Level</span>
                    <span className={getConfidenceColor(pred.probability_percentage)}>{pred.probability_percentage}%</span>
                  </div>
                  {pred.estimated_resolution_at && (
                    <div className={`mt-1.5 pt-1.5 border-t ${isLight ? 'border-slate-100' : 'border-slate-800/40'}`}>
                      <ResolutionBadgeCompact
                        estimated_resolution_at={pred.estimated_resolution_at}
                        resolution_confidence={pred.resolution_confidence}
                      />
                      <div className="mt-1">
                        <MlResolutionBadgeCompact alertId={pred.id} />
                      </div>
                    </div>
                  )}
                  <div className={`mt-1.5 pt-1.5 border-t ${isLight ? 'border-slate-100' : 'border-slate-800/40'}`}>
                    <MlRiskBadgeCompact zoneId={pred.zone?.zone_id ?? pred.zone?.id} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {filteredByType.length > PREVIEW_COUNT && !showAllWarnings && (
          <button 
            onClick={() => setShowAllWarnings(true)}
            className={`w-full text-center text-[11px] font-bold py-2 mt-3 rounded-xl border transition-all duration-200 shadow-sm ${
              isLight
                ? 'text-indigo-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                : 'text-indigo-400 bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/70'
            }`}
          >
            See More
          </button>
        )}
        {showAllWarnings && filteredByType.length > PREVIEW_COUNT && (
          <button 
            onClick={() => setShowAllWarnings(false)}
            className={`w-full text-center text-[11px] font-bold py-2 mt-3 rounded-xl border transition-all duration-200 shadow-sm ${
              isLight
                ? 'text-indigo-700 bg-slate-100 border-slate-200 hover:bg-slate-200'
                : 'text-indigo-400 bg-slate-900/40 border-slate-800/80 hover:bg-slate-900/70'
            }`}
          >
            See Less
          </button>
        )}
      </div>

      {showPredictionHelp && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-3 sm:p-4"
          onClick={() => setShowPredictionHelp(false)}
        >
          <div
            className={`w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border shadow-2xl ${
              isLight 
                ? 'bg-white border-slate-200 text-slate-800' 
                : 'bg-slate-900/95 border-slate-700 text-slate-100'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-3 border-b px-4 py-4 ${isLight ? 'border-slate-200' : 'border-slate-700/70'}`}>
              <div>
                <h3 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Prediction & ML Transparency</h3>
                <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-200'}`}>Understand warning cards, clear-time estimates, and prediction confidence.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPredictionHelp(false)}
                className={`rounded-full border p-2 transition ${
                  isLight
                    ? 'border-slate-300 text-slate-500 hover:border-indigo-500 hover:text-indigo-600 hover:bg-slate-100'
                    : 'border-slate-700 text-slate-300 hover:border-indigo-500/60 hover:text-indigo-400 hover:bg-slate-800'
                }`}
                aria-label="Close help modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className={`border-b px-4 py-3 ${isLight ? 'border-slate-200' : 'border-slate-700/70'}`}>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'read', label: 'How to Read' },
                  { id: 'works', label: 'How Prediction Works' },
                ].map((tab) => {
                  const active = helpTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setHelpTab(tab.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                        active 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : isLight 
                            ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[calc(90vh-170px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              {helpTab === 'read' ? (
                <div className={`space-y-6 text-sm leading-6 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  <section className="space-y-3">
                    <h4 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>How to read a warning card</h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Threat</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>The type of disruption detected, such as traffic, crowd, weather, flood/river, or earthquake.</p>
                      </div>
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Severity</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Low = monitor only. Medium = use caution. High = avoid the area if possible. Critical = follow emergency guidance.</p>
                      </div>
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Peak</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>The time when the disruption is expected to be strongest, busiest, or most severe.</p>
                      </div>
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Confidence Level</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Higher confidence means the warning is more stable. Lower confidence means the warning may change when new data arrives.</p>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h4 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Clear-time estimates</h4>
                    <div className="space-y-2">
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Standard estimate</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>The rule-based clear-time estimate from the current risk level and thresholds.</p>
                      </div>
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>ML estimate</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>The model-based clear-time estimate from historical patterns and live signals.</p>
                      </div>
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Estimate confidence</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>How reliable the clear-time estimate is. It is different from the warning confidence.</p>
                      </div>
                      <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Remaining time</p>
                        <p className={`mt-1 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Remaining time means the approximate time from now until the predicted clear time.</p>
                      </div>
                    </div>
                  </section>

                  <section className={`rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                    <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Example</p>
                    <p className={`mt-2 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>If a crowd warning says Peak 17:40, the area may be most crowded around 17:40. If the ML estimate says 20.24 WIB with 65% confidence, the model estimates the disruption may reduce around 20.24 WIB, but the time can still change as new data arrives.</p>
                  </section>

                  <section className={`rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                    <div className="flex items-center gap-2">
                      <BarChart3 className={`h-4 w-4 ${isLight ? 'text-indigo-600' : 'text-indigo-500'}`} />
                      <h4 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Selected alert comparison</h4>
                    </div>
                    <p className={`mt-2 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>Time remaining from now is shown here so you can compare the rule-based estimate with the ML estimate.</p>
                    {selectedAlertComparison.rows.length > 0 ? (
                      <div className="mt-3 space-y-3">
                        {selectedAlertComparison.rows.map((row) => (
                          <div key={row.label}>
                            <div className="flex items-center justify-between gap-2 text-sm">
                              <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{row.label}</span>
                              <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>{row.valueLabel}</span>
                            </div>
                            <div className={`mt-1 h-2 w-full overflow-hidden rounded-full ${isLight ? 'bg-slate-200' : 'bg-slate-700'}`}>
                              <div className={`h-2 rounded-full ${row.tint}`} style={{ width: `${Math.max(12, row.percent)}%` }} />
                            </div>
                            <p className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{row.confidence}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`mt-3 text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>No selected alert is available yet. The chart will appear once a warning is chosen.</p>
                    )}
                  </section>
                </div>
              ) : (
                <div className={`space-y-6 text-sm leading-6 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  <section className="space-y-3">
                    <h4 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>How prediction works</h4>
                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>DIS-RUPTURE combines rule-based scoring, machine-learning recovery estimates, live telemetry, and historical disruption patterns to build a practical warning feed.</p>
                  </section>

                  <section className={`rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                    <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Signals used</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['Traffic score', 'Weather score', 'Crowd score', 'Earthquake score', 'Waterway/flood score', 'Overall risk score', 'Historical snapshots', 'Zone status'].map((chip) => (
                        <span key={chip} className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm ${
                          isLight 
                            ? 'border-slate-300 bg-white text-slate-700' 
                            : 'border-slate-600 bg-slate-900 text-slate-200'
                        }`}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section className={`rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                    <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>How confidence is decided</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className={`rounded-lg border p-3 ${
                        isLight 
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800' 
                          : 'border-emerald-900/50 bg-emerald-950/20 text-emerald-300'
                      }`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-emerald-800' : 'text-emerald-400'}`}>Higher confidence usually means</p>
                        <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          <li>Data is complete</li>
                          <li>Recent telemetry is stable</li>
                          <li>Similar past cases exist</li>
                          <li>Signals agree with each other</li>
                        </ul>
                      </div>
                      <div className={`rounded-lg border p-3 ${
                        isLight 
                          ? 'border-amber-200 bg-amber-50 text-amber-800' 
                          : 'border-amber-900/50 bg-amber-950/20 text-amber-300'
                      }`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-amber-800' : 'text-amber-400'}`}>Lower confidence usually means</p>
                        <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          <li>Data is missing</li>
                          <li>Conditions are changing quickly</li>
                          <li>The disruption is unusual</li>
                          <li>Flood or earthquake conditions are uncertain</li>
                        </ul>
                      </div>
                    </div>
                  </section>

                  <section className={`rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/70'}`}>
                    <div className="flex items-center gap-2">
                      <Clock3 className={`h-4 w-4 ${isLight ? 'text-indigo-600' : 'text-indigo-500'}`} />
                      <h4 className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>Estimated Clear Time Timeline</h4>
                    </div>
                    <p className={`mt-2 text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>This timeline groups active warnings by how soon they are estimated to clear. It uses the ML estimate when available, otherwise it uses the standard clear-time estimate.</p>
                    <div className="mt-3 space-y-2">
                      {clearTimeTimeline.length > 0 ? clearTimeTimeline.map((bucket) => (
                        <div key={bucket.label} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                          isLight 
                            ? 'border-slate-200 bg-white text-slate-800' 
                            : 'border-slate-700 bg-slate-900 text-slate-200'
                        }`}>
                          <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{bucket.label}</span>
                          <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{bucket.count} warning{bucket.count === 1 ? '' : 's'}</span>
                        </div>
                      )) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">No clear-time estimates are available yet.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-indigo-500" />
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Confidence Breakdown</h4>
                    </div>
                    <div className="mt-3 space-y-3">
                      {confidenceBreakdown.map((bucket) => (
                        <div key={bucket.label}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700 dark:text-slate-200">{bucket.label}</span>
                            <span className="text-slate-500 dark:text-slate-400">{bucket.count}</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                            <div className={`h-2 rounded-full ${bucket.accent}`} style={{ width: `${Math.max(10, bucket.count * 12)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-indigo-200/80 bg-indigo-50/80 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Limitations</p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Predictions are estimates and may change when new telemetry arrives. During emergencies, follow BMKG, BPBD, and local authority instructions.</p>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* BMKG Earthquake Live Telemetry Section */}
      <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
        <div className={`flex items-center space-x-2 font-bold text-lg mb-3 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
          <Layers className="w-5 h-5 text-red-500 animate-pulse" />
          <h2>BMKG Live Earthquakes</h2>
        </div>
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {earthquakes.length === 0 ? (
            <div className={`text-center py-6 border border-dashed rounded-xl ${isLight ? 'border-slate-300 bg-slate-50' : 'border-slate-800'}`}>
              <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>No recent earthquakes recorded.</p>
            </div>
          ) : (
            earthquakes.map((eq, idx) => {
              const isMajor = eq.magnitude >= 6.0;
              const isSelected = selectedEarthquake && selectedEarthquake.datetime === eq.datetime && selectedEarthquake.latitude === eq.latitude;
              return (
                <div 
                  key={eq.id || idx} 
                  className={`p-3 rounded-lg border text-xs space-y-1.5 transition-all duration-200 ${
                    isSelected 
                      ? isLight ? 'border-red-500 bg-red-50/90 shadow-md ring-1 ring-red-400' : 'border-red-500 bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.25)]' 
                      : isLight ? 'border-slate-200 bg-white hover:bg-slate-50 shadow-sm' : 'border-slate-800 bg-slate-900/30 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{eq.wilayah}</span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                      isMajor ? 'bg-red-500/20 text-red-700 border border-red-500/30 animate-pulse' : 'bg-orange-500/20 text-orange-700 border border-orange-500/30'
                    }`}>
                      M {eq.magnitude.toFixed(1)}
                    </span>
                  </div>
                  <div className={`flex justify-between text-[10px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                    <span>{new Date(eq.datetime).toLocaleDateString()}</span>
                    <span>{new Date(eq.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {eq.potensi && (
                    <div className={`text-[9.5px] font-semibold italic border-t pt-1 mt-1 ${isLight ? 'border-slate-100 text-indigo-700' : 'border-slate-800/20 text-indigo-400/90'}`}>
                      {eq.potensi}
                    </div>
                  )}
                  <div className={`flex justify-between items-center pt-1.5 border-t ${isLight ? 'border-slate-100' : 'border-slate-800/20'}`}>
                    <span className={`text-[10px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>Depth: {eq.depth}</span>
                    <button
                      onClick={() => onSelectEarthquake && onSelectEarthquake(isSelected ? null : eq)}
                      className={`text-[9px] px-2 py-0.5 rounded font-extrabold tracking-wider uppercase transition-all duration-200 ${
                        isSelected 
                          ? 'bg-red-600 text-white shadow-glow animate-pulse'
                          : isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      {isSelected ? 'Viewing' : 'View'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Zone Analytical Projections */}
      {selectedPrediction ? (
        <div className={`flex-1 flex flex-col space-y-6 pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div>
            <div className={`flex items-center space-x-2 font-semibold mb-1 ${isLight ? 'text-indigo-700' : 'text-indigo-400'}`}>
              <MapPin className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Selected Zone Analysis</span>
            </div>
            <h1 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{selectedPrediction?.zone?.name ?? 'Unknown Zone'}</h1>
            
            <div className="grid grid-cols-1 gap-3 mt-4">
              <div className={`rounded-lg p-2 text-center border shadow-sm ${
                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800/80'
              }`}>
                <p className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Baseline Speed</p>
                <p className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{selectedPrediction?.zone?.traffic_speed_baseline ?? 'N/A'} <span className="text-xs font-normal">km/h</span></p>
              </div>
            </div>
          </div>

          {/* Dynamic Infrastructure POI Section */}
          <div className={`space-y-3 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>
            <h3 className={`text-sm font-semibold flex items-center space-x-2 ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
              <Layers className={`w-4 h-4 ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`} />
              <span>Nearby Infrastructure & POIs</span>
            </h3>
            
            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-1.5 pb-2">
              {[
                { id: 'all', label: 'All' },
                { id: 'hospital', label: '🏥 Hospital' },
                { id: 'police', label: '🚔 Police' },
                { id: 'university', label: '🎓 University' },
                { id: 'mall', label: '🏬 Mall' },
                { id: 'station', label: '🚉 Station' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setPoiFilter(tab.id)}
                  className={`text-[10px] px-2 py-1 rounded font-medium border transition-all duration-200 ${
                    poiFilter === tab.id
                      ? isLight ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-bold shadow-sm' : 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold'
                      : isLight ? 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200' : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* POI Scroll Container */}
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {filteredPois.length > 0 ? (
                filteredPois.map((poi, idx) => (
                  <div key={idx} className={`p-2.5 rounded-lg border text-xs shadow-sm ${
                    isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-slate-800/60'
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 min-w-0">
                        {getPoiIcon(poi.category)}
                        <span className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{poi.name}</span>
                      </div>
                      <span className={`text-[9px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded shrink-0 ml-2 border ${
                        isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-950/60 text-slate-500 border-transparent'
                      }`}>
                        {poi.category.replace('_', ' ')}
                      </span>
                    </div>
                    {poi.crowd_score != null ? (
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-[9px] font-semibold ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>👥 Crowd</span>
                          <span className={`text-[9px] font-bold ${
                            poi.crowd_score >= 65 ? (isLight ? 'text-red-700' : 'text-red-400') :
                            poi.crowd_score >= 35 ? (isLight ? 'text-amber-700' : 'text-amber-400') : (isLight ? 'text-emerald-700' : 'text-emerald-400')
                          }`}>
                            {poi.crowd_score >= 65 ? 'High' : poi.crowd_score >= 35 ? 'Moderate' : 'Low'}
                            <span className={`font-normal ml-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>({Math.round(poi.crowd_score)})</span>
                          </span>
                        </div>
                        <div className={`w-full rounded-full h-1 overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}>
                          <div
                            className={`h-1 rounded-full transition-all ${
                              poi.crowd_score >= 65 ? 'bg-red-500' :
                              poi.crowd_score >= 35 ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, poi.crowd_score)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>No crowd data</span>
                    )}
                  </div>
                ))
              ) : (
                <div className={`text-center py-4 text-[11px] border border-dashed rounded-lg ${isLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-slate-800 text-slate-500'}`}>
                  No matching facilities found in this geofence.
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Weather & Speed Projections */}
          <div className={`flex-1 flex flex-col space-y-4 pt-2 border-t ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>
            <div className="flex justify-between items-center">
              <h3 className={`text-sm font-semibold flex items-center space-x-2 ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                <CloudRain className="w-4 h-4 text-sky-500" />
                <span>{selectedHours}-Hour Forecast Projections</span>
              </h3>
              
              <div className={`flex rounded-lg p-0.5 space-x-0.5 border ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800/60'
              }`}>
                {[3, 6, 12, 24].map(h => {
                  const isActive = selectedHours === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setSelectedHours(h)}
                      className={`text-[9px] px-2 py-0.5 rounded font-semibold transition-all duration-200 ${
                        isActive
                          ? isLight ? 'bg-indigo-600 text-white font-bold shadow-sm' : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold'
                          : isLight ? 'text-slate-600 hover:text-slate-900' : 'border border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>

            {timelineLoading ? (
              <div className={`flex-1 flex items-center justify-center text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Analyzing spatial indexes and streaming API updates...
              </div>
            ) : timelineData && timelineData.timeline && timelineData.timeline.length > 0 ? (
              <div className="space-y-6 flex-1">
                {/* Weather Chart */}
                <div className={`h-44 w-full rounded-xl p-3 flex flex-col border shadow-sm ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-950/40 border-slate-900'
                }`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>Rainfall &amp; Humidity Forecast</span>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart 
                        data={timelineData.timeline.filter(d => d.humidity != null || d.rainfall != null).map(d => ({
                          time: formatTime(d.timestamp),
                          probability: d.humidity ?? null,
                          rain: d.rainfall ?? null
                        }))}
                        margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                      >
                        <XAxis dataKey="time" stroke={isLight ? '#64748b' : '#475569'} fontSize={9} />
                        <YAxis yAxisId="left" stroke="#0284c7" fontSize={9} unit="%" domain={[0, 100]} />
                        <YAxis yAxisId="right" orientation="right" stroke="#4f46e5" fontSize={9} unit="mm" />
                        <ChartTooltip 
                          contentStyle={isLight ? { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' } : { backgroundColor: '#151d30', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: isLight ? '#0f172a' : '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '10px' }}
                        />
                        <Area yAxisId="left" type="monotone" dataKey="probability" fill="#38bdf8" stroke="#0284c7" fillOpacity={isLight ? 0.25 : 0.15} name="Humidity (%)" />
                        <Bar yAxisId="right" dataKey="rain" fill="#6366f1" radius={[2, 2, 0, 0]} name="Rain (mm)" />
                        {nowLabel && (
                          <ReferenceLine 
                            yAxisId="left"
                            x={nowLabel} 
                            stroke="#ef4444" 
                            strokeWidth={1.5}
                            strokeDasharray="3 3" 
                            label={{ value: 'NOW', position: 'insideTopLeft', fill: '#dc2626', fontSize: 8, fontWeight: 'bold' }} 
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Speed Drop Chart */}
                <div className={`h-44 w-full rounded-xl p-3 flex flex-col border shadow-sm ${
                  isLight ? 'bg-white border-slate-200' : 'bg-slate-950/40 border-slate-900'
                }`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center justify-between ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                    <span>Speed Degradation Curve</span>
                    <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                  </span>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={(() => {
                          const pts = (timelineData?.timeline || []).filter(d => d.speed != null);
                          return pts.map(d => ({
                            time: formatTime(d.timestamp),
                            speed: d.speed,
                          }));
                        })()}
                        margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
                      >
                        <XAxis dataKey="time" stroke={isLight ? '#64748b' : '#475569'} fontSize={9} />
                        <YAxis stroke={isLight ? '#475569' : '#94a3b8'} fontSize={9} unit="km/h" />
                        <ChartTooltip 
                          contentStyle={isLight ? { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' } : { backgroundColor: '#151d30', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: isLight ? '#0f172a' : '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '10px' }}
                        />
                        {(timelineData?.timeline || []).filter(d => d.speed != null).length >= 2 ? (
                          <>
                            <Line type="monotone" dataKey="speed" stroke="#e11d48" strokeWidth={2.5} dot={false} activeDot={false} name="Expected Speed" />
                            <ReferenceLine y={selectedPrediction?.zone?.traffic_speed_baseline ?? 40} stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: 'Baseline', position: 'insideBottomRight', fill: isLight ? '#334155' : '#64748b', fontSize: 8 }} />
                          </>
                        ) : (
                          <text x="50%" y="50%" textAnchor="middle" fill={isLight ? '#64748b' : '#475569'} fontSize={11}>No traffic snapshot data</text>
                        )}
                        {nowLabel && (
                          <ReferenceLine 
                            x={nowLabel} 
                            stroke="#ef4444" 
                            strokeWidth={1.5}
                            strokeDasharray="3 3" 
                            label={{ value: 'NOW', position: 'insideTopLeft', fill: '#dc2626', fontSize: 8, fontWeight: 'bold' }} 
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`flex-1 flex items-center justify-center text-xs ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                Select a polygon zone on the map to visualize predictions.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex flex-col justify-center items-center text-center p-8 border-t space-y-2 ${
          isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-400'
        }`}>
          <MapPin className={`w-8 h-8 animate-bounce ${isLight ? 'text-indigo-600' : 'text-slate-600'}`} />
          <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>No Zone Geofence Inspected</p>
          <p className={`text-xs max-w-xs ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
            Select an active warning card from the top feed or click a zone directly on the map to query PostGIS logs and construct risk timelines.
          </p>
        </div>
      )}

      </div>
    </div>
  );
}
