/**
 * Client-side fuzzy search over DIS-RUPTURE zone names (no external API).
 */

function normalizeQuery(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/^(kelurahan|kecamatan|kota|kabupaten)\s+/i, '');
}

function scoreMatch(query, name) {
  const n = name.toLowerCase();
  if (!query) return -1;
  if (n === query) return 100;
  if (n.startsWith(query)) return 80;
  if (n.includes(query)) return 50;
  // Word-start match: "pondok" matches "Pondok Aren"
  const words = n.split(/[\s\-–]+/);
  if (words.some((w) => w.startsWith(query))) return 40;
  return -1;
}

/**
 * @param {string} query
 * @param {Array} allZones - entries from GET /zone-status/all
 * @param {number} limit
 * @returns {Array} matching zone status entries, best first
 */
export function searchZonesByName(query, allZones = [], limit = 8) {
  const q = normalizeQuery(query);
  if (!q || !Array.isArray(allZones) || allZones.length === 0) return [];

  const scored = allZones
    .map((entry) => {
      const name = entry?.zone?.name ?? '';
      const score = scoreMatch(q, name);
      return score >= 0 ? { entry, score, name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scored.slice(0, limit).map((s) => s.entry);
}
