/**
 * getApiUrl.js
 *
 * Runtime API URL resolution:
 *   - Production (Vercel): returns '/api' so all calls use relative /api/... paths
 *     on the same domain — no CORS, no separate backend needed.
 *   - Local dev: returns http://localhost:8000 for the FastAPI backend.
 */
export function getApiUrl() {
  const hostname = window.location.hostname;

  const isLocalDev =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    hostname.endsWith('.local');

  if (isLocalDev) {
    return import.meta.env.VITE_API_URL || `http://${hostname}:8000`;
  }

  // Vercel production — API functions at /api/...
  return '/api';
}
