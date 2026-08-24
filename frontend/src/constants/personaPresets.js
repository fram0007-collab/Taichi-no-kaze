export const PERSONA_IDS = ['kantor', 'ojek', 'rumah'];

const BASE_POI_OFF = {
  hospital: false,
  police: false,
  university: false,
  mall: false,
  market: false,
  station: false,
  waterways: false,
  earthquakes: false,
  safe_zones: true,
  threat_traffic: false,
  threat_weather: false,
  threat_crowd: false,
  threat_waterway: false,
  threat_earthquake: false,
};

export const PERSONA_PRESETS = {
  kantor: {
    id: 'kantor',
    label: 'Office commute',
    shortLabel: 'Office',
    description: 'Traffic, flood, and weather within ~8 km',
    radiusKm: 8,
    severityFilter: 'medium_plus',
    notificationTypes: {
      traffic: true,
      weather: true,
      flood: true,
      crowd: false,
      earthquake: false,
    },
    layers: {
      ...BASE_POI_OFF,
      threat_traffic: true,
      threat_weather: true,
      threat_waterway: true,
    },
  },
  ojek: {
    id: 'ojek',
    label: 'Delivery / ojek',
    shortLabel: 'Delivery',
    description: 'Tighter 4 km radius; traffic and flood first',
    radiusKm: 4,
    severityFilter: 'high_plus',
    notificationTypes: {
      traffic: true,
      weather: true,
      flood: true,
      crowd: false,
      earthquake: false,
    },
    layers: {
      ...BASE_POI_OFF,
      threat_traffic: true,
      threat_weather: true,
      threat_waterway: true,
    },
  },
  rumah: {
    id: 'rumah',
    label: 'Home & family',
    shortLabel: 'Home',
    description: 'Flood, earthquake, and weather within ~6 km',
    radiusKm: 6,
    severityFilter: 'medium_plus',
    notificationTypes: {
      traffic: false,
      weather: true,
      flood: true,
      crowd: false,
      earthquake: true,
    },
    layers: {
      ...BASE_POI_OFF,
      threat_weather: true,
      threat_waterway: true,
      threat_earthquake: true,
    },
  },
};

export function getPersonaPreset(id) {
  return PERSONA_PRESETS[id] ?? PERSONA_PRESETS.kantor;
}

export function buildLayerState(preset) {
  return { ...(preset?.layers ?? PERSONA_PRESETS.kantor.layers) };
}

export function buildNotificationTypesFromPreset(preset) {
  return { ...preset.notificationTypes };
}

export function personaToSidebarSeverity(personaId) {
  const preset = getPersonaPreset(personaId);
  if (preset.severityFilter === 'high_plus') return 'High';
  if (preset.severityFilter === 'medium_plus') return 'Medium';
  return 'all';
}

export function getBootRestoreState(personaId) {
  const preset = getPersonaPreset(personaId);
  return {
    layers: buildLayerState(preset),
    severityFilter: preset.severityFilter,
    sidebarSeverity: personaToSidebarSeverity(personaId),
  };
}
