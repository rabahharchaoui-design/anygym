import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/anygym/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // registered in src/main.tsx via virtual:pwa-register
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon-180.png'],
      manifest: {
        name: 'AnyGym',
        short_name: 'AnyGym',
        description: 'Your training keeps working in any gym.',
        lang: 'en',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#000000',
        background_color: '#000000',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole app shell so it works in a basement with no signal.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // HashRouter: every route is index.html, so any navigation falls back to it.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
