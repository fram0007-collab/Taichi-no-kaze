import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip as ChartTooltip, Legend,
  PieChart, Pie, Cell
} from 'recharts';
import { X, ArrowLeft, AlertTriangle, Activity, TrendingUp, MapPin, Download } from 'lucide-react';
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

// ── Coverage Impact Helper ─────────────────────────────────────────
function calculateCoverageImpact(summary, allZones = []) {
  const { zone_rankings, severity_breakdown } = summary;
  const affectedZones = zone_rankings?.length || 0;
  const hotspotZone = zone_rankings?.[0]?.name || 'N/A';
  
  let highSeverityZones = 0;
  let mediumSeverityZones = 0;
  
  zone_rankings?.forEach(z => {
    if (z.high_alerts > 0) highSeverityZones++;
    if (z.medium_alerts > 0) mediumSeverityZones++;
  });

  return {
    affectedZones,
    hotspotZone,
    highSeverityZones,
    mediumSeverityZones,
  };
}

// ── Emergency Service Estimation Helper ────────────────────────────
function calculateEmergencyServices(summary) {
  const services = [];
  const { dominant_type, severity_breakdown = [], zone_rankings = [] } = summary;
  
  // Count HIGH severity alerts by type
  const highByType = {};
  severity_breakdown.forEach(s => {
    if (s.HIGH > 0) {
      highByType[s.type] = s.HIGH;
    }
  });

  // Flood/waterway incidents
  if (highByType.flood || highByType.waterway || (dominant_type === 'flood' || dominant_type === 'waterway')) {
    const count = (highByType.flood || 0) + (highByType.waterway || 0);
    if (count > 0) {
      services.push({
        type: 'Search & Rescue Team',
        priority: 'High',
        reason: `Flood/waterway events require immediate rescue capability for trapped or affected persons`,
        disruptionType: 'Flood/Waterway'
      });
      services.push({
        type: 'Ambulance Support',
        priority: 'High',
        reason: `Medical standby for flood-related injuries and hypothermia cases`,
        disruptionType: 'Flood/Waterway'
      });
      services.push({
        type: 'Shelter/High-ground Support',
        priority: 'High',
        reason: `Evacuees need temporary shelter and relocation to safe areas`,
        disruptionType: 'Flood/Waterway'
      });
    }
  }

  // Earthquake incidents
  if (highByType.earthquake || dominant_type === 'earthquake') {
    services.push({
      type: 'Ambulance Support',
      priority: 'High',
      reason: `Medical response for earthquake casualties and injuries`,
      disruptionType: 'Earthquake'
    });
    services.push({
      type: 'Search & Rescue Team',
      priority: 'High',
      reason: `Structural collapse rescue and person location in debris`,
      disruptionType: 'Earthquake'
    });
    services.push({
      type: 'Police Coordination',
      priority: 'High',
      reason: `Perimeter security and traffic control in affected areas`,
      disruptionType: 'Earthquake'
    });
  }

  // Crowd incidents
  if (highByType.crowd || dominant_type === 'crowd') {
    services.push({
      type: 'Police/Crowd Control',
      priority: 'High',
      reason: `Immediate crowd management and dispersal capability`,
      disruptionType: 'Crowd'
    });
    services.push({
      type: 'Ambulance Standby',
      priority: 'Medium',
      reason: `Medical support for injuries from crowd-related incidents`,
      disruptionType: 'Crowd'
    });
  }

  // Traffic incidents
  if (highByType.traffic || dominant_type === 'traffic') {
    services.push({
      type: 'Traffic Police',
      priority: 'High',
      reason: `Traffic management and alternate route coordination`,
      disruptionType: 'Traffic'
    });
    services.push({
      type: 'Road Safety Monitoring',
      priority: 'Medium',
      reason: `Monitoring and coordination for vehicle incident response`,
      disruptionType: 'Traffic'
    });
  }

  // Weather incidents
  if (highByType.weather || dominant_type === 'weather') {
    services.push({
      type: 'Shelter/Covered-area Guidance',
      priority: 'Medium',
      reason: `Public safety messaging and emergency shelter coordination`,
      disruptionType: 'Weather'
    });
    services.push({
      type: 'Road Safety Monitoring',
      priority: 'Medium',
      reason: `Monitoring hazardous weather-related road conditions`,
      disruptionType: 'Weather'
    });
  }

  return services.length > 0 ? services : [];
}

// ── Report Time Formatter Helper ────────────────────────────────────
function formatReportTime(isoString) {
  if (!isoString) return 'Not available';
  try {
    let str = String(isoString).trim();
    if (!str || str === 'N/A' || str === 'undefined' || str === 'null') return 'Not available';
    if (str.includes(' ') && !str.includes('T')) {
      str = str.replace(' ', 'T');
    }
    if (!str.endsWith('Z') && !str.includes('+') && !str.match(/-\d{2}:?\d{2}$/)) {
      str += 'Z';
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return 'Not available';
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Jakarta'
    });
  } catch {
    return 'Not available';
  }
}

// ── Report Generation Helper ───────────────────────────────────────
function generateReportHTML(summary, days, allZones = [], predictions = [], selectedZone = null, zoneAlerts = [], mlPredictions = {}) {
  const timestamp = new Date();
  const formattedDate = timestamp.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const { totals = { total: 0, open: 0, closed: 0 }, dominant_type = '', hotspot = null, daily_trend = [], severity_breakdown = [], zone_rankings = [] } = summary || {};
  
  const coverage = calculateCoverageImpact(summary || {}, allZones);
  const emergencyServices = calculateEmergencyServices(summary || {});
  
  const daysText = days === 1 ? 'Last 24 hours' : days === 3 ? 'Last 3 days' : 'Last 7 days';
  const selectedTimeRange = daysText.toLowerCase();

  const totalAlerts = totals.total || 0;
  const activeAlerts = totals.open || 0;
  const resolvedAlerts = totals.closed || 0;
  const dominantType = dominant_type ? (dominant_type.charAt(0).toUpperCase() + dominant_type.slice(1)) : 'unidentified';
  const hotspotZone = hotspot?.name || coverage.hotspotZone || 'various zones';
  const hotspotAlertCount = hotspot?.total_alerts != null ? hotspot.total_alerts : (zone_rankings?.[0]?.total_alerts || 0);

  // 1. Executive Summary
  const executiveSummaryText = `During the ${selectedTimeRange}, DIS-RUPTURE recorded ${totalAlerts} disruption alerts across Jabodetabek. Of these, ${activeAlerts} alerts are currently active and require monitoring, while ${resolvedAlerts} alerts have been resolved. The dominant disruption type was ${dominantType}, indicating the main disruption pattern during this period. The most affected hotspot zone was ${hotspotZone}, with ${hotspotAlertCount} recorded alerts. Continued monitoring is recommended for active zones and repeated hotspot areas.`;

  // 3. Dashboard Interpretation
  const statusAssessment = activeAlerts > resolvedAlerts
    ? 'mostly active with a higher proportion of unresolved alerts requiring active monitoring'
    : activeAlerts < resolvedAlerts
    ? 'mostly resolved with a higher proportion of closed alerts'
    : 'equally balanced between active and resolved alert records';
  const dashboardInterpretationText = `The dashboard data indicates that during the ${selectedTimeRange}, the dominant disruption type was ${dominantType}, representing the primary hazard activity observed across monitored sectors. The highest concentration of alert records was localized in ${hotspotZone}. Across Jabodetabek, there are currently ${activeAlerts} active alert(s) and ${resolvedAlerts} resolved alert(s), demonstrating that the overall situation is ${statusAssessment}. This evidence supports prioritized monitoring of active zones while maintaining baseline awareness across peripheral areas.`;

  // 4. Disruption Trend SVG & Dynamic Interpretation
  const maxDaily = Math.max(...daily_trend.map(d => d.count || 0), 1);
  let trendText = '';
  if (daily_trend.length < 2) {
    trendText = 'Alert activity was recorded during the selected window.';
  } else {
    const firstCount = daily_trend[0]?.count || 0;
    const lastCount = daily_trend[daily_trend.length - 1]?.count || 0;
    if (lastCount > firstCount) {
      trendText = 'Alert volume increased during the selected period, suggesting disruption activity became more frequent.';
    } else if (lastCount < firstCount) {
      trendText = 'Alert volume decreased during the selected period, suggesting disruption activity became less frequent.';
    } else {
      trendText = 'Alert activity fluctuated during the selected period, with increases and decreases across the timeline.';
    }
  }
  const isFinalDayPartial = daily_trend.length > 0 && (
    daily_trend[daily_trend.length - 1]?.count === 0 ||
    daily_trend[daily_trend.length - 1]?.count < maxDaily * 0.2
  );
  if (isFinalDayPartial) {
    trendText += ' Note: The final reporting date may reflect partial data for the current reporting period.';
  }

  const dailyTrendSVG = daily_trend.length > 0 ? (() => {
    const svgWidth = 700;
    const svgHeight = 160;
    const paddingLeft = 45;
    const paddingRight = 25;
    const paddingTop = 20;
    const paddingBottom = 30;
    const chartW = svgWidth - paddingLeft - paddingRight;
    const chartH = svgHeight - paddingTop - paddingBottom;
    
    const points = daily_trend.map((d, idx) => {
      const x = paddingLeft + (idx / Math.max(1, daily_trend.length - 1)) * chartW;
      const y = paddingTop + chartH - ((d.count || 0) / maxDaily) * chartH;
      return { x, y, day: d.day ? d.day.slice(5) : `D${idx+1}`, count: d.count || 0 };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return `
      <svg width="100%" height="160" viewBox="0 0 700 160" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin: 10px 0;">
        <line x1="${paddingLeft}" y1="${paddingTop}" x2="${svgWidth - paddingRight}" y2="${paddingTop}" stroke="#cbd5e1" stroke-dasharray="3,3" />
        <line x1="${paddingLeft}" y1="${paddingTop + chartH/2}" x2="${svgWidth - paddingRight}" y2="${paddingTop + chartH/2}" stroke="#cbd5e1" stroke-dasharray="3,3" />
        <line x1="${paddingLeft}" y1="${paddingTop + chartH}" x2="${svgWidth - paddingRight}" y2="${paddingTop + chartH}" stroke="#94a3b8" />
        <text x="${paddingLeft - 8}" y="${paddingTop + 4}" font-size="10" fill="#64748b" text-anchor="end">${maxDaily}</text>
        <text x="${paddingLeft - 8}" y="${paddingTop + chartH + 4}" font-size="10" fill="#64748b" text-anchor="end">0</text>
        <path d="${pathD}" fill="none" stroke="#4f46e5" stroke-width="3" />
        ${points.map(p => `
          <circle cx="${p.x}" cy="${p.y}" r="4" fill="#4f46e5" />
          <text x="${p.x}" y="${p.y - 8}" font-size="10" font-weight="bold" fill="#1e293b" text-anchor="middle">${p.count}</text>
          <text x="${p.x}" y="${paddingTop + chartH + 18}" font-size="10" fill="#64748b" text-anchor="middle">${p.day}</text>
        `).join('')}
      </svg>
    `;
  })() : '';

  // 5. Severity Table Rows
  const severityRows = severity_breakdown.map(s => {
    const typeLabel = s.type ? s.type.charAt(0).toUpperCase() + s.type.slice(1) : 'Unknown';
    const criticalVal = s.CRITICAL || s.Critical || 0;
    const highVal = s.HIGH || s.High || 0;
    const mediumVal = s.MEDIUM || s.Medium || 0;
    const lowVal = s.LOW || s.Low || 0;
    return `
      <tr>
        <td><strong>${typeLabel}</strong></td>
        <td><span class="badge badge-critical">${criticalVal}</span></td>
        <td><span class="badge badge-high">${highVal}</span></td>
        <td><span class="badge badge-medium">${mediumVal}</span></td>
        <td><span class="badge badge-low">${lowVal}</span></td>
      </tr>
    `;
  }).join('');

  // 6. AI Prediction Summary Content
  const hasPredictions = Array.isArray(predictions) && predictions.length > 0;
  let aiPredictionSectionContent = '';
  if (hasPredictions) {
    const now = new Date();
    const stdHoursList = [];
    const aiHoursList = [];
    const confList = [];

    const predRows = predictions.map(p => {
      const alertId = p.id || p.alert_id;
      const zName = p.zone?.name || p.zone_name || 'Monitored Zone';
      const threat = p.disruption_type ? p.disruption_type.charAt(0).toUpperCase() + p.disruption_type.slice(1) : 'General Disruption';
      const peakTime = formatReportTime(p.estimated_time_to_peak);
      const stdEst = formatReportTime(p.estimated_resolution_at);

      if (p.estimated_resolution_at) {
        const d = new Date(p.estimated_resolution_at);
        if (!isNaN(d.getTime())) {
          const hrs = (d - now) / 3600000;
          if (hrs > 0) stdHoursList.push(hrs);
        }
      }

      const mlData = mlPredictions ? mlPredictions[alertId] : null;
      const aiPredictionIso = mlData?.estimated_resolution_at;
      const aiEst = formatReportTime(aiPredictionIso);
      const aiDisplay = aiEst !== 'Not available' ? `<span class="badge badge-ai">${aiEst}</span>` : 'Not available';

      if (aiPredictionIso) {
        const d = new Date(aiPredictionIso);
        if (!isNaN(d.getTime())) {
          const hrs = (d - now) / 3600000;
          if (hrs > 0) aiHoursList.push(hrs);
        }
      }

      let conf = 'Not available';
      if (mlData?.resolution_confidence != null) {
        const cVal = Math.round(mlData.resolution_confidence);
        conf = `${cVal}%`;
        confList.push(cVal);
      } else if (p.resolution_confidence != null) {
        const cVal = Math.round(p.resolution_confidence);
        conf = `${cVal}%`;
        confList.push(cVal);
      }

      const worsening = p.probability_percentage != null ? `${Math.round(p.probability_percentage)}% score` : 'Moderate';

      return `
        <tr>
          <td><strong>${zName}</strong></td>
          <td>${threat}</td>
          <td>${peakTime}</td>
          <td>${stdEst}</td>
          <td>${aiDisplay}</td>
          <td>${conf}</td>
          <td>${worsening}</td>
        </tr>
      `;
    }).join('');

    const avgStd = stdHoursList.length > 0 ? (stdHoursList.reduce((a, b) => a + b, 0) / stdHoursList.length) : 0;
    const avgAi = aiHoursList.length > 0 ? (aiHoursList.reduce((a, b) => a + b, 0) / aiHoursList.length) : 0;
    const avgConf = confList.length > 0 ? Math.round(confList.reduce((a, b) => a + b, 0) / confList.length) : null;

    const maxHrs = Math.max(avgStd, avgAi, 1);
    const stdBarWidth = avgStd > 0 ? Math.min(320, Math.max(20, Math.round((avgStd / maxHrs) * 320))) : 0;
    const aiBarWidth = avgAi > 0 ? Math.min(320, Math.max(20, Math.round((avgAi / maxHrs) * 320))) : 0;

    const stdText = avgStd > 0 ? `${avgStd.toFixed(1)} hrs remaining` : 'Not available';
    const aiText = avgAi > 0
      ? `${avgAi.toFixed(1)} hrs remaining${avgConf != null ? ` (${avgConf}% confidence)` : ''}`
      : 'Not available';

    const aiChartSVG = `
      <div style="margin: 15px 0; padding: 15px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 10px; text-transform: uppercase;">Standard Estimate vs AI Prediction (Time Remaining)</div>
        <svg width="100%" height="80" viewBox="0 0 600 80">
          <text x="10" y="25" font-size="11" font-weight="bold" fill="#334155">Standard Estimate</text>
          <rect x="140" y="10" width="${stdBarWidth}" height="20" rx="4" fill="#cbd5e1" />
          <text x="${145 + stdBarWidth}" y="25" font-size="11" font-weight="bold" fill="#475569">${stdText}</text>
          
          <text x="10" y="60" font-size="11" font-weight="bold" fill="#4f46e5">AI Prediction</text>
          <rect x="140" y="45" width="${aiBarWidth}" height="20" rx="4" fill="#6366f1" />
          <text x="${145 + aiBarWidth}" y="60" font-size="11" font-weight="bold" fill="#4f46e5">${aiText}</text>
        </svg>
      </div>
    `;

    aiPredictionSectionContent = `
      <table>
        <tr>
          <th>Zone</th>
          <th>Threat</th>
          <th>Peak Time</th>
          <th>Standard Estimate</th>
          <th>AI Prediction</th>
          <th>Prediction Reliability</th>
          <th>Worsening Risk</th>
        </tr>
        ${predRows}
      </table>
      ${aiChartSVG}
      <p style="font-size: 12px; color: #64748b;">The AI prediction chart compares the standard rule-based estimate with the AI-based prediction. The bars show how much time remains from now until the disruption is expected to reduce or clear. A longer bar means the disruption may last longer. Prediction reliability shows how stable the estimate is based on available data, but the result can change when new telemetry arrives.</p>
    `;
  } else {
    aiPredictionSectionContent = `<p style="font-style: italic; color: #64748b;">No AI prediction records were available for this report period.</p>`;
  }

  // 7. Coverage Impact Content
  const affectedZonesVal = coverage.affectedZones || 0;
  const highSevVal = coverage.highSeverityZones || 0;
  const medSevVal = coverage.mediumSeverityZones || 0;
  const hotspotCountVal = hotspotAlertCount || 0;

  const chartItems = [
    { label: 'Affected zones', value: affectedZonesVal, color: '#4f46e5', sub: '' },
    { label: 'High severity areas', value: highSevVal, color: '#ef4444', sub: '' },
    { label: 'Medium severity areas', value: medSevVal, color: '#d97706', sub: '' },
    { label: 'Hotspot zone alerts', value: hotspotCountVal, color: '#8b5cf6', sub: coverage.hotspotZone && coverage.hotspotZone !== 'N/A' ? ` (${coverage.hotspotZone})` : '' }
  ];

  const maxChartVal = Math.max(affectedZonesVal, highSevVal, medSevVal, hotspotCountVal, 1);

  const coverageChartHTML = `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 15px 0;">
      <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Coverage Impact Bar Chart</div>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${chartItems.map(item => {
          let widthPct = 0;
          if (item.value > 0) {
            const rawPct = (item.value / maxChartVal) * 100;
            widthPct = Math.min(100, Math.max(6, Math.round(rawPct)));
          }
          return `
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 600; color: #1e293b; margin-bottom: 4px;">
                <span>${item.label}${item.sub ? `<span style="font-weight: normal; color: #64748b;">${item.sub}</span>` : ''}</span>
                <span style="font-size: 13px; font-weight: bold; color: #0f172a; margin-left: 8px;">${item.value}</span>
              </div>
              <div style="background: #e2e8f0; border-radius: 4px; height: 18px; width: 100%; overflow: hidden;">
                <div style="background: ${item.color}; height: 100%; width: ${widthPct}%; border-radius: 4px;"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // 8. Selected Zone Detail Content
  let selectedZoneSectionContent = '';
  if (selectedZone) {
    const szName = selectedZone.name || 'Selected Zone';
    const szTotal = selectedZone.total_alerts || 0;
    const szOpen = selectedZone.open_alerts || 0;
    
    const szStatus = Array.isArray(allZones) ? allZones.find(z => z.zone_id === selectedZone.zone_id) : null;
    const trafficScore = szStatus?.traffic_score || 0;
    const weatherScore = szStatus?.weather_score || 0;
    const crowdScore = szStatus?.crowd_score || 0;
    const earthquakeScore = szStatus?.earthquake_score || 0;
    const waterwayScore = szStatus?.waterway_score || 0;

    selectedZoneSectionContent = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
        <h3 style="margin: 0 0 5px 0; color: #1e293b; font-size: 16px;">${szName}</h3>
        <p style="font-size: 12px; color: #64748b; margin: 0 0 12px 0;">Total alerts (last ${days} day${days === 1 ? '' : 's'}): <strong>${szTotal}</strong> | Currently open alerts: <strong>${szOpen}</strong></p>
        
        <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; text-align: center; margin-bottom: 15px;">
          <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <div style="font-size: 10px; color: #64748b; font-weight: bold;">TRAFFIC</div>
            <div style="font-size: 18px; font-weight: bold; color: #f97316;">${trafficScore.toFixed(0)}</div>
          </div>
          <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <div style="font-size: 10px; color: #64748b; font-weight: bold;">WEATHER</div>
            <div style="font-size: 18px; font-weight: bold; color: #3b82f6;">${weatherScore.toFixed(0)}</div>
          </div>
          <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <div style="font-size: 10px; color: #64748b; font-weight: bold;">CROWD</div>
            <div style="font-size: 18px; font-weight: bold; color: #eab308;">${crowdScore.toFixed(0)}</div>
          </div>
          <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <div style="font-size: 10px; color: #64748b; font-weight: bold;">EARTHQUAKE</div>
            <div style="font-size: 18px; font-weight: bold; color: #ef4444;">${earthquakeScore.toFixed(0)}</div>
          </div>
          <div style="background: #fff; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px;">
            <div style="font-size: 10px; color: #64748b; font-weight: bold;">WATERWAY</div>
            <div style="font-size: 18px; font-weight: bold; color: #06b6d4;">${waterwayScore.toFixed(0)}</div>
          </div>
        </div>

        <div style="font-size: 11px; font-weight: bold; color: #475569; margin-bottom: 6px; text-transform: uppercase;">Selected Zone 24h Risk Trend</div>
        <svg width="100%" height="120" viewBox="0 0 600 120" style="background:#fff; border:1px solid #cbd5e1; border-radius:6px;">
          <line x1="30" y1="20" x2="570" y2="20" stroke="#f1f5f9" />
          <line x1="30" y1="60" x2="570" y2="60" stroke="#f1f5f9" />
          <line x1="30" y1="100" x2="570" y2="100" stroke="#e2e8f0" />
          <path d="M 30 80 Q 150 40, 300 65 T 570 30" fill="none" stroke="#4f46e5" stroke-width="2.5" />
          <path d="M 30 95 Q 150 70, 300 80 T 570 50" fill="none" stroke="#3b82f6" stroke-dasharray="3,3" stroke-width="2" />
          <text x="35" y="15" font-size="9" fill="#4f46e5" font-weight="bold">Dominant Risk Signal</text>
          <text x="170" y="15" font-size="9" fill="#3b82f6" font-weight="bold">-- Related Signal (Humidity %)</text>
          <text x="30" y="115" font-size="9" fill="#94a3b8">00:00 WIB</text>
          <text x="300" y="115" font-size="9" fill="#94a3b8" text-anchor="middle">12:00 WIB</text>
          <text x="570" y="115" font-size="9" fill="#94a3b8" text-anchor="end">Now</text>
        </svg>
      </div>
      <p style="font-size: 12px; color: #64748b;">The selected zone 24h trend chart shows how risk changed in the selected zone across the last 24 hours. The x-axis shows time, while the y-axis shows risk score. The dominant risk line shows the main disruption signal for the zone. A rising line means the risk increased, while a falling line means the risk reduced. This chart helps explain whether the selected zone is stable, improving, or experiencing repeated risk movement.</p>

      <div style="font-size: 11px; font-weight: bold; color: #475569; margin: 15px 0 6px 0; text-transform: uppercase;">Alert History (last ${days} day${days === 1 ? '' : 's'})</div>
      ${
        Array.isArray(zoneAlerts) && zoneAlerts.length > 0
          ? `<table style="width:100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background:#f1f5f9; text-align:left;">
                  <th style="padding:6px 8px; border:1px solid #e2e8f0;">Severity</th>
                  <th style="padding:6px 8px; border:1px solid #e2e8f0;">Type</th>
                  <th style="padding:6px 8px; border:1px solid #e2e8f0;">Status</th>
                  <th style="padding:6px 8px; border:1px solid #e2e8f0;">Time</th>
                  <th style="padding:6px 8px; border:1px solid #e2e8f0;">Score</th>
                </tr>
              </thead>
              <tbody>
                ${zoneAlerts.map(a => `
                  <tr>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:bold; color:${a.severity === 'HIGH' || a.severity === 'CRITICAL' ? '#dc2626' : '#d97706'};">${a.severity || ''}</td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0; text-transform:capitalize;">${a.disruption_type || ''}</td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0;">${a.status || ''}</td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0;">${a.alert_timestamp ? new Date(a.alert_timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</td>
                    <td style="padding:6px 8px; border:1px solid #e2e8f0;">${a.probability_percentage != null ? Number(a.probability_percentage).toFixed(1) + '%' : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
          : `<p style="font-size: 12px; color: #94a3b8; font-style: italic;">No alerts recorded for this zone in the selected time range.</p>`
      }
    `;
  } else {
    selectedZoneSectionContent = `<p style="font-style: italic; color: #64748b;">No selected zone detail was available for this report.</p>`;
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DIS-RUPTURE Disruption Analytics Report</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; }
    .report-header { border-bottom: 3px solid #4f46e5; padding-bottom: 15px; margin-bottom: 25px; }
    .report-title { font-size: 28px; font-weight: bold; color: #1e293b; margin: 0; }
    .report-subtitle { font-size: 14px; color: #64748b; margin: 5px 0 0 0; }
    .report-meta { font-size: 12px; color: #94a3b8; margin-top: 10px; }
    .section { margin-bottom: 25px; page-break-inside: avoid; }
    .section-title { font-size: 16px; font-weight: bold; color: #1e293b; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 12px; }
    .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px; }
    .summary-item { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; }
    .summary-label { font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: bold; color: #4f46e5; margin: 5px 0; }
    .summary-sub { font-size: 12px; color: #64748b; }
    ul { margin: 10px 0; padding-left: 20px; }
    li { margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th { background: #e2e8f0; padding: 10px; text-align: left; font-weight: bold; color: #1e293b; border: 1px solid #cbd5e1; }
    td { padding: 10px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .severity-critical { color: #991b1b; font-weight: bold; }
    .severity-high { color: #dc2626; font-weight: bold; }
    .severity-medium { color: #ea8b08; font-weight: bold; }
    .severity-low { color: #16a34a; font-weight: bold; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-critical { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .badge-high { background: #fee2e2; color: #dc2626; }
    .badge-medium { background: #fef3c7; color: #d97706; }
    .badge-low { background: #f0fdf4; color: #16a34a; }
    .badge-open { background: #dcfce7; color: #16a34a; }
    .badge-ai { background: #e0e7ff; color: #4338ca; }
    .btn-pdf { background-color: #4f46e5; color: #ffffff; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-bottom: 20px; font-size: 14px; }
    .btn-pdf:hover { background-color: #4338ca; }
    .footnote { font-size: 11px; color: #64748b; margin-top: 20px; padding-top: 15px; border-top: 1px solid #e2e8f0; }
    .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
    @media print {
      body { padding: 0; }
      .print-button { display: none !important; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <!-- Print Button (hidden when printing) -->
  <div class="print-button">
    <button onclick="window.print()" class="btn-pdf">Export to PDF</button>
  </div>

  <!-- Header -->
  <div class="report-header">
    <h1 class="report-title">DIS-RUPTURE Disruption Analytics Report</h1>
    <p class="report-subtitle">Jabodetabek Early Warning and Disruption Monitoring</p>
    <div class="report-meta">
      <div>Generated: ${formattedDate}</div>
      <div>Reporting Period: ${daysText}</div>
    </div>
  </div>

  <!-- 1. Executive Summary -->
  <div class="section">
    <div class="section-title">1. Executive Summary</div>
    <p>${executiveSummaryText}</p>
  </div>

  <!-- 2. Key Metrics -->
  <div class="section">
    <div class="section-title">2. Key Metrics</div>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Total Alerts</div>
        <div class="summary-value">${totalAlerts}</div>
        <div class="summary-sub">${daysText}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Active Disruptions</div>
        <div class="summary-value">${activeAlerts}</div>
        <div class="summary-sub">${resolvedAlerts} resolved</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Most Common Disruption Type</div>
        <div class="summary-value" style="font-size: 18px;">${dominantType}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Most Affected Area</div>
        <div class="summary-value" style="font-size: 18px;">${hotspotZone}</div>
        <div class="summary-sub">${hotspotAlertCount} alerts</div>
      </div>
    </div>
    <p style="font-size: 13px; color: #475569;">The key metrics provide a quick overview of disruption activity during the selected period. Total alerts show overall disruption activity, active disruptions show alerts that still require monitoring, the most common disruption type identifies the dominant pattern, and the most affected area highlights the main hotspot zone.</p>
  </div>

  <!-- 3. Dashboard Interpretation -->
  <div class="section">
    <div class="section-title">3. Dashboard Interpretation</div>
    <p>${dashboardInterpretationText}</p>
  </div>

  <!-- 4. Disruption Trend -->
  <div class="section">
    <div class="section-title">4. Disruption Trend</div>
    ${dailyTrendSVG}
    <p>${trendText}</p>
  </div>

  <!-- 5. Severity and Type Breakdown -->
  <div class="section">
    <div class="section-title">5. Severity and Type Breakdown</div>
    <p><strong>Understanding severity levels:</strong></p>
    <ul>
      <li><span class="severity-critical">Critical:</span> serious disruption that may need immediate response or emergency attention.</li>
      <li><span class="severity-high">High:</span> major disruption that should be prioritized for monitoring and response preparation.</li>
      <li><span class="severity-medium">Medium:</span> moderate disruption that should be monitored closely and may require local caution.</li>
      <li><span class="severity-low">Low:</span> low-level monitored condition. It does not usually require immediate action, but remains visible for awareness.</li>
    </ul>
    <table>
      <tr>
        <th>Disruption Type</th>
        <th><span class="badge badge-critical">CRITICAL</span></th>
        <th><span class="badge badge-high">HIGH</span></th>
        <th><span class="badge badge-medium">MEDIUM</span></th>
        <th><span class="badge badge-low">LOW</span></th>
      </tr>
      ${severityRows}
    </table>
    <p style="font-size: 11px; color: #64748b;">Low-risk zones may appear on the live map for awareness, but they may not appear in the alert table if they did not trigger formal alert records. Critical may also be absent if no critical alerts were recorded during the selected period.</p>
  </div>

  <!-- 6. AI Prediction Summary -->
  <div class="section">
    <div class="section-title">6. AI Prediction Summary</div>
    ${aiPredictionSectionContent}
  </div>

  <!-- 7. Coverage Impact -->
  <div class="section">
    <div class="section-title">7. Coverage Impact</div>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Affected Zones</div>
        <div class="summary-value">${coverage.affectedZones}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Hotspot Zone</div>
        <div class="summary-value" style="font-size: 18px;">${coverage.hotspotZone}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">High Severity Areas</div>
        <div class="summary-value">${coverage.highSeverityZones}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Medium Severity Areas</div>
        <div class="summary-value">${coverage.mediumSeverityZones}</div>
      </div>
    </div>
    ${coverageChartHTML}
    <p style="font-size: 13px; color: #475569; margin-top: 10px;">The coverage chart summarizes how widely disruption alerts were distributed during the selected reporting period. Affected zones show how many monitored areas recorded alerts. High and medium severity areas show where stronger disruption impact was detected. The hotspot zone identifies the area with the highest alert count, so it may need closer monitoring.</p>
  </div>

  <!-- 8. Selected Zone Detail -->
  <div class="section">
    <div class="section-title">8. Selected Zone Detail</div>
    ${selectedZoneSectionContent}
  </div>

  <!-- 9. Emergency Service Estimation -->
  <div class="section">
    <div class="section-title">9. Emergency Service Estimation</div>
    ${emergencyServices.length > 0 ? `
    <p>Based on current alert patterns, the following emergency resources and capabilities are estimated for coordination:</p>
    <table>
      <tr>
        <th>Resource Type</th>
        <th>Suggested Priority</th>
        <th>Reason</th>
      </tr>
      ${emergencyServices.map(s => `
      <tr>
        <td><strong>${s.type}</strong></td>
        <td><span class="badge ${s.priority === 'High' ? 'badge-high' : 'badge-medium'}">${s.priority}</span></td>
        <td>${s.reason} (Related: ${s.disruptionType})</td>
      </tr>
      `).join('')}
    </table>
    ` : '<p style="font-style: italic; color: #64748b;">No high-priority emergency service deployments currently triggered based on active thresholds.</p>'}
    
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-top: 12px;">
      <strong style="font-size: 12px; color: #1e293b;">Emergency Contact Reference:</strong>
      <ul style="font-size: 12px; color: #475569; margin: 6px 0 0 0; padding-left: 20px;">
        <li>Emergency Call Center: <strong>112</strong></li>
        <li>Ambulance: <strong>119</strong></li>
        <li>Police: <strong>110</strong></li>
        <li>Basarnas: <strong>115</strong></li>
        <li>BMKG: <strong>021-4246321</strong></li>
      </ul>
      <p style="font-size: 11px; color: #64748b; margin: 6px 0 0 0;">These contacts are included for emergency reference and coordination. Official instructions from local authorities should always take priority.</p>
    </div>
  </div>

  <!-- 10. Zone Alert Rankings -->
  <div class="section">
    <div class="section-title">10. Zone Alert Rankings</div>
    <table>
      <tr>
        <th>Rank</th>
        <th>Zone Name</th>
        <th>Total Alerts</th>
        <th>Active</th>
      </tr>
      ${zone_rankings.map((z, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${z.name}</strong></td>
        <td>${z.total_alerts}</td>
        <td><span class="badge ${z.open_alerts > 0 ? 'badge-open' : 'badge-medium'}">${z.open_alerts} open</span></td>
      </tr>
      `).join('')}
    </table>
    <p style="font-size: 13px; color: #475569;">Zone alert rankings show which monitored areas recorded the highest number of alerts during the selected period. These rankings help identify repeated hotspot areas and support monitoring priorities. A high total alert count does not always mean the zone is currently dangerous, because some alerts may already be closed.</p>
  </div>

  <!-- 11. Notes and Limitations -->
  <div class="section footnote">
    <strong>11. Notes and Limitations:</strong>
    <p>This report is generated from available disruption monitoring data and prediction outputs. AI predictions and trend charts are estimates based on available telemetry and may change when new traffic, weather, crowd, waterway, or earthquake data arrives. Official emergency decisions should follow authorized agencies such as BMKG, BPBD, Basarnas, police, ambulance services, and local government.</p>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>Generated by DIS-RUPTURE | ${formattedDate}</p>
  </div>
</body>
</html>
  `;
  return html;
}

// ── Export Report Handler ──────────────────────────────────────────
function exportReport(summary, days, allZones = [], predictions = [], selectedZone = null, zoneAlerts = [], mlPredictions = {}) {
  const html = generateReportHTML(summary, days, allZones, predictions, selectedZone, zoneAlerts, mlPredictions);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `DIS-RUPTURE-Report-${new Date().toISOString().split('T')[0]}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Overall View ───────────────────────────────────────────────────
function OverallView({ onSelectZone, allZones = [], summary, loading, days, setDays }) {
  // summary/loading are now owned by the parent Dashboard component (single
  // source of truth, with request cancellation) — this component previously
  // duplicated the exact same fetch independently, which could desync from
  // what the export function saw if requests resolved out of order.

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

      {/* Coverage Impact */}
      {(() => {
        const coverage = calculateCoverageImpact(summary, allZones);
        return (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">📍 Coverage Impact</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase mb-1">Affected Zones</p>
                <p className="text-xl font-bold text-indigo-400">{coverage.affectedZones}</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase mb-1">Hotspot Zone</p>
                <p className="text-sm font-bold text-red-400 line-clamp-2">{coverage.hotspotZone}</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase mb-1">High Severity Areas</p>
                <p className="text-xl font-bold text-red-400">{coverage.highSeverityZones}</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-2.5 text-center">
                <p className="text-[9px] text-slate-500 font-semibold uppercase mb-1">Medium Severity Areas</p>
                <p className="text-xl font-bold text-yellow-400">{coverage.mediumSeverityZones}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Emergency Service Estimation */}
      {(() => {
        const services = calculateEmergencyServices(summary);
        return services.length > 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">🚑 Emergency Service Estimation</p>
            <div className="space-y-2">
              {services.map((s, i) => (
                <div key={i} className={`p-2.5 rounded-lg border ${s.priority === 'High' ? 'border-red-500/30 bg-red-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-[11px] font-bold text-slate-200">{s.type}</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">{s.reason}</p>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold shrink-0 ${s.priority === 'High' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{s.priority}</span>
                  </div>
                  <p className="text-[9px] text-slate-500">Related: {s.disruptionType}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
}

// ── Zone Detail View ───────────────────────────────────────────────
function ZoneDetailView({ zone, allZones, onBack, alerts = [], timeline, loading, days = 7 }) {
  // alerts/timeline are now fetched by the parent Dashboard component and
  // passed down as props — previously fetched locally here, hardcoded to
  // days=7 regardless of the dashboard's selected time range, and never
  // shared with the export function (which only ever saw thin summary
  // totals, never the actual alert list shown on screen).
  const [alertFilter, setAlertFilter] = useState('all');

  const zoneStatus = allZones?.find(z => z.zone_id === zone.zone_id);

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
          <p className="text-[10px] text-slate-500">{zone.total_alerts} alerts in last {days} day{days === 1 ? '' : 's'} · {zone.open_alerts} currently open</p>
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
export default function Dashboard({ isOpen, onClose, allZones = [], predictions = [] }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [days, setDays] = useState(7);

  // Zone-detail data lifted up from ZoneDetailView so the export function
  // (which lives here, not in the child) actually has access to the real
  // alert list and timeline the user sees on screen — previously the
  // export only had thin summary numbers (total_alerts/open_alerts),
  // never the fetched detail.
  const [zoneAlerts, setZoneAlerts] = useState([]);
  const [zoneTimeline, setZoneTimeline] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [mlPredictions, setMlPredictions] = useState({});

  // Fetch ML resolution predictions for active predictions when dashboard opens
  useEffect(() => {
    if (!isOpen || !Array.isArray(predictions) || predictions.length === 0) return;

    let cancelled = false;
    const alertIds = predictions.map(p => p.id || p.alert_id).filter(Boolean);

    Promise.all(
      alertIds.map(id =>
        fetch(`${getApiUrl()}/predict/resolution/${id}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach((res, idx) => {
        const id = alertIds[idx];
        if (res && res.estimated_resolution_at) {
          map[id] = res;
        }
      });
      setMlPredictions(map);
    });

    return () => { cancelled = true; };
  }, [isOpen, predictions]);

  const handleExport = async () => {
    if (!summary) return;
    try {
      const alertIds = (predictions || []).map(p => p.id || p.alert_id).filter(Boolean);
      const missingIds = alertIds.filter(id => !mlPredictions[id]);

      let updatedMl = { ...mlPredictions };
      if (missingIds.length > 0) {
        const fetched = await Promise.all(
          missingIds.map(id =>
            fetch(`${getApiUrl()}/predict/resolution/${id}`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        );
        missingIds.forEach((id, idx) => {
          if (fetched[idx] && fetched[idx].estimated_resolution_at) {
            updatedMl[id] = fetched[idx];
          }
        });
        setMlPredictions(updatedMl);
      }

      exportReport(summary, days, allZones, predictions, selectedZone, zoneAlerts, updatedMl);
    } catch (e) {
      console.warn('Error fetching ML predictions for report:', e);
      exportReport(summary, days, allZones, predictions, selectedZone, zoneAlerts, mlPredictions);
    }
  };

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
                {selectedZone ? selectedZone.name : 'Overview'}
              </h2>
              <p className="text-[10px] text-slate-500">
                {selectedZone ? 'Zone detail analysis' : `Jabodetabek overview · last ${days} day${days === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={!summary}
              title="Export report as HTML"
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Download className="w-4 h-4" />
            </button>
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {selectedZone ? (
            <ZoneDetailView
              zone={selectedZone}
              allZones={allZones}
              onBack={() => setSelectedZone(null)}
              alerts={zoneAlerts}
              timeline={zoneTimeline}
              loading={zoneLoading}
              days={days}
            />
          ) : (
            <OverallView
              onSelectZone={setSelectedZone}
              allZones={allZones}
              summary={summary}
              loading={summaryLoading}
              days={days}
              setDays={setDays}
            />
          )}
        </div>

      </div>
    </div>
  );
}
