import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/getApiUrl';
import { calculateDistanceKm } from '../utils/haversine';
import { 
   ResponsiveContainer, 
   ComposedChart, 
   Area, 
   Bar, 
   Line, 
   XAxis, 
   YAxis, 
   Tooltip as ChartTooltip, 
   LineChart,
   ReferenceLine
} from 'recharts';
import { MapPin, X, ChevronUp, ChevronDown, Clock, ShieldAlert, CloudRain, ShoppingBag, Train, Building, Store, Layers } from 'lucide-react';

export default function BottomSheet({ 
  selectedPrediction, 
  onClose,
  timelineData,
  timelineLoading,
  selectedHours = 12,
  setSelectedHours
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [poiFilter, setPoiFilter] = useState('all');
  const [globalPois, setGlobalPois] = useState([]);

  useEffect(() => {
    fetch(`${getApiUrl()}/pois`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setGlobalPois(data))
      .catch(() => {});
  }, []);

  const nearbyPois = useMemo(() => {
    if (!selectedPrediction?.zone || globalPois.length === 0) return [];
    const z = selectedPrediction.zone;
    const lat = z.latitude;
    const lon = z.longitude;
    if (!lat || !lon) return [];
    const radiusKm = ((z.radius_m ?? 1000) + 500) / 1000;
    return globalPois.filter(poi =>
      calculateDistanceKm(lat, lon, poi.lat, poi.lon) <= radiusKm
    );
  }, [selectedPrediction, globalPois]);

  if (!selectedPrediction) return null;

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
      case 'Critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'High': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'Low':
      default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    }
  };

  const getPoiIcon = (category) => {
    switch (category) {
      case 'mall': return <ShoppingBag className="w-3.5 h-3.5 text-pink-400" />;
      case 'station': return <Train className="w-3.5 h-3.5 text-blue-400" />;
      case 'hospital':        return <span className="text-sm">🏥</span>;
      case 'police':          return <span className="text-sm">🚔</span>;
      case 'university':      return <span className="text-sm">🎓</span>;
      case 'market':          return <Store className="w-3.5 h-3.5 text-amber-400" />;
      case 'unique_building': return <Building className="w-3.5 h-3.5 text-purple-400" />;
      case 'small_business':  return <Store className="w-3.5 h-3.5 text-amber-400" />;
      default: return <MapPin className="w-3.5 h-3.5 text-indigo-400" />;
    }
  };

  const filteredPois = poiFilter === 'all'
    ? nearbyPois
    : nearbyPois.filter(poi => poi.category === poiFilter);

  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 z-[1000] glass-panel rounded-t-2xl shadow-2xl transition-all duration-300 bottom-sheet-transition ${
        isOpen ? 'h-[65vh]' : 'h-14'
      }`}
    >
      {/* Drawer Drag Handle Bar */}
      <div 
        className="w-full h-14 flex items-center justify-between px-4 border-b border-slate-800 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
          <MapPin className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-sm text-slate-100">{selectedPrediction.zone.name}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getRiskColor(selectedPrediction.risk_level)}`}>
            {selectedPrediction.risk_level}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronUp className="w-5 h-5 text-slate-400" />}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expandable Content Panel */}
      {isOpen && (
        <div className="w-full h-[calc(65vh-3.5rem)] overflow-y-auto p-5 space-y-5 scrollbar-thin">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950/40 border border-slate-900 rounded-lg p-2.5 flex flex-col justify-center">
              <span className="text-[10px] text-slate-400">Predicted Disruption</span>
              <span className="font-semibold text-sm text-slate-200">{selectedPrediction.disruption_type}</span>
            </div>
            <div className="bg-slate-950/40 border border-slate-900 rounded-lg p-2.5 flex flex-col justify-center">
              <span className="text-[10px] text-slate-400">Peak Threat Horizon</span>
              <span className="font-semibold text-sm text-indigo-400">{formatTime(selectedPrediction.estimated_time_to_peak)}</span>
            </div>
          </div>

          {/* Dynamic Infrastructure POI Section */}
          <div className="space-y-3 pt-2 border-t border-slate-800/40">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Nearby Infrastructure & POIs</span>
            </h3>
            
            {/* Category Filter Tabs */}
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'all', label: 'All' },
                { id: 'hospital', label: '🏥' },
                { id: 'police', label: '🚔' },
                { id: 'university', label: '🎓' },
                { id: 'mall', label: '🏬' },
                { id: 'station', label: '🚉' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setPoiFilter(tab.id)}
                  className={`text-[9px] px-2 py-0.5 rounded font-medium border transition-all duration-200 ${
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
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
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
                <div className="text-center py-4 text-[10px] text-slate-500 border border-dashed border-slate-800 rounded-lg">
                  No matching facilities found in this geofence.
                </div>
              )}
            </div>
          </div>

          {/* Charts Container */}
          <div className="space-y-4 pt-2 border-t border-slate-800/40">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <CloudRain className="w-4 h-4 text-indigo-400" />
                <span>{selectedHours}-Hour Weather & Congestion Timeline</span>
              </h3>
              
              <div className="flex bg-slate-900 border border-slate-800/60 rounded-lg p-0.5 space-x-0.5">
                {[3, 6, 12, 24].map(h => {
                  const isActive = selectedHours === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setSelectedHours(h)}
                      className={`text-[8px] px-1.5 py-0.5 rounded font-semibold transition-all duration-200 ${
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
              <div className="py-12 text-center text-xs text-slate-500">
                Streaming PostGIS predictive updates...
              </div>
            ) : timelineData && timelineData.timeline ? (() => {
              const nowLabel = timelineData.timeline[0] ? formatTime(timelineData.timeline[0].timestamp) : null;
              return (
                <div className="space-y-4">
                  {/* Weather Chart */}
                  <div className="h-36 w-full bg-slate-950/40 border border-slate-900 rounded-xl p-2.5 flex flex-col">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Precipitation & Rain</span>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart 
                          data={timelineData.timeline.map(d => ({
                            time: formatTime(d.timestamp),
                            probability: d.humidity,
                            rain: d.rainfall
                          }))}
                          margin={{ top: 5, right: -5, left: -35, bottom: 0 }}
                        >
                          <XAxis dataKey="time" stroke="#475569" fontSize={8} />
                          <YAxis yAxisId="left" stroke="#38bdf8" fontSize={8} unit="%" />
                          <YAxis yAxisId="right" orientation="right" stroke="#6366f1" fontSize={8} unit="mm" />
                          <ChartTooltip 
                            contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px' }}
                            labelStyle={{ color: '#e2e8f0', fontSize: '9px', fontWeight: 'bold' }}
                            itemStyle={{ fontSize: '9px' }}
                          />
                          <Area yAxisId="left" type="monotone" dataKey="probability" fill="#38bdf8" stroke="#38bdf8" fillOpacity={0.12} name="Prob (%)" />
                          <Bar yAxisId="right" dataKey="rain" fill="#6366f1" radius={[1, 1, 0, 0]} name="Rain (mm)" />
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

                  {/* Speed Line Chart */}
                  <div className="h-36 w-full bg-slate-950/40 border border-slate-900 rounded-xl p-2.5 flex flex-col">
                    <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mb-2">Speed Degradation Curve</span>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart 
                          data={timelineData.timeline.map(d => ({
                            time: formatTime(d.timestamp),
                            speed: d.speed,
                            baseline: selectedPrediction.zone.traffic_speed_baseline
                          }))}
                          margin={{ top: 5, right: 0, left: -35, bottom: 0 }}
                        >
                          <XAxis dataKey="time" stroke="#475569" fontSize={8} />
                          <YAxis stroke="#94a3b8" fontSize={8} unit="km" />
                          <ChartTooltip 
                            contentStyle={{ backgroundColor: '#151d30', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px' }}
                            labelStyle={{ color: '#e2e8f0', fontSize: '9px', fontWeight: 'bold' }}
                            itemStyle={{ fontSize: '9px' }}
                          />
                          <Line type="monotone" dataKey="speed" stroke="#f43f5e" strokeWidth={2} dot={{ r: 1 }} name="Expected Speed" />
                          <Line type="dashed" dataKey="baseline" stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" dot={false} name="Baseline" />
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
              );
            })()
            : (
              <div className="text-center text-xs text-slate-400">
                Failed to construct 12-hour timeline vectors.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
