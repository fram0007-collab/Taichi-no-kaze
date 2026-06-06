import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Tooltip, useMap, useMapEvents, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Layers } from 'lucide-react';
import { getApiUrl } from '../utils/getApiUrl';
import { calculateDistanceKm } from '../utils/haversine';

// Leaflet center for Jabodetabek regional focus
const JABODETABEK_CENTER = [-6.25, 106.85];

// Inverts coordinates from GeoJSON [lon, lat] format to Leaflet [lat, lon] format
function invertCoords(geometry) {
  if (!geometry || !geometry.coordinates) return [];
  const rings = geometry.coordinates;
  return rings[0].map(coord => [coord[1], coord[0]]);
}

// Computes center [lat, lon] and radius in meters from coordinates
function getCircleParams(coords) {
  if (!coords || coords.length === 0) return { center: [0, 0], radius: 0 };
  
  let sumLat = 0;
  let sumLon = 0;
  coords.forEach(coord => {
    sumLat += coord[0];
    sumLon += coord[1];
  });
  const center = [sumLat / coords.length, sumLon / coords.length];
  
  let maxDist = 0;
  coords.forEach(c => {
    const dLat = (c[0] - center[0]) * 111000;
    const dLon = (c[1] - center[1]) * 111000 * Math.cos(center[0] * Math.PI / 180);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist > maxDist) maxDist = dist;
  });
  
  return {
    center,
    radius: maxDist * 0.8
  };
}

// Custom style mapper for geofenced zones based on their risk level
function getStyleForRisk(risk) {
  switch (risk) {
    case 'Critical':
      return {
        fillColor: '#FF2A2A',
        color: '#FF2A2A',
        weight: 3.5,
        opacity: 0.85,
        fillOpacity: 0.45,
        className: 'animate-pulse hover:fill-opacity-65 hover:opacity-95 transition-all duration-300'
      };
    case 'High':
      return {
        fillColor: '#FF7A00',
        color: '#FF7A00',
        weight: 3.0,
        opacity: 0.8,
        fillOpacity: 0.4,
        className: 'hover:fill-opacity-60 hover:opacity-90 transition-all duration-300'
      };
    case 'Medium':
      return {
        fillColor: '#FFD600',
        color: '#FFD600',
        weight: 2.5,
        opacity: 0.75,
        fillOpacity: 0.35,
        className: 'hover:fill-opacity-55 hover:opacity-85 transition-all duration-300'
      };
    case 'Low':
    default:
      return {
        fillColor: '#00E676',
        color: '#00E676',
        weight: 2.0,
        opacity: 0.7,
        fillOpacity: 0.3,
        className: 'hover:fill-opacity-50 hover:opacity-80 transition-all duration-300'
      };
  }
}

// Helper to construct highly stylized modern marker icons for different categories
const createPoiIcon = (category, isSuppressed = false) => {
  let colorClass = 'bg-emerald-500 border-emerald-300';
  let emoji = '🏪';
  if (category === 'mall') {
    colorClass = isSuppressed ? 'bg-rose-500/60 border-rose-400/50' : 'bg-rose-500 border-rose-300 shadow-rose-500/50';
    emoji = '🛍️';
  } else if (category === 'station') {
    colorClass = isSuppressed ? 'bg-blue-500/60 border-blue-400/50' : 'bg-blue-500 border-blue-300 shadow-blue-500/50';
    emoji = '🚆';
  } else if (category === 'unique_building') {
    colorClass = isSuppressed ? 'bg-purple-500/60 border-purple-400/50' : 'bg-purple-500 border-purple-300 shadow-purple-500/50';
    emoji = '🏛️';
  } else if (category === 'small_business') {
    colorClass = isSuppressed ? 'bg-amber-500/60 border-amber-400/50' : 'bg-amber-500 border-amber-300 shadow-amber-500/50';
    emoji = '🍱';
  }
  
  const bounceClass = isSuppressed ? '' : 'animate-bounce';
  const borderStyle = isSuppressed ? 'border-dashed border' : 'border-2';
  const scaleStyle = isSuppressed ? 'opacity-65 scale-90' : 'shadow-glow';

  return L.divIcon({
    html: `<div class="flex items-center justify-center w-8 h-8 rounded-full ${colorClass} text-white ${scaleStyle} ${borderStyle} ${bounceClass} cursor-pointer text-sm transform hover:scale-110 transition-all duration-200">
      <span>${emoji}</span>
    </div>`,
    className: 'custom-poi-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};
const createSafeZoneIcon = (type) => {
  let emoji = "🛟";

  if (type === "Evacuation Point") {
    emoji = "🏕️";
  } else if (type === "High Ground") {
    emoji = "⛰️";
  }

  return L.divIcon({
    html: `
      <div class="flex items-center justify-center
                  w-10 h-10 rounded-full
                  bg-emerald-500
                  border-4 border-white
                  shadow-lg text-lg">
        ${emoji}
      </div>
    `,
    className: "safe-zone-marker",
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
};
// Helper to determine styling of Jakarta's waterways based on alert and category
const getWaterwayStyle = (category, alertLevel) => {
  let color = '#2563eb'; // Default Normal Safe Blue
  let weight = 4;
  let dashArray = null;
  let pulseClass = '';

  if (alertLevel === 'Siaga 1' || alertLevel === 'Siaga 2') {
    color = '#dc2626'; // Critical Red
    pulseClass = 'animate-pulse';
    weight = 5;
  } else if (alertLevel === 'Siaga 3') {
    color = '#ea580c'; // High Orange
    pulseClass = 'animate-pulse';
    weight = 4.5;
  } else if (alertLevel === 'Siaga 4') {
    color = '#d97706'; // Caution Amber
    weight = 4;
  }

  // Adjust style based on category
  if (category === 'canal') {
    dashArray = '8, 8'; // Dashed BKB canal
    weight += 1;
  } else if (category === 'kali') {
    weight -= 1.5; // Thinner local creek
  }

  return {
    color,
    weight,
    dashArray,
    className: `transition-all duration-300 hover:opacity-90 ${pulseClass}`
  };
};

// Custom hook or component to render shape-following buffer zones dynamically on zoom
function WaterwayBufferLayer({ waterways, waterwayThreshold, waterwayBuffer, activeLayers }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom());
    map.on('zoomend', handleZoom);
    return () => { map.off('zoomend', handleZoom); };
  }, [map]);

  if (!activeLayers.waterways) return null;

  // Calculate meters per pixel at average Jakarta latitude (-6.21)
  const lat = -6.21;
  const metersPerPixel = (40075016.686 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom + 8);

  return (
    <>
      {waterways.map((waterway, idx) => {
        const isThreat = waterway.capacity_percentage >= waterwayThreshold;
        if (!isThreat) return null;

        // Calculate dynamic buffer in meters for this specific waterway based on its fill level
        // Exponential scaling to simulate rapid expansion of flood zones as capacity peaks
        // E.g., at 50% capacity -> 75m buffer; at 90% capacity -> 243m buffer; at 100% capacity -> 300m buffer
        const dynamicBufferMeters = waterwayBuffer * Math.pow(waterway.capacity_percentage / 100, 2);

        // Compute pixel weight representing the dynamic buffer distance (diameter = 2 * radius in meters)
        // We enforce a minimum weight of 20px so that it is always visibly wider than the 5px waterway line itself.
        const bufferWeight = Math.max(20, (dynamicBufferMeters * 2) / metersPerPixel);

        // Scales opacity based on risk: higher capacity = denser threat glow
        const opacity = 0.12 + (waterway.capacity_percentage / 100) * 0.22;

        return (
          <Polyline
            key={`buffer-${waterway.name}-${idx}`}
            positions={waterway.coordinates}
            pathOptions={{
              color: '#ef4444',
              weight: bufferWeight,
              opacity,
              lineCap: 'round',
              lineJoin: 'round',
              className: 'animate-pulse'
            }}
            interactive={false}
          />
        );
      })}
    </>
  );
}

// Controller component to dynamically pan/zoom the map view to the selected zone or earthquake
function MapController({ selectedZone, selectedEarthquake }) {
  const map = useMap();
  
  useEffect(() => {
    if (selectedZone && selectedZone.geometry) {
      const coords = invertCoords(selectedZone.geometry);
      if (coords.length > 0) {
        // Compute bounding box and fit bounds
        const bounds = coords.reduce((acc, curr) => {
          return [
            [Math.min(acc[0][0], curr[0]), Math.min(acc[0][1], curr[1])],
            [Math.max(acc[1][0], curr[0]), Math.max(acc[1][1], curr[1])]
          ];
        }, [[Infinity, Infinity], [-Infinity, -Infinity]]);
        
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14, animate: true, duration: 1.2 });
      }
    } else if (selectedEarthquake) {
      map.setView([selectedEarthquake.latitude, selectedEarthquake.longitude], 12, { animate: true, duration: 1.2 });
    }
  }, [selectedZone, selectedEarthquake, map]);

  return null;
}

function MapClickListener({ onClearSelectedEarthquake }) {
  useMapEvents({
    click(e) {
      // Clear selected earthquake only if clicking the general map canvas
      if (onClearSelectedEarthquake) {
        onClearSelectedEarthquake();
      }
    }
  });
  return null;
}
const SAFE_ZONES = [
  {
    id: 1,
    name: "Gelora Bung Karno",
    type: "Evacuation Point",
    capacity: 5000,
    lat: -6.218,
    lon: 106.802,
    details: "Medical support available"
  },
  {
    id: 2,
    name: "Monas High Ground",
    type: "High Ground",
    capacity: 3000,
    lat: -6.175,
    lon: 106.827,
    details: "Elevated evacuation area"
  }
];

export default function MapView({ 
  predictions = [], 
  selectedZone, 
  onSelectZone, 
  theme = 'light', 
  userLocation = null,
  waterwayThreshold = 75,
  setWaterwayThreshold,
  waterwayBuffer = 150,
  setWaterwayBuffer,
  earthquakes = [],
  selectedEarthquake = null,
  onClearSelectedEarthquake,
  nearMeFilterActive = false,
  setNearMeFilterActive,
  nearMeRadius = 5,
  setNearMeRadius
}) {
  const [globalPois, setGlobalPois] = useState([]);
  const hasActiveDisruptions = predictions.length > 0;
  const [waterways, setWaterways] = useState([]);
  const [allZones, setAllZones] = useState([]);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [activeLayers, setActiveLayers] = useState({
    mall: false,
    station: false,
    unique_building: false,
    small_business: false,
    waterways: false,
    earthquakes: false,
    safe_zones: true,
    threat_traffic: true,
    threat_weather: true,
    threat_crowd: true,
    threat_waterway: true,
    threat_earthquake: true
  });

  // Automatically enable the Earthquakes layer if an earthquake is selected
  useEffect(() => {
    if (selectedEarthquake) {
      setActiveLayers(prev => ({ ...prev, earthquakes: true }));
    }
  }, [selectedEarthquake]);

  const hasDisruptionInRadius = useMemo(() => {
    if (!userLocation || !predictions || predictions.length === 0) return false;
    return predictions.some(pred => {
      const coords = invertCoords(pred.zone.geometry);
      if (coords.length === 0) return false;
      const { center } = getCircleParams(coords);
      const distance = calculateDistanceKm(userLocation.lat, userLocation.lon, center[0], center[1]);
      return distance <= nearMeRadius;
    });
  }, [userLocation, predictions, nearMeRadius]);

  const API_URL = getApiUrl();

  // Fetch POIs catalog globally
  useEffect(() => {
    fetch(`${API_URL}/pois`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Seeding fallback');
      })
      .then(data => setGlobalPois(data))
      .catch(() => {
        console.warn("[MapView] Loading offline high-fidelity local POI stubs.");
        setGlobalPois(prev => {
          if (prev && prev.length > 0) return prev;
          return [
            // --- Jakarta Core ---
            { name: "Grand Indonesia Mall", category: "mall", lat: -6.195, lon: 106.820, is_suppressed: false },
            { name: "Plaza Indonesia", category: "mall", lat: -6.193, lon: 106.821, is_suppressed: false },
            { name: "Pacific Place Mall", category: "mall", lat: -6.224, lon: 106.810, is_suppressed: false },
            { name: "Kuningan City Mall", category: "mall", lat: -6.225, lon: 106.830, is_suppressed: false },
            { name: "Lippo Mall Kemang", category: "mall", lat: -6.273, lon: 106.815, is_suppressed: false },
            { name: "Mal Ciputra Jakarta", category: "mall", lat: -6.167, lon: 106.786, is_suppressed: false },
            { name: "Central Park Mall", category: "mall", lat: -6.177, lon: 106.790, is_suppressed: false },
            
            { name: "Sudirman MRT Station", category: "station", lat: -6.202, lon: 106.822, is_suppressed: false },
            { name: "BNI City LRT Station", category: "station", lat: -6.202, lon: 106.819, is_suppressed: false },
            { name: "Kuningan LRT Station", category: "station", lat: -6.220, lon: 106.829, is_suppressed: false },
            { name: "Grogol KRL Station", category: "station", lat: -6.161, lon: 106.789, is_suppressed: false },

            { name: "Jakarta City Hall", category: "unique_building", lat: -6.181, lon: 106.827, is_suppressed: false },
            { name: "DPR Parliament Building", category: "unique_building", lat: -6.210, lon: 106.800, is_suppressed: false },
            { name: "BPBD DKI Jakarta Office", category: "unique_building", lat: -6.175, lon: 106.820, is_suppressed: false },

            { name: "UMKM Kuliner Sabang", category: "small_business", lat: -6.187, lon: 106.824, is_suppressed: false },
            { name: "Kemang Food Festival", category: "small_business", lat: -6.2725, lon: 106.8153, is_suppressed: true },
            { name: "Grogol UMKM Street Food", category: "small_business", lat: -6.166, lon: 106.788, is_suppressed: false },

            // --- Bogor ---
            { name: "Botani Square Mall", category: "mall", lat: -6.601, lon: 106.806, is_suppressed: false },
            { name: "Bogor Railway Station", category: "station", lat: -6.594, lon: 106.789, is_suppressed: false },
            { name: "Bogor Presidential Palace", category: "unique_building", lat: -6.597, lon: 106.797, is_suppressed: false },
            { name: "UMKM Suryakencana Street Food", category: "small_business", lat: -6.604, lon: 106.800, is_suppressed: false },

            // --- Depok ---
            { name: "Margo City Mall", category: "mall", lat: -6.372, lon: 106.834, is_suppressed: false },
            { name: "Depok Baru Station", category: "station", lat: -6.391, lon: 106.818, is_suppressed: false },
            { name: "Universitas Indonesia Rectorate", category: "unique_building", lat: -6.361, lon: 106.827, is_suppressed: false },
            { name: "UMKM Margonda Culinary", category: "small_business", lat: -6.376, lon: 106.832, is_suppressed: false },

            // --- Tangerang ---
            { name: "Summarecon Mall Serpong", category: "mall", lat: -6.241, lon: 106.628, is_suppressed: false },
            { name: "Tangerang Railway Station", category: "station", lat: -6.176, lon: 106.633, is_suppressed: false },
            { name: "Tangerang City Hall", category: "unique_building", lat: -6.174, lon: 106.640, is_suppressed: false },
            { name: "UMKM Pasar Lama Tangerang", category: "small_business", lat: -6.179, lon: 106.632, is_suppressed: false },

            // --- Bekasi ---
            { name: "Summarecon Mall Bekasi", category: "mall", lat: -6.223, lon: 106.999, is_suppressed: false },
            { name: "Bekasi Railway Station", category: "station", lat: -6.235, lon: 106.999, is_suppressed: false },
            { name: "Bekasi City Hall", category: "unique_building", lat: -6.230, lon: 106.994, is_suppressed: false },
            { name: "UMKM Galaxy Food City", category: "small_business", lat: -6.269, lon: 106.974, is_suppressed: false },
          ];
        });
      });
  }, []);

  // Fetch dynamic Waterways catalog
  useEffect(() => {
    fetch(`${API_URL}/rivers`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Rivers fallback');
      })
      .then(data => setWaterways(data))
      .catch(() => {
        console.warn("[MapView] Loading offline Jakarta waterways stubs.");
        setWaterways(prev => {
          if (prev && prev.length > 0) return prev;
          return [
            { name: "Ciliwung River", category: "river", coordinates: [[-6.600, 106.800], [-6.450, 106.810], [-6.300, 106.840], [-6.250, 106.835], [-6.220, 106.828], [-6.205, 106.825], [-6.180, 106.827], [-6.150, 106.820]], current_level: 630.0, max_capacity: 1000.0, capacity_percentage: 63.0, alert_level: "Normal" },
            { name: "Cisadane River", category: "river", coordinates: [[-6.350, 106.600], [-6.300, 106.610], [-6.241, 106.628], [-6.179, 106.632], [-6.100, 106.630]], current_level: 480.0, max_capacity: 900.0, capacity_percentage: 53.3, alert_level: "Normal" },
            { name: "Kali Bekasi", category: "river", coordinates: [[-6.320, 106.995], [-6.269, 106.974], [-6.230, 106.994], [-6.180, 107.000], [-6.120, 107.010]], current_level: 310.0, max_capacity: 700.0, capacity_percentage: 44.3, alert_level: "Normal" },
            { name: "West Flood Canal (BKB)", category: "canal", coordinates: [[-6.220, 106.798], [-6.210, 106.802], [-6.198, 106.815], [-6.185, 106.798], [-6.160, 106.788]], current_level: 535.5, max_capacity: 800.0, capacity_percentage: 66.9, alert_level: "Normal" },
            { name: "Kali Grogol", category: "kali", coordinates: [[-6.240, 106.785], [-6.200, 106.782], [-6.180, 106.786], [-6.155, 106.780]], current_level: 315.0, max_capacity: 500.0, capacity_percentage: 63.0, alert_level: "Siaga 4" }
          ];
        });
      });
  }, [predictions]); // Refetch when predictions sweep updates (ensures sync)

  // Fetch ALL zone statuses (not just alerts) to show every zone on the map
  useEffect(() => {
    const fetchAllZones = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/zone-status/all`);
        if (res.ok) {
          const data = await res.json();
          setAllZones(data);
        }
      } catch (e) {
        console.warn('[MapView] Could not fetch zone statuses:', e);
      }
    };
    fetchAllZones();
    const id = setInterval(fetchAllZones, 30000);
    return () => clearInterval(id);
  }, []);

  const toggleLayer = (layerId) => {
    setActiveLayers(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  // Determine POIs to display globally
  const poisToRender = globalPois.filter(poi => activeLayers[poi.category]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-premium border border-slate-800">
      
      {/* Floating Layer Toggle Panel */}
      <div className="absolute top-4 right-4 z-[999]">

  <button
    onClick={() => setShowLayerPanel(!showLayerPanel)}
    className="glass-panel px-4 py-3 rounded-xl border border-slate-700/60 shadow-2xl text-slate-100 font-bold"
  >
    ⚙️ Layers
  </button>

  {showLayerPanel && (

    <div className="glass-panel mt-2 p-4 rounded-xl border border-slate-700/60 shadow-2xl text-slate-100 flex flex-col space-y-2.5 min-w-[175px]">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 mb-1">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span className="text-xs uppercase font-extrabold tracking-wider">Map Layer Filters</span>
        </div>
        <div className="text-[10px] uppercase font-bold text-slate-500 pt-1 pb-0.5 border-t border-slate-700/40">Threat Zones</div>
        <div className="flex flex-col space-y-1.5">
          {[
            { id: 'threat_traffic', label: 'Traffic 🚗', color: 'text-orange-400' },
            { id: 'threat_weather', label: 'Weather 🌧️', color: 'text-blue-400' },
            { id: 'threat_waterway', label: 'Flood / River 🌊', color: 'text-cyan-400' },
            { id: 'threat_crowd', label: 'Crowd 👥', color: 'text-yellow-400' },
            { id: 'threat_earthquake', label: 'Earthquake 🌋', color: 'text-red-400' }
          ].map(layer => (
            <label key={layer.id} className="flex items-center justify-between cursor-pointer group py-2.5 px-1.5 hover:bg-slate-800/30 active:bg-slate-800/50 rounded-lg transition-all">
              <span className={`text-[11px] font-semibold ${activeLayers[layer.id] ? layer.color : 'text-slate-500'} group-hover:text-slate-100 transition-colors`}>{layer.label}</span>
              <input
                type="checkbox"
                checked={activeLayers[layer.id]}
                onChange={() => toggleLayer(layer.id)}
                className="w-4 h-4 rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950/70 cursor-pointer"
              />
            </label>
          ))}

        <div className="text-[10px] uppercase font-bold text-slate-500 pt-1 pb-0.5 border-t border-slate-700/40">Map Overlays</div>
        <div className="flex flex-col space-y-2">
          {[
            { id: 'waterways', label: 'Waterways & Canals 🗺️', color: 'text-sky-400' },
            { id: 'earthquakes', label: 'Earthquake Rings 🌋', color: 'text-red-400' },
            { id: 'mall', label: 'Shopping Malls 🛍️', color: 'text-rose-400' },
            { id: 'station', label: 'Train Stations 🚆', color: 'text-blue-400' },
            { id: 'unique_building', label: 'Gov Buildings 🏛️', color: 'text-purple-400' },
            { id: 'small_business', label: 'UMKM Foods 🍱', color: 'text-amber-400' },
            { id: 'safe_zones', label: 'Safe Zones 🛟', color: 'text-emerald-400' },
          ].map(layer => (
            <label key={layer.id} className="flex items-center justify-between cursor-pointer group py-2.5 px-1.5 hover:bg-slate-800/30 active:bg-slate-800/50 rounded-lg transition-all">
              <span className={`text-[11px] font-semibold ${layer.color} group-hover:text-slate-100 transition-colors`}>{layer.label}</span>
              <input
                type="checkbox"
                checked={activeLayers[layer.id]}
                onChange={() => toggleLayer(layer.id)}
                className="w-4 h-4 rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950/70 cursor-pointer"
              />
            </label>
          ))}
        </div>
      </div>
  )}

        {/* Sliders for Waterway Buffers (Desktop view controls) */}
        {activeLayers.waterways && (
          <div className="border-t border-slate-800/80 pt-2.5 mt-1.5 space-y-2.5">
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-semibold">
                <span className="text-slate-400">Flood Trigger:</span>
                <span className="text-indigo-400 font-bold">{waterwayThreshold}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={waterwayThreshold}
                onChange={(e) => setWaterwayThreshold(Number(e.target.value))}
                className="w-full h-1 rounded bg-slate-950 accent-indigo-500 cursor-pointer"
              />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-semibold">
                <span className="text-slate-400">Max Buffer Scale:</span>
                <span className="text-indigo-400 font-bold">{waterwayBuffer}m</span>
              </div>
              <input
                type="range"
                min="50"
                max="300"
                value={waterwayBuffer}
                onChange={(e) => setWaterwayBuffer(Number(e.target.value))}
                className="w-full h-1 rounded bg-slate-950 accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Radius query control integrated in layer filters panel */}
        {userLocation && (
          <div className="border-t border-slate-800/80 pt-2.5 mt-1.5 space-y-2.5">
            <div className="flex items-center justify-between py-1 px-0.5 hover:bg-slate-800/30 active:bg-slate-800/50 rounded-lg transition-all select-none">
              <span className="text-[11px] font-extrabold uppercase text-indigo-400">Near Me Filter 📍</span>
              <input
                type="checkbox"
                checked={nearMeFilterActive}
                onChange={() => setNearMeFilterActive(!nearMeFilterActive)}
                className="w-4 h-4 rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950/70 cursor-pointer"
              />
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] font-semibold">
                <span className="text-slate-400">Query Radius:</span>
                <span className="text-indigo-400 font-bold font-mono">{nearMeRadius} km</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={nearMeRadius}
                onChange={(e) => setNearMeRadius(Number(e.target.value))}
                className="w-full h-1 rounded bg-slate-950 accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>
        )}

      </div>

      <MapContainer 
        center={JABODETABEK_CENTER} 
        zoom={10} 
        zoomControl={true}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        {/* Tiles */}
        <TileLayer
          url={theme === 'dark' 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          }
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        
        {/* Render User Location Circle first so it sits at the bottom of the z-index overlay */}
        {userLocation && (
          <>
            <Marker 
              position={[userLocation.lat, userLocation.lon]}
              icon={L.divIcon({
                html: `<div class="relative flex items-center justify-center">
                  <div class="absolute w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 shadow-glow animate-ping"></div>
                  <div class="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white shadow-md"></div>
                </div>`,
                className: 'user-location-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })}
            >
              <Popup>
                <div className="font-sans p-2 text-slate-900 dark:text-slate-100 min-w-[210px] select-none">
                  <div className="font-bold text-sm mb-1 text-slate-800 dark:text-slate-200">My Location</div>
                  <div className="text-xs text-slate-500 mb-2.5">Accuracy: ±{Math.round(userLocation.accuracy)} meters</div>
                  
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Disruptions Near Me:</span>
                      <button
                        onClick={() => setNearMeFilterActive(!nearMeFilterActive)}
                        className={`px-2.5 py-1 rounded text-[10px] font-extrabold uppercase transition-all duration-200 ${
                          nearMeFilterActive 
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white' 
                            : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {nearMeFilterActive ? 'Active' : 'Enable'}
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-slate-600 dark:text-slate-400">
                        <span>Search Radius:</span>
                        <span className="text-indigo-500 dark:text-indigo-400 font-bold font-mono">{nearMeRadius} km</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        value={nearMeRadius}
                        onChange={(e) => setNearMeRadius(Number(e.target.value))}
                        className="w-full h-1 rounded bg-slate-200 dark:bg-slate-900 accent-indigo-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>

            <Circle
              center={[userLocation.lat, userLocation.lon]}
              radius={nearMeRadius * 1000}
              interactive={false}
              pathOptions={{ 
                color: hasDisruptionInRadius ? '#f97316' : '#3b82f6', 
                fillColor: hasDisruptionInRadius ? '#f97316' : '#3b82f6', 
                fillOpacity: nearMeFilterActive ? 0.08 : 0.03,
                weight: nearMeFilterActive ? 1.5 : 0.8,
                dashArray: nearMeFilterActive ? '5, 5' : null
              }}
            >
              <Tooltip sticky>
                <div className="font-sans p-1 text-slate-100 font-semibold text-xs">
                  {hasDisruptionInRadius ? '🟠 Warning: Disruptions inside Search Radius' : '🔵 Search Radius geofence'} ({nearMeRadius} km)
                </div>
              </Tooltip>
            </Circle>
          </>
        )}
        
        {/* Render geofenced zones */}
        {predictions.length > 0 && predictions.map(pred => {
          const zone = pred.zone;
          const coords = invertCoords(zone.geometry);
          const isSelected = selectedZone && selectedZone.zone.id === zone.id;
          
          if (coords.length === 0) return null;
          
          const { center, radius } = getCircleParams(coords);
          const riskStyle = getStyleForRisk(pred.risk_level);
          
          // Compute if inside proximity filter
          let isOutOfRadius = false;
          let distanceStr = '';
          if (nearMeFilterActive && userLocation) {
            const distance = calculateDistanceKm(userLocation.lat, userLocation.lon, center[0], center[1]);
            if (distance > nearMeRadius) {
              isOutOfRadius = true;
            } else {
              distanceStr = `${distance.toFixed(1)} km`;
            }
          }

          // Modify path styling if out of radius or selected
          let pathOptions = riskStyle;
          if (isOutOfRadius) {
            pathOptions = {
              ...riskStyle,
              fillOpacity: 0.01,
              opacity: 0.04,
              weight: 0.5,
              className: 'transition-all duration-300 pointer-events-none'
            };
          } else if (isSelected) {
            pathOptions = { ...riskStyle, weight: 4, fillOpacity: 0.4, opacity: 0.8, dashArray: '6, 6' };
          }

          return (
            <Circle
              key={zone.id}
              center={center}
              radius={radius}
              pathOptions={pathOptions}
              interactive={!isOutOfRadius}
              eventHandlers={{
                click: () => onSelectZone(pred)
              }}
            >
              <Tooltip sticky>
                <div className="font-sans p-1 text-slate-100">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm">{zone.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      pred.risk_level === 'Critical' ? 'bg-red-500/20 text-red-400' :
                      pred.risk_level === 'High' ? 'bg-orange-500/20 text-orange-400' :
                      pred.risk_level === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {pred.risk_level}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    Threat: <span className="font-semibold text-slate-100">{pred.disruption_type}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Confidence: <span className="font-semibold text-slate-100">{pred.probability_percentage}%</span>
                  </div>
                  {distanceStr && (
                    <div className="text-[10px] text-indigo-300 font-bold border-t border-slate-700/40 pt-1 mt-1">
                      📍 {distanceStr} away from you
                    </div>
                  )}
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* Render threat zone circles */}
        {allZones.map(zs => {
          const zone = zs.zone;
          if (!zone || !zone.geometry) return null;

          const dimScores = {
            traffic: zs.traffic_score || 0,
            weather: zs.weather_score || 0,
            crowd: zs.crowd_score || 0,
            earthquake: zs.earthquake_score || 0,
            waterway: zs.waterway_score || 0,
          };

          const threatLayerMap = {
            traffic: 'threat_traffic',
            weather: 'threat_weather',
            crowd: 'threat_crowd',
            earthquake: 'threat_earthquake',
            waterway: 'threat_waterway',
          };

          let dominantActiveThreat = null;
          let dominantActiveScore = 0;
          for (const [dim, score] of Object.entries(dimScores)) {
            const layerId = threatLayerMap[dim];
            if (activeLayers[layerId] && score > dominantActiveScore) {
              dominantActiveScore = score;
              dominantActiveThreat = dim;
            }
          }

          if (!dominantActiveThreat) return null;

          let riskKey = 'Low';
          if (dominantActiveScore >= 65) riskKey = 'High';
          else if (dominantActiveScore >= 35) riskKey = 'Medium';
          const riskStyle = getStyleForRisk(riskKey);

          const coords = invertCoords(zone.geometry);
          if (coords.length === 0) return null;
          const { center, radius } = getCircleParams(coords);

          const matchedPred = predictions.find(p => p.zone?.zone_id === zone.zone_id || p.zone?.id === zone.zone_id);
          const isSelected = selectedZone && (selectedZone.zone?.id === zone.zone_id || selectedZone.zone?.zone_id === zone.zone_id);

          let isOutOfRadius = false;
          let distanceStr = '';
          if (nearMeFilterActive && userLocation) {
            const distance = calculateDistanceKm(userLocation.lat, userLocation.lon, center[0], center[1]);
            if (distance > nearMeRadius) {
              isOutOfRadius = true;
            } else {
              distanceStr = `${distance.toFixed(1)} km`;
            }
          }

          let pathOptions = riskStyle;
          if (isOutOfRadius) {
            pathOptions = {
              ...riskStyle,
              fillOpacity: 0.01,
              opacity: 0.04,
              weight: 0.5,
              className: 'transition-all duration-300 pointer-events-none'
            };
          } else if (isSelected) {
            pathOptions = { ...riskStyle, weight: 4, fillOpacity: 0.4, opacity: 0.8, dashArray: '6, 6' };
          }

          return (
            <Circle
              key={zone.zone_id}
              center={center}
              radius={radius}
              pathOptions={pathOptions}
              interactive={!isOutOfRadius}
              eventHandlers={{
                click: () => matchedPred ? onSelectZone(matchedPred) : onSelectZone({ zone: { ...zone, id: zone.zone_id }, risk_level: riskKey, disruption_type: zs.dominant_risk || 'Threat', probability_percentage: zs.overall_risk_score || 0 })
              }}
            >
              <Tooltip sticky>
                <div className="font-sans p-1 text-slate-100">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm">{zone.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      riskKey === 'Critical' ? 'bg-red-500/20 text-red-400' :
                      riskKey === 'High' ? 'bg-orange-500/20 text-orange-400' :
                      riskKey === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {riskKey}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mt-1">
                    Active threat: <span className="font-semibold text-slate-100 capitalize">{dominantActiveThreat}</span>
                    <span className="ml-1 text-slate-400">({dominantActiveScore.toFixed(1)}/100)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 space-y-0.5">
                    {Object.entries(dimScores).map(([dim, score]) => score >= 25 ? (
                      <div key={dim} className="flex justify-between gap-3">
                        <span className="capitalize">{dim}</span>
                        <span className={score >= 65 ? 'text-red-400 font-bold' : score >= 35 ? 'text-yellow-400' : 'text-emerald-400'}>{score.toFixed(1)}</span>
                      </div>
                    ) : null)}
                  </div>
                  {distanceStr && (
                    <div className="text-[10px] text-indigo-300 font-bold border-t border-slate-700/40 pt-1 mt-1">
                      📍 {distanceStr} away from you
                    </div>
                  )}
                </div>
              </Tooltip>
            </Circle>
          );
        })}

        {/* Render Earthquakes if active */}
        {activeLayers.earthquakes && earthquakes.map((eq, idx) => {
          const isMajor = eq.magnitude >= 6.0;
          const threatColor = isMajor ? '#EF4444' : '#F97316';
          return (
            <Circle
              key={`eq-${eq.id || idx}`}
              center={[eq.latitude, eq.longitude]}
              radius={eq.magnitude * 5000}
              pathOptions={{
                color: threatColor,
                fillColor: threatColor,
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.2,
                className: 'animate-pulse'
              }}
            >
              <Popup>
                <div className="font-sans p-2.5 text-slate-900 dark:text-slate-100 min-w-[200px]">
                  <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">🚨 Earthquake Warning</span>
                    <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                      isMajor ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      M {eq.magnitude.toFixed(1)}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    <div>
                      <span className="text-slate-500">Location:</span> <span className="font-semibold">{eq.wilayah}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Depth:</span>
                      <span className="font-semibold">{eq.depth}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Potential:</span>
                      <span className="font-bold text-indigo-500 dark:text-indigo-400">{eq.potensi || 'Tidak berpotensi tsunami'}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1 mt-1 text-[10px] text-slate-400">
                      <span>Occurred:</span>
                      <span>{new Date(eq.datetime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* Render dynamic Waterways safety buffer layer beneath the actual waterways */}
        <WaterwayBufferLayer
          waterways={waterways}
          waterwayThreshold={waterwayThreshold}
          waterwayBuffer={waterwayBuffer}
          activeLayers={activeLayers}
        />

        {/* Render dynamic Waterways layers (Rivers, Canals, creeks) */}
        {activeLayers.waterways && waterways.map((waterway, idx) => (
          <Polyline
            key={`${waterway.name}-${idx}`}
            positions={waterway.coordinates}
            pathOptions={getWaterwayStyle(waterway.category, waterway.alert_level)}
          >
            <Popup>
              <div className="font-sans p-2.5 text-slate-900 dark:text-slate-100 min-w-[200px]">
                <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{waterway.name}</span>
                  <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                    waterway.alert_level === 'Siaga 1' ? 'bg-red-500/20 text-red-400' :
                    waterway.alert_level === 'Siaga 2' ? 'bg-red-400/20 text-red-400' :
                    waterway.alert_level === 'Siaga 3' ? 'bg-orange-500/20 text-orange-400' :
                    waterway.alert_level === 'Siaga 4' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-sky-500/20 text-sky-400'
                  }`}>
                    {waterway.alert_level}
                  </span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Classification:</span>
                    <span className="font-semibold capitalize text-slate-700 dark:text-slate-300">{waterway.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current Level:</span>
                    <span className="font-bold text-indigo-500 dark:text-indigo-400">{waterway.current_level} cm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Max Capacity:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{waterway.max_capacity} cm</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between text-[10px] mb-1 font-semibold text-slate-400">
                      <span>Water Vol Capacity Used:</span>
                      <span className={waterway.capacity_percentage > 85 ? 'text-red-400 animate-pulse' : 'text-slate-600 dark:text-slate-300'}>
                        {waterway.capacity_percentage}%
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          waterway.capacity_percentage > 85 ? 'bg-red-500' :
                          waterway.capacity_percentage > 70 ? 'bg-orange-500' : 'bg-sky-500'
                        }`}
                        style={{ width: `${Math.min(100, waterway.capacity_percentage)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Polyline>
        ))}

        {/* Render POIs inside selected zone (Only if they aren't already globally displayed) */}
        {!selectedZone?.zone?.pois?.some(poi => activeLayers[poi.category]) && selectedZone?.zone?.pois?.map((poi, idx) => (
          <Marker
            key={`selected-${poi.name}-${idx}`}
            position={[poi.lat, poi.lon]}
            icon={createPoiIcon(poi.category, false)}
          >
            <Popup>
              <div className="font-sans p-2 text-slate-100 min-w-[190px]">
                <div className="flex items-center space-x-1.5 mb-1.5">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{poi.name}</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 capitalize flex items-center space-x-1">
                  <span>Category:</span>
                  <span className="font-semibold text-indigo-500 dark:text-indigo-400">{poi.category.replace('_', ' ')}</span>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 border-t border-slate-200 dark:border-slate-800 pt-1.5">
                  Latitude: {poi.lat.toFixed(4)}<br/>
                  Longitude: {poi.lon.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        {/* Render Safe Zones */}
        {hasActiveDisruptions && 
         activeLayers.safe_zones &&
         SAFE_ZONES.map(zone => (
            <Marker
              key={zone.id}
              position={[zone.lat, zone.lon]}
              icon={createSafeZoneIcon(zone.type)}
            >
              <Popup>
                <div className="min-w-[220px] p-2">
                  <div className="font-bold text-lg">
                    {zone.name}
                  </div>

                  <div className="text-emerald-500 font-semibold">
                    {zone.type}
                  </div>

                  <div className="mt-2 text-sm">
                    Capacity: {zone.capacity}
                  </div>

                  <div className="text-sm mt-1">
                    {zone.details}
                  </div>
                </div>
              </Popup>
            </Marker>
        ))}

        {/* Render Global POIs based on checkbox toggles */}
        {poisToRender.map((poi, idx) => (
          <Marker
            key={`global-${poi.name}-${idx}`}
            position={[poi.lat, poi.lon]}
            icon={createPoiIcon(poi.category, poi.is_suppressed)}
          >
            <Popup>
              <div className="font-sans p-2 text-slate-100 min-w-[190px]">
                <div className="flex items-center space-x-1.5 mb-1">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{poi.name}</span>
                  {poi.is_suppressed && (
                    <span className="text-[8px] bg-red-500/20 text-red-400 border border-red-500/30 px-1 py-0.5 rounded uppercase font-extrabold tracking-wider">
                      Suppressed
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 capitalize flex items-center space-x-1">
                  <span>Category:</span>
                  <span className="font-semibold text-indigo-500 dark:text-indigo-400">{poi.category.replace('_', ' ')}</span>
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 border-t border-slate-200 dark:border-slate-800 pt-1.5">
                  Status: <span className={poi.is_suppressed ? 'text-rose-400' : 'text-emerald-400'}>
                    {poi.is_suppressed ? 'Priority-Suppressed (Ignored in Zoning)' : 'Active Zoning POI'}
                  </span><br/>
                  Latitude: {poi.lat.toFixed(4)}<br/>
                  Longitude: {poi.lon.toFixed(4)}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}


        {/* Listen for selected zone changes and reposition camera */}
        <MapController selectedZone={selectedZone?.zone} selectedEarthquake={selectedEarthquake} />

        {/* Map click listener to dismiss selection */}
        <MapClickListener onClearSelectedEarthquake={onClearSelectedEarthquake} />

        {/* Focus Popup for inspected earthquake */}
        {selectedEarthquake && (
          <Popup position={[selectedEarthquake.latitude, selectedEarthquake.longitude]} autoClose={false} closeOnClick={false}>
            <div className="font-sans p-2.5 text-slate-900 dark:text-slate-100 min-w-[200px]">
              <div className="flex items-center justify-between mb-1.5 border-b border-slate-200 dark:border-slate-800 pb-1.5">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100">🚨 Earthquake Focus</span>
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                  M {selectedEarthquake.magnitude.toFixed(1)}
                </span>
              </div>
              <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-slate-500">Location:</span> <span className="font-semibold">{selectedEarthquake.wilayah}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Depth:</span>
                  <span className="font-semibold">{selectedEarthquake.depth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Potential:</span>
                  <span className="font-bold text-indigo-500 dark:text-indigo-400">{selectedEarthquake.potensi || 'Tidak berpotensi tsunami'}</span>
                </div>
              </div>
            </div>
          </Popup>
        )}
        {predictions.length === 0 && (
          <div className="absolute bottom-6 left-6 z-[1000]">
            <div className="glass-panel rounded-xl px-4 py-3 border border-emerald-500/20 bg-emerald-500/10 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span>

                <div>
                  <div className="font-bold text-emerald-400">
                    All Clear
                  </div>

                  <div className="text-xs text-slate-300">
                    No active disruptions detected in Jabodetabek
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </MapContainer>
    </div>
  );
}
