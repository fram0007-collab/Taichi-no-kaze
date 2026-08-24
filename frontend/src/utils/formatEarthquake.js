/**
 * Format earthquake event timestamps for display (WIB).
 * Returns a readable fallback when the value is missing or invalid.
 */
export function formatEarthquakeWhen(value) {
  if (!value) return 'Time unavailable';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Time unavailable';
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

/**
 * Normalize API earthquake payloads to the shape expected by Sidebar/MapView.
 */
export function normalizeEarthquake(eq) {
  return {
    ...eq,
    datetime: eq.event_timestamp ?? eq.datetime ?? null,
    wilayah: eq.location ?? eq.wilayah ?? 'Unknown region',
    depth: eq.depth_km != null ? `${eq.depth_km} km` : (eq.depth ?? '—'),
    magnitude: eq.magnitude ?? 0,
  };
}
