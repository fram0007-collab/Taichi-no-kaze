// vite.config.js
import { defineConfig } from "file:///C:/Users/LENOVO/OneDrive/Documents/GitHub/Taichi-no-kaze/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/LENOVO/OneDrive/Documents/GitHub/Taichi-no-kaze/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///C:/Users/LENOVO/OneDrive/Documents/GitHub/Taichi-no-kaze/frontend/node_modules/vite-plugin-pwa/dist/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var __vite_injected_original_import_meta_url = "file:///C:/Users/LENOVO/OneDrive/Documents/GitHub/Taichi-no-kaze/frontend/vite.config.js";
var __dirname = path.dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var certPath = path.resolve(__dirname, "../certs/cert.pem");
var keyPath = path.resolve(__dirname, "../certs/key.pem");
var httpsConfig = fs.existsSync(certPath) && fs.existsSync(keyPath) ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } : void 0;
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest: vite-plugin-pwa builds src/sw.js, injects the
      // precache manifest into self.__WB_MANIFEST, and outputs dist/sw.js.
      // This merges our Workbox caching with the push notification handlers
      // without one overwriting the other.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "manifest.json"],
      manifest: {
        name: "DIS-RUPTURE Early Warning",
        short_name: "DIS-RUPTURE",
        description: "Predictive Early Warning Command Center for Jabodetabek disruptions",
        start_url: "/",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0a0f1e",
        theme_color: "#6366f1",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }
        ],
        shortcuts: [
          {
            name: "Live Feed",
            short_name: "Feed",
            description: "View active threat alerts",
            url: "/?tab=feed",
            icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }]
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  server: {
    host: true,
    port: 5173,
    https: httpsConfig
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxMRU5PVk9cXFxcT25lRHJpdmVcXFxcRG9jdW1lbnRzXFxcXEdpdEh1YlxcXFxUYWljaGktbm8ta2F6ZVxcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcTEVOT1ZPXFxcXE9uZURyaXZlXFxcXERvY3VtZW50c1xcXFxHaXRIdWJcXFxcVGFpY2hpLW5vLWthemVcXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL0xFTk9WTy9PbmVEcml2ZS9Eb2N1bWVudHMvR2l0SHViL1RhaWNoaS1uby1rYXplL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xyXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ3VybCc7XHJcblxyXG5jb25zdCBfX2Rpcm5hbWUgPSBwYXRoLmRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcclxuXHJcbmNvbnN0IGNlcnRQYXRoID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uL2NlcnRzL2NlcnQucGVtJyk7XHJcbmNvbnN0IGtleVBhdGggID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uL2NlcnRzL2tleS5wZW0nKTtcclxuXHJcbmNvbnN0IGh0dHBzQ29uZmlnID0gKGZzLmV4aXN0c1N5bmMoY2VydFBhdGgpICYmIGZzLmV4aXN0c1N5bmMoa2V5UGF0aCkpXHJcbiAgPyB7IGtleTogZnMucmVhZEZpbGVTeW5jKGtleVBhdGgpLCBjZXJ0OiBmcy5yZWFkRmlsZVN5bmMoY2VydFBhdGgpIH1cclxuICA6IHVuZGVmaW5lZDtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW1xyXG4gICAgcmVhY3QoKSxcclxuICAgIFZpdGVQV0Eoe1xyXG4gICAgICAvLyBpbmplY3RNYW5pZmVzdDogdml0ZS1wbHVnaW4tcHdhIGJ1aWxkcyBzcmMvc3cuanMsIGluamVjdHMgdGhlXHJcbiAgICAgIC8vIHByZWNhY2hlIG1hbmlmZXN0IGludG8gc2VsZi5fX1dCX01BTklGRVNULCBhbmQgb3V0cHV0cyBkaXN0L3N3LmpzLlxyXG4gICAgICAvLyBUaGlzIG1lcmdlcyBvdXIgV29ya2JveCBjYWNoaW5nIHdpdGggdGhlIHB1c2ggbm90aWZpY2F0aW9uIGhhbmRsZXJzXHJcbiAgICAgIC8vIHdpdGhvdXQgb25lIG92ZXJ3cml0aW5nIHRoZSBvdGhlci5cclxuICAgICAgc3RyYXRlZ2llczogJ2luamVjdE1hbmlmZXN0JyxcclxuICAgICAgc3JjRGlyOiAnc3JjJyxcclxuICAgICAgZmlsZW5hbWU6ICdzdy5qcycsXHJcblxyXG4gICAgICByZWdpc3RlclR5cGU6ICdhdXRvVXBkYXRlJyxcclxuICAgICAgaW5jbHVkZUFzc2V0czogWydpY29ucy8qLnBuZycsICdtYW5pZmVzdC5qc29uJ10sXHJcblxyXG4gICAgICBtYW5pZmVzdDoge1xyXG4gICAgICAgIG5hbWU6ICdESVMtUlVQVFVSRSBFYXJseSBXYXJuaW5nJyxcclxuICAgICAgICBzaG9ydF9uYW1lOiAnRElTLVJVUFRVUkUnLFxyXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUHJlZGljdGl2ZSBFYXJseSBXYXJuaW5nIENvbW1hbmQgQ2VudGVyIGZvciBKYWJvZGV0YWJlayBkaXNydXB0aW9ucycsXHJcbiAgICAgICAgc3RhcnRfdXJsOiAnLycsXHJcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxyXG4gICAgICAgIG9yaWVudGF0aW9uOiAncG9ydHJhaXQtcHJpbWFyeScsXHJcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyMwYTBmMWUnLFxyXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzYzNjZmMScsXHJcbiAgICAgICAgaWNvbnM6IFtcclxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL2ljb24tMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnLCBwdXJwb3NlOiAnYW55IG1hc2thYmxlJyB9LFxyXG4gICAgICAgICAgeyBzcmM6ICcvaWNvbnMvaWNvbi01MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycsIHB1cnBvc2U6ICdhbnkgbWFza2FibGUnIH0sXHJcbiAgICAgICAgICB7IHNyYzogJy9pY29ucy9pY29uLTE4MC5wbmcnLCBzaXplczogJzE4MHgxODAnLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgc2hvcnRjdXRzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIG5hbWU6ICdMaXZlIEZlZWQnLFxyXG4gICAgICAgICAgICBzaG9ydF9uYW1lOiAnRmVlZCcsXHJcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnVmlldyBhY3RpdmUgdGhyZWF0IGFsZXJ0cycsXHJcbiAgICAgICAgICAgIHVybDogJy8/dGFiPWZlZWQnLFxyXG4gICAgICAgICAgICBpY29uczogW3sgc3JjOiAnL2ljb25zL2ljb24tMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicgfV0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcblxyXG4gICAgICBkZXZPcHRpb25zOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXHJcbiAgICB9KSxcclxuICBdLFxyXG4gIHNlcnZlcjoge1xyXG4gICAgaG9zdDogdHJ1ZSxcclxuICAgIHBvcnQ6IDUxNzMsXHJcbiAgICBodHRwczogaHR0cHNDb25maWcsXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcVksU0FBUyxvQkFBb0I7QUFDbGEsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixPQUFPLFFBQVE7QUFDZixPQUFPLFVBQVU7QUFDakIsU0FBUyxxQkFBcUI7QUFMMk4sSUFBTSwyQ0FBMkM7QUFPMVMsSUFBTSxZQUFZLEtBQUssUUFBUSxjQUFjLHdDQUFlLENBQUM7QUFFN0QsSUFBTSxXQUFXLEtBQUssUUFBUSxXQUFXLG1CQUFtQjtBQUM1RCxJQUFNLFVBQVcsS0FBSyxRQUFRLFdBQVcsa0JBQWtCO0FBRTNELElBQU0sY0FBZSxHQUFHLFdBQVcsUUFBUSxLQUFLLEdBQUcsV0FBVyxPQUFPLElBQ2pFLEVBQUUsS0FBSyxHQUFHLGFBQWEsT0FBTyxHQUFHLE1BQU0sR0FBRyxhQUFhLFFBQVEsRUFBRSxJQUNqRTtBQUVKLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS04sWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BRVYsY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLGVBQWUsZUFBZTtBQUFBLE1BRTlDLFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLFNBQVM7QUFBQSxRQUNULGFBQWE7QUFBQSxRQUNiLGtCQUFrQjtBQUFBLFFBQ2xCLGFBQWE7QUFBQSxRQUNiLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyx1QkFBdUIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLGVBQWU7QUFBQSxVQUMzRixFQUFFLEtBQUssdUJBQXVCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxlQUFlO0FBQUEsVUFDM0YsRUFBRSxLQUFLLHVCQUF1QixPQUFPLFdBQVcsTUFBTSxZQUFZO0FBQUEsUUFDcEU7QUFBQSxRQUNBLFdBQVc7QUFBQSxVQUNUO0FBQUEsWUFDRSxNQUFNO0FBQUEsWUFDTixZQUFZO0FBQUEsWUFDWixhQUFhO0FBQUEsWUFDYixLQUFLO0FBQUEsWUFDTCxPQUFPLENBQUMsRUFBRSxLQUFLLHVCQUF1QixPQUFPLFVBQVUsQ0FBQztBQUFBLFVBQzFEO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUVBLFlBQVksRUFBRSxTQUFTLE1BQU07QUFBQSxJQUMvQixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
