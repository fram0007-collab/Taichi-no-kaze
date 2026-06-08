/**
 * getApiUrl.js
 *
 * Runtime API URL resolution — priority order:
 *   1. window.__API_URL__  → injected at container start by docker-entrypoint.sh (LAN / production)
 *   2. import.meta.env.VITE_API_URL → Vite build-time variable (local dev)
 *   3. Hard-coded fallback → https://localhost:8000
 *
 * This allows the backend URL to be changed purely via the API_URL env var in
 * docker-compose.yml without rebuilding the Docker image.
 */
export function getApiUrl() {
  if (window.__API_URL__) {
    return window.__API_URL__;
  }
  // If accessed via a LAN IP or hostname (not localhost), dynamically route to that host's port 8000
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return `http://${hostname}:8000`;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return `http://${hostname}:8000`;
}
