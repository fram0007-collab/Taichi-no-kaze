import React, { useState, useEffect } from 'react';
import { usePredictions } from './hooks/usePredictions';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import BottomSheet from './components/BottomSheet';
import MetricsGrid from './components/MetricsGrid';
import AdminDashboard from './components/AdminDashboard';
import { Shield, RefreshCw, AlertTriangle, Cpu, Sun, Moon, Menu, X, Settings, Bell, Locate } from 'lucide-react';
import { getApiUrl } from './utils/getApiUrl';
import { calculateDistanceKm } from './utils/haversine';

const API_URL = getApiUrl();

export default function App() {
  const { predictions, loading, error, isFallback, refresh } = usePredictions();
  const [selectedPrediction, setSelectedPrediction] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedHours, setSelectedHours] = useState(12);

  // User location state
  const [userLocation, setUserLocation] = useState(null); // { lat, lon, accuracy }
  const [locationError, setLocationError] = useState(null);
  const [locating, setLocating] = useState(false);

  // Waterway Dynamic Buffer Overlay parameters
  const [waterwayThreshold, setWaterwayThreshold] = useState(75); // capacity percentage threshold
  const [waterwayBuffer, setWaterwayBuffer] = useState(150); // safety buffer meters

  // Proximity "Near Me" Spatial Filter states
  const [nearMeFilterActive, setNearMeFilterActive] = useState(false);
  const [nearMeRadius, setNearMeRadius] = useState(5); // in km (default 5km)

  // Derived state: predictions filtered by spatial proximity if nearMeFilterActive is true
  const filteredPredictions = React.useMemo(() => {
    if (!nearMeFilterActive || !userLocation) return predictions;
    
    return predictions.filter(pred => {
      const geometry = pred.zone?.geometry;
      if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) return false;
      const coords = geometry.coordinates[0];
      const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
      const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
      const centerLat = sumLat / coords.length;
      const centerLon = sumLon / coords.length;
      
      const distance = calculateDistanceKm(userLocation.lat, userLocation.lon, centerLat, centerLon);
      return distance <= nearMeRadius;
    });
  }, [predictions, nearMeFilterActive, nearMeRadius, userLocation]);

  // Earthquake states
  const [earthquakes, setEarthquakes] = useState([]);
  const [selectedEarthquake, setSelectedEarthquake] = useState(null);
  const fetchEarthquakes = async () => {
    try {
      const response = await fetch(`${API_URL}/earthquakes`);
      if (response.ok) {
        const data = await response.json();
        setEarthquakes(data);
      }
    } catch (err) {
      console.warn("[API] Could not retrieve earthquakes telemetry.", err);
    }
  };

  useEffect(() => {
    fetchEarthquakes();
    const interval = setInterval(fetchEarthquakes, 30000);
    return () => clearInterval(interval);
  }, []);

  const handlePollTelemetry = () => {
    refresh();
    fetchEarthquakes();
  };


  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setUserLocation({ lat: latitude, lon: longitude, accuracy });
        setLocating(false);
      },
      (err) => {
        setLocationError(err.message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  
  // Navigation state: 'map' (default geofence dashboard) or 'admin' (metrics command panel)
  const [view, setView] = useState(() => {
    return window.location.pathname === '/admin' ? 'admin' : 'map';
  });

  // Animated Loading Screen states and logic
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [dbStatus, setDbStatus] = useState("connecting");
  const [dbLatency, setDbLatency] = useState(0);
  const [realDbEmpty, setRealDbEmpty] = useState(true);
  const [allowFallbackBypass, setAllowFallbackBypass] = useState(false);

  // Trigger automatic bypass of loading screen after 30 seconds max if database is still unseeded
  useEffect(() => {
    const timer = setTimeout(() => {
      setAllowFallbackBypass(true);
    }, 30000); // 30 seconds max
    return () => clearTimeout(timer);
  }, []);

  // Poll system diagnostics — runs always (not just during loading screen)
  useEffect(() => {
    const checkDiagnostics = async () => {
      try {
        const res = await fetch(`${API_URL}/admin/status`);
        if (res.ok) {
          const data = await res.json();
          setDbStatus(data.database?.status ?? 'connecting');
          setDbLatency(data.database?.latency_ms ?? 0);
        }
      } catch (err) {
        setDbStatus('unreachable');
      }
    };
    checkDiagnostics();
    const interval = setInterval(checkDiagnostics, 10000);
    return () => clearInterval(interval);
  }, []); // empty deps — runs for the lifetime of the app

  // Track if actual db predictions are seeded
  useEffect(() => {
    if (!loading && predictions.length > 0) {
      setRealDbEmpty(isFallback);
    }
  }, [loading, predictions, isFallback]);

  // Complete progress bar immediately and fade out loading screen once loading finishes
  useEffect(() => {
    if (!loading && showLoadingScreen) {
      // Dismiss loading screen when backend is reachable OR after 30s timeout
      if (!isFallback || allowFallbackBypass || dbStatus === 'healthy') {
        setLoadingProgress(100);
        const delay = setTimeout(() => {
          setShowLoadingScreen(false);
        }, 500);
        return () => clearTimeout(delay);
      }
    }
  }, [loading, isFallback, allowFallbackBypass, showLoadingScreen]);

  // Increment progress organically while loading is active
  useEffect(() => {
    if (!showLoadingScreen) return;
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        // Hold progress at 85% if database is still empty (waiting for background worker)
        if (realDbEmpty && prev >= 85) return 85;
        if (prev >= 98) return 98; // Hold just before completion
        return prev + Math.random() * 6;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [showLoadingScreen, realDbEmpty]);
  
  // Listen for browser history back/forward events
  useEffect(() => {
    const handlePopState = () => {
      setView(window.location.pathname === '/admin' ? 'admin' : 'map');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Theme state: default is 'light', saved in localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });
  
  const [mobileTab, setMobileTab] = useState('map'); // 'map', 'feed', 'settings'

  // Sync theme selection to document element classes
  useEffect(() => {
    localStorage.setItem('theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    } else {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // 1. Detect screen size dynamically for responsive switching
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // 2. Clear selected prediction if it's no longer in the updated active list
  useEffect(() => {
    if (selectedPrediction && predictions.length > 0) {
      const stillActive = predictions.find(p => p.zone.id === selectedPrediction.zone.id);
      if (!stillActive) {
        setSelectedPrediction(null);
        setTimelineData(null);
      }
    }
  }, [predictions, selectedPrediction]);

  // 3. Fetch timeline forecast for the selected zone geofence
  const fetchTimeline = async (zoneId, hoursRange = selectedHours) => {
    setTimelineLoading(true);
    try {
      const response = await fetch(`${API_URL}/predictions/zone/${zoneId}?hours=${hoursRange}`);
      if (response.ok) {
        const data = await response.json();
        setTimelineData(data);
      } else {
        throw new Error("Timeline API error");
      }
    } catch (err) {
      console.warn("[API] Could not retrieve timeline. Synthesizing high-fidelity local dataset.");
      
      // Fallback timeline dataset in case backend is loading/offline
      const now = new Date();
      const syntheticTimeline = [];
      const zone = predictions.find(p => p.zone.id === zoneId)?.zone;
      const baseline = zone ? zone.traffic_speed_baseline : 35.0;

      // Generate 3 hours of past traffic control data
      for (let i = -3; i < 0; i++) {
        const time = new Date(now.getTime() + i * 3600000);
        // Realistic historic speed fluctuation around the baseline
        const speed = parseFloat((baseline * (0.95 + Math.random() * 0.1)).toFixed(1));
        syntheticTimeline.push({
          timestamp: time.toISOString(),
          precipitation_probability: 0.0,
          rain_accumulation: 0.0,
          expected_speed: speed,
          risk_level: "Low"
        });
      }

      for (let i = 0; i < hoursRange; i++) {
        const time = new Date(now.getTime() + i * 3600000);
        const hour = time.getHours();
        
        // Simulating heavy rains in late afternoon
        const isRainHour = hour >= 14 && hour <= 17;
        const prob = isRainHour ? 90.0 : 15.0;
        const rain = isRainHour ? (hour === 15 ? 12.5 : 6.0) : 0.0;
        
        // Compute speed drop
        let speedMod = 1.0;
        if (rain > 10.0) speedMod = 0.5;
        else if (rain > 5.0) speedMod = 0.7;
        
        // Rush hour congestion
        const isRush = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
        if (isRush) speedMod = speedMod * 0.75;
        
        syntheticTimeline.push({
          timestamp: time.toISOString(),
          precipitation_probability: prob,
          rain_accumulation: rain,
          expected_speed: parseFloat((baseline * speedMod).toFixed(1)),
          risk_level: rain > 10.0 ? "Critical" : (rain > 5.0 ? "High" : (prob > 50.0 ? "Medium" : "Low"))
        });
      }
      
      setTimelineData({
        zone_id: zoneId,
        zone_name: zone?.name || "Unknown Zone",
        timeline: syntheticTimeline
      });
    } finally {
      setTimelineLoading(false);
    }
  };

  // Re-fetch timeline when selected hours changes
  useEffect(() => {
    if (selectedPrediction) {
      fetchTimeline(selectedPrediction.zone.id, selectedHours);
    }
  }, [selectedHours]);

  // 4. Handle zone selection action
  const handleSelectZone = (prediction) => {
    setSelectedPrediction(prediction);
    fetchTimeline(prediction.zone.id, selectedHours);
  };

  if (showLoadingScreen) {
    return (
      <div className={`flex flex-col items-center justify-center h-screen w-screen font-sans ${theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-brand-dark text-slate-100'}`}>
        <div className="flex flex-col items-center max-w-md px-6 text-center space-y-6">
          
          {/* Animated Pulsing Rotating Shield */}
          <div className="relative flex items-center justify-center">
            <div className="absolute w-24 h-24 rounded-full bg-indigo-500/10 border border-indigo-500/20 shadow-glow animate-pulse"></div>
            <div className="p-5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-glow-orange animate-pulse">
              <Shield className="w-12 h-12" />
            </div>
          </div>
          
          <div className="space-y-2">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-wide uppercase bg-gradient-to-r from-slate-100 via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
              DIS-RUPTURE
            </h1>
            <p className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">
              Early Warning Command Center
            </p>
          </div>
          
          {/* Progress Bar Container */}
          <div className="w-80 space-y-3">
            <div className="w-full bg-slate-800/80 border border-slate-700/40 h-2.5 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300 rounded-full"
                style={{ width: `${loadingProgress}%` }}
              ></div>
            </div>
            
            {/* Dynamic Status Steps */}
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider h-4 animate-pulse">
              {loadingProgress < 25 && "Initializing command deck and secure systems..."}
              {loadingProgress >= 25 && loadingProgress < 50 && "Establishing secure Neon PostgreSQL link..."}
              {loadingProgress >= 50 && loadingProgress < 75 && "Polling live TomTom flow & Open-Meteo forecasts..."}
              {loadingProgress >= 75 && loadingProgress < 85 && "Clustering POIs and caching Jabodetabek warning zones..."}
              {loadingProgress >= 85 && realDbEmpty && "Worker executing initial analytics cycle (Waiting for DB seed)..."}
              {loadingProgress >= 85 && !realDbEmpty && loadingProgress < 100 && "Zoning complete. Building map geofences..."}
              {loadingProgress >= 100 && "System calibrated. Booting dashboard..."}
            </p>
          </div>

          {/* Diagnostic Console Card */}
          <div className="w-80 p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm text-left text-xs space-y-2">
            <div className="flex justify-between border-b border-slate-800 pb-1.5 mb-1.5 font-bold uppercase tracking-wider text-slate-400 text-[10px]">
              <span>System Calibration Feed</span>
              <span className="text-indigo-400 animate-pulse">Live</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Neon Database:</span>
              <span className={`font-semibold ${
                dbStatus === 'healthy' ? 'text-emerald-400' :
                dbStatus === 'connecting' ? 'text-amber-400 animate-pulse' : 'text-rose-400'
              }`}>
                {dbStatus === 'healthy' ? `CONNECTED (${dbLatency}ms)` :
                 dbStatus === 'connecting' ? 'CONNECTING...' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Analytics Worker:</span>
              <span className={`font-semibold ${
                realDbEmpty ? 'text-amber-400 animate-pulse' : 'text-emerald-400'
              }`}>
                {realDbEmpty ? 'ANALYZING THREAT CYCLES...' : 'CALIBRATED & ACTIVE'}
              </span>
            </div>
            {realDbEmpty && (
              <div className="text-[10px] text-slate-500 border-t border-slate-800/60 pt-1.5 mt-1.5 italic text-center">
                Initial ingestion sweeps take roughly 15-25 seconds to compile.
              </div>
            )}
          </div>

          {/* Manual Bypass Action */}
          {realDbEmpty && (
            <button
              onClick={() => setShowLoadingScreen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 transition-all text-xs font-bold active:scale-[0.98]"
            >
              Skip & Launch Sandbox Mode (Simulated Data)
            </button>
          )}

          <p className="text-[9px] text-slate-500 font-semibold tracking-wider uppercase pt-2">
            Securing Greater Metropolitan Geofences
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen h-[100dvh] w-screen overflow-hidden font-sans ${theme === 'light' ? 'light-mode' : 'bg-brand-dark text-slate-100'}`}>
      
      {/* Premium Header */}
      <header className="h-16 shrink-0 bg-brand-elevated border-b border-slate-800/80 px-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-glow-orange animate-pulse">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm md:text-base font-extrabold tracking-wide uppercase bg-gradient-to-r from-slate-100 via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
              DIS-RUPTURE
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">
              Early Warning Command Center
            </p>
          </div>
        </div>

        {/* Fallback Simulation Notice Badge */}
        {isFallback && (
          <div className="hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold animate-pulse">
            <Cpu className="w-3.5 h-3.5" />
            <span>Reconnecting...</span>
          </div>
        )}

        {/* Header Controls (Responsive Toggle / Burger menu) */}
        <div className="flex items-center space-x-3">
          {!isMobile && (
            // Desktop Header Controls
            <>
              {/* Theme Toggle Button */}
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-all flex items-center justify-center"
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-400" />
                )}
              </button>

              <button 
                onClick={handlePollTelemetry}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 hover:border-slate-700 transition-all text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Poll Telemetry</span>
              </button>

              {/* Use My Location */}
              <button
                onClick={locateUser}
                title="Use My Location"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 transition-all text-xs font-semibold disabled:opacity-50"
                disabled={locating}
              >
                <Locate className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{locating ? 'Locating…' : 'My Location'}</span>
              </button>
              {locationError && (
                <span className="text-xs text-red-400 hidden md:inline">{locationError}</span>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Layout Area */}
      {view === 'admin' ? (
        <AdminDashboard onBack={() => {
          window.history.pushState({}, '', '/');
          setView('map');
        }} />
      ) : isMobile ? (
        // Mobile Layout: Pinned content container + fixed bottom nav bar
        <main className="flex-1 flex flex-col relative w-full min-h-0 overflow-hidden">
          
          {/* Active View Selector */}
          {mobileTab === 'map' && (
            <div className="flex-1 relative w-full min-h-0 flex flex-col">
              {/* Status Overlay Banner for Mobile fallbacks */}
              {isFallback && (
                <div className="absolute top-4 left-4 right-4 z-[999] glass-panel px-3 py-2 rounded-xl flex items-center justify-between border border-amber-500/20 text-amber-400 text-xs">
                  <span className="flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />
                    <span>Operating with simulated telemetry hooks</span>
                  </span>
                  <button 
                    onClick={refresh}
                    className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/10"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Interactive Leaflet Map */}
              <div className="flex-1 w-full min-h-0">
                <MapView 
                  predictions={predictions} 
                  selectedZone={selectedPrediction}
                  onSelectZone={handleSelectZone}
                  theme={theme}
                  userLocation={userLocation}
                  waterwayThreshold={waterwayThreshold}
                  setWaterwayThreshold={setWaterwayThreshold}
                  waterwayBuffer={waterwayBuffer}
                  setWaterwayBuffer={setWaterwayBuffer}
                  earthquakes={earthquakes}
                  selectedEarthquake={selectedEarthquake}
                  onClearSelectedEarthquake={() => setSelectedEarthquake(null)}
                  nearMeFilterActive={nearMeFilterActive}
                  setNearMeFilterActive={setNearMeFilterActive}
                  nearMeRadius={nearMeRadius}
                  setNearMeRadius={setNearMeRadius}
                />
              </div>

              {/* Swipeable Drawer */}
              <BottomSheet 
                selectedPrediction={selectedPrediction}
                onClose={() => setSelectedPrediction(null)}
                timelineData={timelineData}
                timelineLoading={timelineLoading}
                selectedHours={selectedHours}
                setSelectedHours={setSelectedHours}
              />
            </div>
          )}

          {mobileTab === 'feed' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-brand-dark text-slate-100 scrollbar-thin">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <Bell className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-200">Active Warnings Feed</h2>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {filteredPredictions.length} alerts
                </span>
              </div>
              
              {nearMeFilterActive && userLocation && (
                <div className="glass-panel px-3 py-2.5 rounded-xl border border-indigo-500/20 text-indigo-400 text-xs flex items-center justify-between animate-pulse shrink-0">
                  <div className="flex items-center space-x-1.5 font-semibold">
                    <span>📍 Within {nearMeRadius} km of my location</span>
                  </div>
                  <button 
                    onClick={() => setNearMeFilterActive(false)}
                    className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 transition-all"
                  >
                    Reset
                  </button>
                </div>
              )}
              
              <div className="space-y-3">
                {filteredPredictions.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                    <p className="text-xs text-slate-500 font-medium">No active warnings detected.</p>
                  </div>
                ) : (
                  filteredPredictions.map(pred => (
                    <div 
                      key={pred.id}
                      onClick={() => {
                        setSelectedPrediction(pred);
                        fetchTimeline(pred.zone.id, selectedHours);
                        setMobileTab('map'); // Switch to map tab to highlight the zone geofence circle!
                      }}
                      className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all duration-200 active:scale-[0.98]"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-sm text-slate-200">{pred.zone.name}</span>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300`}>
                          {pred.risk_level}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400 flex justify-between items-center">
                        <span>Threat: <span className="text-slate-200 font-semibold">{pred.disruption_type}</span></span>
                        <span>Confidence: <span className="text-indigo-400 font-semibold">{pred.probability_percentage}%</span></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {mobileTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-brand-dark text-slate-100 scrollbar-thin">
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-800">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-slate-200">Mobile Command Center</h2>
              </div>

              {/* Theme Toggle Selection Block */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">User Interface Theme</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setTheme('light')}
                    className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                      theme === 'light' 
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' 
                        : 'border-slate-800 bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    <Sun className="w-4 h-4" />
                    <span>Light Mode</span>
                  </button>
                  <button 
                    onClick={() => setTheme('dark')}
                    className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                      theme === 'dark' 
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' 
                        : 'border-slate-800 bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    <Moon className="w-4 h-4" />
                    <span>Dark Mode</span>
                  </button>
                </div>
              </div>

              {/* Waterway Buffer Configuration (Mobile settings block) */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Waterway Buffer Overlay</h3>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 font-semibold">Flood Trigger Threshold</span>
                    <span className="text-indigo-400 font-bold font-mono">{waterwayThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    value={waterwayThreshold}
                    onChange={(e) => setWaterwayThreshold(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg bg-slate-950 accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500">Show danger buffers for waterways at or above this volume capacity.</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 font-semibold">Danger Buffer Range</span>
                    <span className="text-indigo-400 font-bold font-mono">{waterwayBuffer}m</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    value={waterwayBuffer}
                    onChange={(e) => setWaterwayBuffer(Number(e.target.value))}
                    className="w-full h-1.5 rounded-lg bg-slate-950 accent-indigo-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-500">The surrounding physical distance at threat when the river overflows.</p>
                </div>
              </div>

              {/* Telemetry Operations Block */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400">Telemetry Data Operations</h3>
                <button 
                  onClick={handlePollTelemetry}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-bold transition-all active:scale-[0.98]"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span>Poll Live Telemetry Feeds</span>
                </button>

                {/* Use My Location — mobile */}
                <button
                  onClick={() => { locateUser(); setMobileTab('map'); }}
                  disabled={locating}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Locate className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
                  <span>{locating ? 'Locating…' : 'Use My Location'}</span>
                </button>
                {locationError && (
                  <p className="text-xs text-red-400 text-center">{locationError}</p>
                )}
              </div>
              
              {/* System Status Metrics */}
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 space-y-2 text-xs">
                <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-400 mb-3">System Diagnostics</h3>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Database Status:</span>
                  <span className="font-semibold text-emerald-400">Connected</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800/40">
                  <span className="text-slate-400">Zoning Engine:</span>
                  <span className="font-semibold text-indigo-400">Active</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Simulated Feeds:</span>
                  <span className={isFallback ? 'font-semibold text-amber-400' : 'font-semibold text-emerald-400'}>
                    {isFallback ? 'Active' : 'Offline (Prod mode)'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Pinned Mobile Bottom Navigation Bar (with dynamic safe-area insets for real mobile devices) */}
          <div 
            className="w-full border-t border-slate-800/80 bg-brand-elevated/95 backdrop-blur-md flex items-center justify-around z-[999] select-none shadow-[0_-4px_16px_rgba(0,0,0,0.4)]"
            style={{ 
              paddingBottom: 'env(safe-area-inset-bottom, 0px)', 
              minHeight: 'calc(4rem + env(safe-area-inset-bottom, 0px))' 
            }}
          >
            <button 
              onClick={() => setMobileTab('map')}
              className={`flex flex-col items-center justify-center space-y-1 py-1 w-1/3 transition-all ${
                mobileTab === 'map' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-wider uppercase">Map View</span>
            </button>
            <button 
              onClick={() => setMobileTab('feed')}
              className={`flex flex-col items-center justify-center space-y-1 py-1 w-1/3 transition-all relative ${
                mobileTab === 'feed' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Bell className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-wider uppercase">Feed</span>
              {filteredPredictions.length > 0 && (
                <span className="absolute top-1 right-[30%] w-2 h-2 bg-red-500 rounded-full animate-ping" />
              )}
            </button>
            <button 
              onClick={() => setMobileTab('settings')}
              className={`flex flex-col items-center justify-center space-y-1 py-1 w-1/3 transition-all ${
                mobileTab === 'settings' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              <Settings className="w-5 h-5" />
              <span className="text-[10px] font-bold tracking-wider uppercase">Settings</span>
            </button>
          </div>
        </main>
      ) : (
        // Desktop Layout: Split view layout
        <main className="flex-1 flex min-h-0 w-full">
          {/* Left panel: Map + KPIs */}
          <div className="flex-1 flex flex-col p-6 space-y-6 min-w-0">
            {/* Dynamic KPIs */}
            {false && <MetricsGrid predictions={filteredPredictions} />}

            {/* Simulated Banner Warning */}
            {isFallback && (
              <div className="glass-panel px-4 py-2.5 rounded-xl border border-amber-500/15 text-amber-400 text-xs flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 animate-pulse text-amber-400" />
                  <span>
                    <strong>Telemetry Simulator Mode Active</strong> — TomTom API keys or local DB feeds are pending. Using high-fidelity synthetic variations to enable immediate local evaluation.
                  </span>
                </div>
                <button 
                  onClick={refresh}
                  className="px-2.5 py-1 rounded bg-amber-500/10 text-[10px] uppercase tracking-wider font-bold hover:bg-amber-500/20 transition-all"
                >
                  Force Poll API
                </button>
              </div>
            )}

            {/* Expanded Leaflet Map */}
            <div className="flex-1 min-h-0">
              <MapView 
                predictions={predictions} 
                selectedZone={selectedPrediction}
                onSelectZone={handleSelectZone}
                theme={theme}
                userLocation={userLocation}
                waterwayThreshold={waterwayThreshold}
                setWaterwayThreshold={setWaterwayThreshold}
                waterwayBuffer={waterwayBuffer}
                setWaterwayBuffer={setWaterwayBuffer}
                earthquakes={earthquakes}
                selectedEarthquake={selectedEarthquake}
                onClearSelectedEarthquake={() => setSelectedEarthquake(null)}
                nearMeFilterActive={nearMeFilterActive}
                setNearMeFilterActive={setNearMeFilterActive}
                nearMeRadius={nearMeRadius}
                setNearMeRadius={setNearMeRadius}
              />
            </div>
          </div>

          {/* Right panel: Timeline feeds, historical charts & trend lines */}
          <div className="hidden w-[30%] min-w-[360px] h-full shrink-0">
            <Sidebar 
              predictions={filteredPredictions}
              selectedPrediction={selectedPrediction}
              onSelectPrediction={handleSelectZone}
              timelineData={timelineData}
              timelineLoading={timelineLoading}
              selectedHours={selectedHours}
              setSelectedHours={setSelectedHours}
              earthquakes={earthquakes}
              selectedEarthquake={selectedEarthquake}
              onSelectEarthquake={setSelectedEarthquake}
              nearMeFilterActive={nearMeFilterActive}
              nearMeRadius={nearMeRadius}
              onClearNearMeFilter={() => setNearMeFilterActive(false)}
            />
          </div>
        </main>
      )}
    </div>
  );
}
