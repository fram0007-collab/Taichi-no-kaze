#!/bin/sh
# docker-entrypoint.sh
# Writes a runtime config.js into the nginx html root so the frontend
# can read the API_URL without it being baked in at build time.
# This lets you change the backend URL purely via an env variable restart.

API_URL="${API_URL:-https://localhost:8000}"

cat > /usr/share/nginx/html/config.js <<EOF
// Runtime-injected configuration — do not edit manually.
// Set the API_URL environment variable in docker-compose.yml to override.
window.__API_URL__ = "${API_URL}";
EOF

echo "[entrypoint] config.js written with API_URL=${API_URL}"

# Hand off to the default nginx entrypoint
exec nginx -g "daemon off;"
