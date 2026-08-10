import React from 'react';

/**
 * TourIllustrations.jsx
 * ───────────────────────────────────────────────────────────────────────────
 * Hand-built stylized SVG mockups used by FirstTimeTour — one per step.
 * These are NOT live app screenshots; they're simplified illustrations that
 * echo the real UI's shapes and colors so the tour feels connected to the
 * app without depending on real DOM elements existing yet (important since
 * the tour now doubles as the startup/loading sequence, when the real app
 * behind it may not be ready).
 *
 * All illustrations share a 320×180 viewBox for consistent layout inside
 * the tour card, and use currentColor / explicit hex matching the app's
 * indigo-purple-pink brand gradient plus severity colors (red/amber/emerald).
 * ───────────────────────────────────────────────────────────────────────────
 */

const FRAME = { rx: 16, fill: '#0f1424', stroke: '#312e5c' };

function PhoneFrame({ children, isLight }) {
  return (
    <svg viewBox="0 0 320 180" className="w-full h-full">
      <rect x="4" y="4" width="312" height="172" rx={FRAME.rx}
        fill={isLight ? '#f8fafc' : FRAME.fill}
        stroke={isLight ? '#e2e8f0' : FRAME.stroke} strokeWidth="1.5" />
      {children}
    </svg>
  );
}

export function WelcomeIllustration({ isLight }) {
  return (
    <PhoneFrame isLight={isLight}>
      <defs>
        <radialGradient id="wg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="80" r="70" fill="url(#wg)" />
      {/* Shield */}
      <path d="M160 30 L200 44 L200 84 Q200 120 160 140 Q120 120 120 84 L120 44 Z"
        fill="url(#shieldGrad)" opacity="0.95" />
      <defs>
        <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path d="M145 82 L156 93 L178 68" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Orbit dots */}
      <circle cx="90" cy="60" r="4" fill="#f472b6" opacity="0.8" />
      <circle cx="235" cy="100" r="5" fill="#34d399" opacity="0.8" />
      <circle cx="105" cy="130" r="3.5" fill="#fbbf24" opacity="0.8" />
    </PhoneFrame>
  );
}

export function MapIllustration({ isLight }) {
  return (
    <PhoneFrame isLight={isLight}>
      {/* road grid */}
      <g stroke={isLight ? '#cbd5e1' : '#2a3352'} strokeWidth="2">
        <line x1="20" y1="50" x2="300" y2="50" />
        <line x1="20" y1="110" x2="300" y2="110" />
        <line x1="80" y1="20" x2="80" y2="160" />
        <line x1="200" y1="20" x2="200" y2="160" />
      </g>
      {/* zone circles */}
      <circle cx="80" cy="50" r="26" fill="#ef4444" opacity="0.35" />
      <circle cx="80" cy="50" r="26" fill="none" stroke="#ef4444" strokeWidth="2" />
      <circle cx="200" cy="110" r="22" fill="#f59e0b" opacity="0.35" />
      <circle cx="200" cy="110" r="22" fill="none" stroke="#f59e0b" strokeWidth="2" />
      <circle cx="230" cy="45" r="16" fill="#22c55e" opacity="0.35" />
      <circle cx="230" cy="45" r="16" fill="none" stroke="#22c55e" strokeWidth="2" />
      <circle cx="130" cy="135" r="12" fill="#eab308" opacity="0.35" />
      <circle cx="130" cy="135" r="12" fill="none" stroke="#eab308" strokeWidth="2" />
      {/* pin marker */}
      <path d="M160 60 Q160 40 178 40 Q196 40 196 60 Q196 78 178 92 Q160 78 160 60 Z" fill="#6366f1" />
      <circle cx="178" cy="58" r="7" fill="white" />
    </PhoneFrame>
  );
}

export function LayersIllustration({ isLight }) {
  const rows = [
    { label: 'Hospitals', color: '#ef4444', on: true },
    { label: 'Police', color: '#3b82f6', on: true },
    { label: 'Malls', color: '#ec4899', on: false },
    { label: 'Stations', color: '#22c55e', on: true },
  ];
  return (
    <PhoneFrame isLight={isLight}>
      <rect x="70" y="18" width="180" height="144" rx="12"
        fill={isLight ? '#ffffff' : '#151b32'} stroke={isLight ? '#e2e8f0' : '#2a3352'} strokeWidth="1.5" />
      <text x="90" y="40" fontSize="11" fontWeight="700" fill={isLight ? '#334155' : '#cbd5e1'}>Layers</text>
      {rows.map((r, i) => (
        <g key={r.label} transform={`translate(90, ${55 + i * 26})`}>
          <circle cx="6" cy="0" r="5" fill={r.color} />
          <text x="20" y="4" fontSize="9.5" fill={isLight ? '#475569' : '#94a3b8'}>{r.label}</text>
          <rect x="150" y="-7" width="22" height="14" rx="7" fill={r.on ? '#6366f1' : (isLight ? '#e2e8f0' : '#334155')} />
          <circle cx={r.on ? '166' : '157'} cy="0" r="5.5" fill="white" />
        </g>
      ))}
    </PhoneFrame>
  );
}

export function ZoneDetailsIllustration({ isLight }) {
  const cards = [
    { sev: 'HIGH', color: '#ef4444', name: 'Kemang' },
    { sev: 'MEDIUM', color: '#f59e0b', name: 'Depok City Center' },
    { sev: 'MEDIUM', color: '#f59e0b', name: 'Bekasi Timur' },
  ];
  return (
    <PhoneFrame isLight={isLight}>
      {cards.map((c, i) => (
        <g key={i} transform={`translate(24, ${18 + i * 50})`}>
          <rect width="272" height="40" rx="10"
            fill={isLight ? '#ffffff' : '#151b32'} stroke={isLight ? '#e2e8f0' : '#2a3352'} strokeWidth="1.5" />
          <rect x="10" y="10" width="46" height="20" rx="6" fill={c.color} opacity="0.18" />
          <text x="14" y="24" fontSize="8" fontWeight="700" fill={c.color}>{c.sev}</text>
          <text x="66" y="24" fontSize="11" fontWeight="600" fill={isLight ? '#334155' : '#e2e8f0'}>{c.name}</text>
          <circle cx="252" cy="20" r="3" fill={c.color} />
        </g>
      ))}
    </PhoneFrame>
  );
}

export function EvacuationIllustration({ isLight }) {
  return (
    <PhoneFrame isLight={isLight}>
      {/* dashed route */}
      <path d="M40 140 Q100 60 180 80 T280 40" stroke="#6366f1" strokeWidth="3"
        strokeDasharray="6 6" fill="none" strokeLinecap="round" />
      <circle cx="40" cy="140" r="7" fill="#ef4444" />
      <circle cx="40" cy="140" r="11" fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.5" />
      <circle cx="280" cy="40" r="9" fill="#22c55e" />
      <path d="M275 40 L279 44 L286 35" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* card */}
      <rect x="30" y="150" width="260" height="0" opacity="0" />
      <rect x="60" y="12" width="200" height="30" rx="8"
        fill={isLight ? '#fff7ed' : 'rgba(245,158,11,0.12)'} stroke="#f59e0b" strokeWidth="1.2" />
      <text x="160" y="31" fontSize="10" fontWeight="700" fill="#d97706" textAnchor="middle">Get Evacuation Route</text>
    </PhoneFrame>
  );
}

export function DashboardIllustration({ isLight }) {
  const bars = [40, 70, 30, 90, 55, 65];
  return (
    <PhoneFrame isLight={isLight}>
      <rect x="20" y="16" width="130" height="60" rx="10"
        fill={isLight ? '#ffffff' : '#151b32'} stroke={isLight ? '#e2e8f0' : '#2a3352'} strokeWidth="1.5" />
      {bars.map((h, i) => (
        <rect key={i} x={30 + i * 18} y={70 - h * 0.5} width="10" height={h * 0.5}
          rx="2" fill={['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6'][i]} />
      ))}
      <rect x="160" y="16" width="140" height="144" rx="10"
        fill={isLight ? '#ffffff' : '#151b32'} stroke={isLight ? '#e2e8f0' : '#2a3352'} strokeWidth="1.5" />
      <text x="172" y="34" fontSize="9" fontWeight="700" fill={isLight ? '#334155' : '#cbd5e1'}>Zone Rankings</text>
      {[0, 1, 2].map(i => (
        <g key={i} transform={`translate(172, ${46 + i * 20})`}>
          <circle cx="6" cy="0" r="9" fill={['#ef4444', '#f59e0b', '#eab308'][i]} opacity="0.25" />
          <text x="6" y="3" fontSize="7" fontWeight="700" fill={['#ef4444', '#f59e0b', '#eab308'][i]} textAnchor="middle">{i + 1}</text>
          <rect x="22" y="-6" width="90" height="12" rx="4" fill={isLight ? '#f1f5f9' : '#1e2540'} />
        </g>
      ))}
      <rect x="20" y="88" width="130" height="72" rx="10"
        fill={isLight ? '#ffffff' : '#151b32'} stroke={isLight ? '#e2e8f0' : '#2a3352'} strokeWidth="1.5" />
      <path d="M32 140 L55 120 L75 132 L100 105 L130 118" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </PhoneFrame>
  );
}

export function NotificationsIllustration({ isLight }) {
  return (
    <PhoneFrame isLight={isLight}>
      <rect x="120" y="10" width="80" height="130" rx="18"
        fill={isLight ? '#ffffff' : '#151b32'} stroke={isLight ? '#cbd5e1' : '#334155'} strokeWidth="2" />
      <rect x="132" y="24" width="56" height="8" rx="4" fill={isLight ? '#e2e8f0' : '#2a3352'} />
      {/* notification popup */}
      <rect x="30" y="46" width="260" height="46" rx="12"
        fill={isLight ? '#eef2ff' : 'rgba(99,102,241,0.15)'} stroke="#6366f1" strokeWidth="1.5" />
      <circle cx="52" cy="69" r="12" fill="#6366f1" />
      <path d="M52 62 a7 7 0 0 1 7 7 v4 l3 3 h-20 l3 -3 v-4 a7 7 0 0 1 7 -7 Z" fill="white" transform="translate(-6,-3) scale(0.65) translate(9,4)" />
      <text x="74" y="65" fontSize="9" fontWeight="700" fill={isLight ? '#312e81' : '#c7d2fe'}>DIS-RUPTURE Alert</text>
      <text x="74" y="78" fontSize="8" fill={isLight ? '#4338ca' : '#a5b4fc'}>HIGH crowd risk detected nearby</text>
      {/* pulse rings */}
      <circle cx="52" cy="46" r="4" fill="#ef4444" />
      <circle cx="52" cy="46" r="8" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.5" />
    </PhoneFrame>
  );
}

export function ClosingIllustration({ isLight }) {
  return (
    <PhoneFrame isLight={isLight}>
      <defs>
        <radialGradient id="cg" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="160" cy="80" r="65" fill="url(#cg)" />
      <circle cx="160" cy="80" r="38" fill="url(#checkGrad)" />
      <defs>
        <linearGradient id="checkGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <path d="M144 80 L155 92 L178 66" stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="95" cy="45" r="4" fill="#6366f1" opacity="0.7" />
      <circle cx="230" cy="55" r="5" fill="#f472b6" opacity="0.7" />
      <circle cx="220" cy="120" r="3.5" fill="#fbbf24" opacity="0.7" />
      <circle cx="100" cy="120" r="4" fill="#38bdf8" opacity="0.7" />
    </PhoneFrame>
  );
}

export const ILLUSTRATIONS = {
  welcome: WelcomeIllustration,
  map: MapIllustration,
  layers: LayersIllustration,
  zonedetails: ZoneDetailsIllustration,
  evacuation: EvacuationIllustration,
  dashboard: DashboardIllustration,
  notifications: NotificationsIllustration,
  closing: ClosingIllustration,
};
