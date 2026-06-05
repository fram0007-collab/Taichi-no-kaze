import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve certificate paths from root certs directory for local dev
const certPath = path.resolve(__dirname, '../certs/cert.pem');
const keyPath = path.resolve(__dirname, '../certs/key.pem');

const httpsConfig = (fs.existsSync(certPath) && fs.existsSync(keyPath))
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https: httpsConfig
  }
});
