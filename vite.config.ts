import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

const BASE = '/anygym/';

/** The git short sha of this build (SPEC 24: reports name the exact build); 'dev' without git. */
function shortSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return /^[0-9a-f]{4,12}$/.test(sha) ? sha : 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: BASE,
  define: { __APP_SHA__: JSON.stringify(shortSha()) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': a new version waits until no workout or run is active (src/pwa.ts).
      registerType: 'prompt',
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
        // Exercise demos (PLAN 2.1, cloud run): the photos are NOT precached, so a first visit only
        // downloads the app shell and is offline ready in seconds. Each photo (WebP or its JPG twin)
        // is cached the first time it shows and then works offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        globIgnores: ['**/ex/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith(`${BASE}ex/`),
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-photos', expiration: { maxEntries: 600 } },
          },
        ],
        // HashRouter: every route is index.html, so any navigation falls back to it.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
