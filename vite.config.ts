import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PHOTO_URL_PATTERN } from './src/lib/photoVersion';
import type { Plugin } from 'vite';

const BASE = '/anygym/';

/** The git short sha of this build (SPEC 24: reports name the exact build); 'dev' without git. */
/** PLAN 4.4b (12): one hash of every exercise photo's name and bytes, the version in their URLs. */
function photoVersion(): string {
  const root = new URL('./public/ex/', import.meta.url);
  const hash = createHash('sha256');
  try {
    for (const dir of readdirSync(root).sort())
      for (const f of readdirSync(new URL(`${dir}/`, root)).sort()) hash.update(`${dir}/${f}`).update(readFileSync(new URL(`${dir}/${f}`, root)));
  } catch {
    return 'dev';
  }
  return hash.digest('hex').slice(0, 10);
}

function shortSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return /^[0-9a-f]{4,12}$/.test(sha) ? sha : 'dev';
  } catch {
    return 'dev';
  }
}


/** The one place the run map's tile host lives is src/lib/run/mapSource.ts; the CSP reads it from there. */
function tileOrigin(): string {
  const src = readFileSync(new URL('./src/lib/run/mapSource.ts', import.meta.url), 'utf8');
  const m = /TILE_ORIGIN\s*=\s*'(https:\/\/[^']+)'/.exec(src);
  if (!m) throw new Error('TILE_ORIGIN not found in src/lib/run/mapSource.ts');
  return new URL(m[1]!).origin;
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
        // PLAN 4.2, the Run map: MapLibre fetches the tile list, the vector tiles and the label glyphs
        // from one host, all through fetch, so that host is in connect-src and nowhere else (the map
        // style ships in the app and has no sprite, so img-src stays as it is). MapLibre's worker is a
        // file of our own origin (setWorkerUrl), so worker-src stays 'self': no blob: worker.
        connect.add(tileOrigin());
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

/**
 * PLAN 3.5t: the one Inter file is asked for with the page (not after the CSS is read), so the
 * first screen is drawn in Inter. Same origin, so font-src 'self' covers it.
 */
function fontPreloadPlugin(): Plugin {
  return {
    name: 'anygym-font-preload',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const font = Object.keys(ctx.bundle ?? {}).find((name) => /inter-latin-wght-normal.*\.woff2$/.test(name));
        if (!font) return html;
        return html.replace('</head>', `  <link rel="preload" href="${BASE}${font}" as="font" type="font/woff2" crossorigin />\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  base: BASE,
  // A source map would hand out the source: none ships (the secret scan fails the build on one).
  build: { sourcemap: false },
  define: { __APP_SHA__: JSON.stringify(shortSha()), __PHOTO_VERSION__: JSON.stringify(photoVersion()) },
  plugins: [
    react(),
    cspPlugin(),
    fontPreloadPlugin(),
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
        theme_color: '#131417',
        background_color: '#131417',
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
        // PLAN 3.6i: the 20 small 3D icons on the intake and Quick workout are precached in both formats
        // (about 230 KB together; the phone asks for one of them), so they show in a gym with no signal.
        // Art that waits for its screen (icons3d/later/) is never precached.
        // PLAN 4.2: the MapLibre chunk and its worker are precached like the rest of the app (the Run
        // tab opens with no signal); map tiles are another host, match no rule here and are never cached.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}', 'icons3d/*.{avif,webp}'],
        // PLAN 3.5e: the candidate move list is only for the owner review and a phone with approvals:
        // never precached for everyone; kept once it loaded (below).
        globIgnores: ['**/ex/**', '**/catalog-candidates-*.js'],
        runtimeCaching: [
          {
            // A RegExp, never a closure: the matcher is copied into sw.js as source text, where BASE
            // does not exist (gate s2: `${BASE}` threw there, so no photo was ever kept or served).
            // PLAN 4.4b (12): photo URLs carry a version (lib/photoVersion.ts), so a changed photo is a new entry.
            urlPattern: PHOTO_URL_PATTERN,
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
          {
            // PLAN 4.4: the run coach's voice clips (public/voice/, about 1.1 MB in 220 small files).
            // Not precached: the first save of the app stays as small as it was. The Run tab saves
            // them in the background (hooks/voiceWarm.ts, the same cache) and each is kept once played.
            urlPattern: /\/voice\/[^/]+\.m4a(?:\?.*)?$/,
            handler: 'CacheFirst',
            options: { cacheName: 'run-voice', expiration: { maxEntries: 400 } },
          },
        ],
        // HashRouter: every route is index.html, so any navigation falls back to it.
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
        // Gate 3.7: on a first visit the page takes the service worker as soon as it is ready, so a first
        // session that loses signal still opens screens it has not loaded yet. An update still waits
        // for its prompt (no skipWaiting here; src/pwa.ts decides when).
        clientsClaim: true,
      },
    }),
  ],
});
