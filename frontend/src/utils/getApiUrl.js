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

  const hostname = window.location.hostname;

  // Detect if accessing from localhost or local private networks (LAN)
  const isLocalHost = 
    hostname === 'localhost' || 
    hostname === '127.0.0.1' ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    hostname.endsWith('.local') ||
    !hostname.includes('.');

  // If VITE_API_URL is configured and points to a remote/non-localhost address, prioritize it
  if (import.meta.env.VITE_API_URL) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')) {
      return apiUrl;
    }
  }

  // For local development and LAN mobile testing, route dynamically to the accessing host on port 8000
  if (isLocalHost) {
    return `http://${hostname}:8000`;
  }

  // Fallback to VITE_API_URL or the hostname on port 8000
  return import.meta.env.VITE_API_URL || `http://${hostname}:8000`;
}
