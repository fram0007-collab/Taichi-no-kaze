import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/getApiUrl';
import { calculateDistanceKm } from '../utils/haversine';
import { ResolutionBadgeCompact } from './ResolutionBadge';
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
import { MapPin, CloudRain, TrendingDown, Users, Bell, ShoppingBag, Train, Building, Store, Layers } from 'lucide-react';

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
}) {
  const [poiFilter, setPoiFilter] = useState('all');
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('all');

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

  return (
    <div className="w-full flex flex-col h-full bg-brand-elevated border-l border-slate-800 overflow-hidden">

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Active Notifications Block */}
      <div>
        <div className="flex items-center space-x-2 text-slate-100 font-bold text-lg mb-2">
          <Bell className="w-5 h-5 text-indigo-400" />
          <h2>Predictive Warning Feed</h2>
        </div>

        {/* Evacuation guidance button — shown when active threats exist */}
        {predictions.length > 0 && !showEvacuationPanel && onGetEvacuation && (
          <button
            onClick={onGetEvacuation}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 mb-3"
          >
            <span>🚨</span>
            Get Evacuation Guidance
          </button>
        )}

        {/* Evacuation panel rendered inside sidebar */}
        {showEvacuationPanel && evacuationPanelNode && (
          <div className="mb-3 rounded-xl border border-slate-700 overflow-hidden">
            {evacuationPanelNode}
          </div>
        )}

        {nearMeFilterActive && (
          <div className="glass-panel px-3 py-2.5 rounded-xl border border-indigo-500/20 text-indigo-400 text-xs flex items-center justify-between animate-pulse mb-3 mt-1 shrink-0 select-none">
            <div className="flex items-center space-x-1.5 font-semibold">
              <span>📍 Within {nearMeRadius} km of my location</span>
            </div>
            <button 
              onClick={onClearNearMeFilter}
              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"
            >
              Reset
            </button>
          </div>
        )}

        {/* Severity Filter Tabs */}
        <div className="flex flex-wrap gap-1 mb-4 pb-2 border-b border-slate-800/40">
          {[
            { id: 'all', label: 'All' },
            { id: 'Critical', label: 'Critical', color: 'border-red-500/20 text-red-400 bg-red-500/5' },
            { id: 'High', label: 'High', color: 'border-orange-500/20 text-orange-400 bg-orange-500/5' },
            { id: 'Medium', label: 'Medium', color: 'border-yellow-500/20 text-yellow-400 bg-yellow-500/5' },
            { id: 'Low', label: 'Low', color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' }
          ].map(tab => {
            const isActive = severityFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSeverityFilter(tab.id)}
                className={`text-[9px] px-2 py-0.5 rounded font-semibold border transition-all duration-200 ${
                  isActive
                    ? tab.id === 'all'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                      : tab.color + ' font-bold scale-105'
                    : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-200'
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
              <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl">
                <p className="text-xs text-slate-500 font-medium">All zones have active alerts or no data yet.</p>
              </div>
            ) : (
              lowZones.map(zs => (
                <div key={zs.zone_id} className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-emerald-400">{zs.zone?.name ?? `Zone ${zs.zone_id}`}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">No active alerts — being monitored</p>
                    {zs.overall_risk_score > 0 && (
                      <p className="text-[10px] text-slate-500">Risk score: {Number(zs.overall_risk_score).toFixed(1)}</p>
                    )}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-bold border border-emerald-500/20 text-emerald-400 bg-emerald-500/5 shrink-0">LOW</span>
                </div>
              ))
            )
          ) : displayedWarnings.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl">
              <p className="text-xs text-slate-500 font-medium">No warnings match this filter.</p>
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
                      ? 'border-indigo-500 bg-indigo-500/10' 
                      : 'border-slate-800 bg-slate-900/50 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-sm text-slate-200">{pred.zone.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getRiskColor(pred.risk_level)}`}>
                      {pred.risk_level}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex justify-between items-center">
                    <span>Threat: <span className="text-slate-300 font-medium">{pred.disruption_type}</span></span>
                    <span>Peak: <span className="text-indigo-400 font-medium">{formatTime(pred.estimated_time_to_peak)}</span></span>
                  </div>
                  <div className="mt-1.5 text-[10px] text-slate-500 flex justify-between items-center border-t border-slate-800/40 pt-1.5">
                    <span>Confidence Level</span>
                    <span className={getConfidenceColor(pred.probability_percentage)}>{pred.probability_percentage}%</span>
                  </div>
                  {pred.estimated_resolution_at && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800/40">
                      <ResolutionBadgeCompact
                        estimated_resolution_at={pred.estimated_resolution_at}
                        resolution_confidence={pred.resolution_confidence}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {filteredByType.length > PREVIEW_COUNT && !showAllWarnings && (
          <button 
            onClick={() => setShowAllWarnings(true)}
            className="w-full text-center text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold py-2 mt-3 bg-slate-900/40 border border-slate-800/80 rounded-xl hover:bg-slate-900/70 transition-all duration-200"
          >
            See More
          </button>
        )}
        {showAllWarnings && filteredByType.length > PREVIEW_COUNT && (
          <button 
            onClick={() => setShowAllWarnings(false)}
            className="w-full text-center text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold py-2 mt-3 bg-slate-900/40 border border-slate-800/80 rounded-xl hover:bg-slate-900/70 transition-all duration-200"
          >
            See Less
          </button>
        )}
      </div>

      {/* BMKG Earthquake Live Telemetry Section */}
      <div className="pt-4 border-t border-slate-800/80">
        <div className="flex items-center space-x-2 text-slate-100 font-bold text-lg mb-3">
          <Layers className="w-5 h-5 text-red-500 animate-pulse" />
          <h2>BMKG Live Earthquakes</h2>
        </div>
        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {earthquakes.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl">
              <p className="text-xs text-slate-500 font-medium">No recent earthquakes recorded.</p>
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
                      ? 'border-red-500 bg-red-500/10 shadow-[0_0_12px_rgba(239,68,68,0.25)]' 
                      : 'border-slate-800 bg-slate-900/30 hover:border-slate-700/80'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-semibold text-slate-200 truncate">{eq.wilayah}</span>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                      isMajor ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                    }`}>
                      M {eq.magnitude.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                    <span>{new Date(eq.datetime).toLocaleDateString()}</span>
                    <span>{new Date(eq.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {eq.potensi && (
                    <div className="text-[9.5px] text-indigo-400/90 font-semibold italic border-t border-slate-800/20 pt-1 mt-1">
                      {eq.potensi}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/20">
                    <span className="text-[10px] text-slate-500 font-medium">Depth: {eq.depth}</span>
                    <button
                      onClick={() => onSelectEarthquake && onSelectEarthquake(isSelected ? null : eq)}
                      className={`text-[9px] px-2 py-0.5 rounded font-extrabold tracking-wider uppercase transition-all duration-200 ${
                        isSelected 
                          ? 'bg-red-600 text-white shadow-glow animate-pulse'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
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
        <div className="flex-1 flex flex-col space-y-6 pt-4 border-t border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 font-semibold mb-1">
              <MapPin className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Selected Zone Analysis</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">{selectedPrediction?.zone?.name ?? 'Unknown Zone'}</h1>
            
            <div className="grid grid-cols-1 gap-3 mt-4">
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-2 text-center">
                <p className="text-[10px] text-slate-400">Baseline Speed</p>
                <p className="text-lg font-bold text-slate-200">{selectedPrediction?.zone?.traffic_speed_baseline ?? 'N/A'} <span className="text-xs font-normal">km/h</span></p>
              </div>
            </div>
          </div>

          {/* Dynamic Infrastructure POI Section */}
          <div className="space-y-3 pt-2 border-t border-slate-800/50">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-400" />
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
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400 font-bold'
                      : 'border-slate-800 bg-slate-900/30 text-slate-400 hover:text-slate-200'
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
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800/60 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-2 min-w-0">
                        {getPoiIcon(poi.category)}
                        <span className="font-semibold text-slate-200 truncate">{poi.name}</span>
                      </div>
                      <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500 bg-slate-950/60 px-1.5 py-0.5 rounded shrink-0 ml-2">
                        {poi.category.replace('_', ' ')}
                      </span>
                    </div>
                    {poi.crowd_score != null ? (
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[9px] text-slate-500 font-semibold">👥 Crowd</span>
                          <span className={`text-[9px] font-bold ${
                            poi.crowd_score >= 65 ? 'text-red-400' :
                            poi.crowd_score >= 35 ? 'text-amber-400' : 'text-emerald-400'
                          }`}>
                            {poi.crowd_score >= 65 ? 'High' : poi.crowd_score >= 35 ? 'Moderate' : 'Low'}
                            <span className="font-normal text-slate-500 ml-1">({Math.round(poi.crowd_score)})</span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
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
                      <span className="text-[9px] text-slate-600">No crowd data</span>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  No matching facilities found in this geofence.
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Weather & Speed Projections */}
          <div className="flex-1 flex flex-col space-y-4 pt-2 border-t border-slate-800/50">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-300 flex items-center space-x-2">
                <CloudRain className="w-4 h-4 text-sky-400" />
                <span>{selectedHours}-Hour Forecast Projections</span>
              </h3>
              
              <div className="flex bg-slate-900 border border-slate-800/60 rounded-lg p-0.5 space-x-0.5">
                {[3, 6, 12, 24].map(h => {
                  const isActive = selectedHours === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setSelectedHours(h)}
                      className={`text-[9px] px-2 py-0.5 rounded font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold'
                          : 'border border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>

            {timelineLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                Analyzing spatial indexes and streaming API updates...
              </div>
            ) : timelineData && timelineData.timeline && timelineData.timeline.length > 0 ? (
              <div className="space-y-6 flex-1">
                {/* Weather Chart */}
                <div className="h-44 w-full bg-slate-950/40 border border-slate-900 rounded-xl p-3 flex flex-col">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Rainfall &amp; Humidity Forecast</span>
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
                        <XAxis dataKey="time" stroke="#475569" fontSize={9} />
                        <YAxis yAxisId="left" stroke="#38bdf8" fontSize={9} unit="%" domain={[0, 100]} />
                        <YAxis yAxisId="right" orientation="right" stroke="#6636f1" fontSize={9} unit="mm" />
                        <ChartTooltip 
                          contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '10px' }}
                        />
                        <Area yAxisId="left" type="monotone" dataKey="probability" fill="#38bdf8" stroke="#38bdf8" fillOpacity={0.15} name="Humidity (%)" />
                        <Bar yAxisId="right" dataKey="rain" fill="#6366f1" radius={[2, 2, 0, 0]} name="Rain (mm)" />
                        {nowLabel && (
                          <ReferenceLine 
                            yAxisId="left"
                            x={nowLabel} 
                            stroke="#ef4444" 
                            strokeWidth={1.5}
                            strokeDasharray="3 3" 
                            label={{ value: 'NOW', position: 'insideTopLeft', fill: '#f87171', fontSize: 8, fontWeight: 'bold' }} 
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Speed Drop Chart */}
                <div className="h-44 w-full bg-slate-950/40 border border-slate-900 rounded-xl p-3 flex flex-col">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Speed Degradation Curve</span>
                    <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
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
                        <XAxis dataKey="time" stroke="#475569" fontSize={9} />
                        <YAxis stroke="#94a3b8" fontSize={9} unit="km/h" />
                        <ChartTooltip 
                          contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px' }}
                          labelStyle={{ color: '#e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '10px' }}
                        />
                        {(timelineData?.timeline || []).filter(d => d.speed != null).length >= 2 ? (
                          <>
                            <Line type="monotone" dataKey="speed" stroke="#f43f5e" strokeWidth={2.5} dot={false} activeDot={false} name="Expected Speed" />
                            <ReferenceLine y={selectedPrediction?.zone?.traffic_speed_baseline ?? 40} stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: 'Baseline', position: 'insideBottomRight', fill: '#64748b', fontSize: 8 }} />
                          </>
                        ) : (
                          <text x="50%" y="50%" textAnchor="middle" fill="#475569" fontSize={11}>No traffic snapshot data</text>
                        )}
                        {nowLabel && (
                          <ReferenceLine 
                            x={nowLabel} 
                            stroke="#ef4444" 
                            strokeWidth={1.5}
                            strokeDasharray="3 3" 
                            label={{ value: 'NOW', position: 'insideTopLeft', fill: '#f87171', fontSize: 8, fontWeight: 'bold' }} 
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                Select a polygon zone on the map to visualize predictions.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center items-center text-center p-8 border-t border-slate-800 text-slate-400 space-y-2">
          <MapPin className="w-8 h-8 text-slate-600 animate-bounce" />
          <p className="text-sm font-semibold">No Zone Geofence Inspected</p>
          <p className="text-xs text-slate-500 max-w-xs">
            Select an active warning card from the top feed or click a zone directly on the map to query PostGIS logs and construct risk timelines.
          </p>
        </div>
      )}

      </div>
    </div>
  );
}
