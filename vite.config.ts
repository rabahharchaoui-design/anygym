import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

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


/** The one place the Worker host lives is src/lib/reporting/config.ts; the CSP reads it from there. */
function workerOrigin(): string {
  const src = readFileSync(new URL('./src/lib/reporting/config.ts', import.meta.url), 'utf8');
  const m = /DEFAULT_API_BASE\s*=\s*'(https:\/\/[^']+)'/.exec(src);
  if (!m) throw new Error('DEFAULT_API_BASE not found in src/lib/reporting/config.ts');
  return new URL(m[1]!).origin;
}

/**
 * Content Security Policy (PLAN 2.2f), written into index.html at build time as a meta tag (GitHub
 * Pages cannot send headers). No inline script, no eval. The one inline <style> (black first paint)
 * is allowed by its sha256, computed here so it can never drift from the file; style attributes
 * (view transitions, motion) are allowed through style-src-attr only. A build can point at
 * another Worker with VITE_ANYGYM_API; that origin is added too.
 * frame-ancestors is not honoured in a meta tag (browsers ignore it and log an error), so it is not
 * listed; clickjacking protection would need a response header, which Pages does not offer.
 */
function cspPlugin(): Plugin {
  const tag = /<meta http-equiv="Content-Security-Policy" content="__CSP__"\s*\/?>/;
  return {
    name: 'anygym-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        // Dev server: Vite and React refresh inject inline scripts, so no policy there.
        if (!ctx.bundle) return html.replace(tag, '');
        const hashes = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`);
        const connect = new Set(["'self'", workerOrigin()]);
        const extra = process.env.VITE_ANYGYM_API;
        if (extra) connect.add(new URL(extra).origin);
        // Later: add the map tile host to connect-src and img-src (PLAN Run map). Not yet.
        const csp = [
          "default-src 'self'",
          "script-src 'self'",
          `style-src 'self' ${hashes.join(' ')}`.trim(),
          // Style attributes only (no <style> elements, no script): WebKit's view transition capture
          // (the shared element move into an exercise) writes inline styles that style-src alone refuses.
          "style-src-attr 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "media-src 'self' blob:",
          `connect-src ${[...connect].join(' ')}`,
          "font-src 'self'",
          "worker-src 'self'",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return html.replace(tag, `<meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      },
    },
  };
}

export default defineConfig({
  base: BASE,
  // A source map would hand out the source: none ships (the secret scan fails the build on one).
  build: { sourcemap: false },
  define: { __APP_SHA__: JSON.stringify(shortSha()) },
  plugins: [
    react(),
    cspPlugin(),
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
        sourcemap: false,
        // Precache the whole app shell so it works in a basement with no signal.
        // Exercise demos (PLAN 2.1, cloud run): the photos are NOT precached, so a first visit only
        // downloads the app shell and is offline ready in seconds. Each photo (WebP or its JPG twin)
        // is cached the first time it shows and then works offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        // PLAN 3.5e: the candidate move list is only for the owner review and a phone with approvals:
        // never precached for everyone; kept once it loaded (below).
        globIgnores: ['**/ex/**', '**/catalog-candidates-*.js'],
        runtimeCaching: [
          {
            // A RegExp, never a closure: the matcher is copied into sw.js as source text, where BASE
            // does not exist (gate s2: `${BASE}` threw there, so no photo was ever kept or served).
            urlPattern: /\/ex\/[^/]+\/[01]\.(?:webp|jpg)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-photos', expiration: { maxEntries: 600 } },
          },
          {
            urlPattern: /\/assets\/catalog-candidates-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'candidate-list', expiration: { maxEntries: 2 } },
          },
          {
            // PLAN 3.5e: candidate move photos (public/exc/), kept once seen (the review fetches each batch's).
            urlPattern: /\/exc\/[^/]+\/[01]\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'candidate-photos', expiration: { maxEntries: 700 } },
          },
        ],
        // HashRouter: every route is index.html, so any navigation falls back to it.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
