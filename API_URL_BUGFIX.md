# Bugfix: API URL Resolution on Production (Vercel)

This document describes the issue with API connection failures when the frontend is deployed to Vercel and explains the implemented solution.

## The Problem

When accessing the frontend on Vercel (`taichi-no-kaze.vercel.app`), the application failed to connect to the backend database, displaying a status of **"Offline"**. 

Under the hood, API requests were sent to:
`http://taichi-no-kaze.vercel.app:8000/predictions/active`

### Root Cause
A previous change was introduced in [getApiUrl.js](file:///c:/Users/SVR10WIN/Documents/GitHub/Taichi-no-kaze/frontend/src/utils/getApiUrl.js) to support mobile devices testing the application over a local area network (LAN). It checked:
```javascript
if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
  return `http://${hostname}:8000`;
}
```
Because the Vercel hostname (`taichi-no-kaze.vercel.app`) is neither `localhost` nor `127.0.0.1`, the utility incorrectly classified it as a local LAN IP, appending port `8000` to the production domain.

---

## The Solution

We refactored [getApiUrl.js](file:///c:/Users/SVR10WIN/Documents/GitHub/Taichi-no-kaze/frontend/src/utils/getApiUrl.js) to isolate local development and LAN signatures from production domains:

1. **Explicit Local Hostname Matching**:
   Only hostnames matching local network signatures are dynamically routed to port `8000`:
   * Loopbacks (`localhost`, `127.0.0.1`)
   * Private IP subnets (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`–`172.31.x.x`)
   * Bonjour/mDNS hostnames (`*.local`)
   * Single-word intranet hostnames (no dots, e.g., `my-pc`)

2. **Prioritizing Remote API Configuration**:
   If a production `VITE_API_URL` environment variable is defined (which does not point to localhost), it is utilized immediately regardless of the current hostname.

### Code Diff
```diff
-  // If accessed via a LAN IP or hostname (not localhost), dynamically route to that host's port 8000
+
   const hostname = window.location.hostname;
-  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
-    return `http://${hostname}:8000`;
-  }
+
+  // Detect if accessing from localhost or local private networks (LAN)
+  const isLocalHost = 
+    hostname === 'localhost' || 
+    hostname === '127.0.0.1' ||
+    /^192\.168\./.test(hostname) ||
+    /^10\./.test(hostname) ||
+    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
+    hostname.endsWith('.local') ||
+    !hostname.includes('.');
+
+  // If VITE_API_URL is configured and points to a remote/non-localhost address, prioritize it
   if (import.meta.env.VITE_API_URL) {
-    return import.meta.env.VITE_API_URL;
-  }
-  return `http://${hostname}:8000`;
+    const apiUrl = import.meta.env.VITE_API_URL;
+    if (!apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')) {
+      return apiUrl;
+    }
+  }
+
+  // For local development and LAN mobile testing, route dynamically to the accessing host on port 8000
+  if (isLocalHost) {
+    return `http://${hostname}:8000`;
+  }
+
+  // Fallback to VITE_API_URL or the hostname on port 8000
+  return import.meta.env.VITE_API_URL || `http://${hostname}:8000`;
```

---

## Action Items for Deployment

To connect the Vercel frontend to your production database backend:
1. Open the project settings in **Vercel**.
2. Navigate to **Environment Variables**.
3. Create a variable:
   * **Key**: `VITE_API_URL`
   * **Value**: `https://your-production-backend-url.com` (your backend server domain)
4. Trigger a new deployment on Vercel.
