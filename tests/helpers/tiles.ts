// PLAN 4.2: the Run map in tests. By default every spec sees "Map offline" (tests/fixtures.ts
// refuses the tile host). `stubTiles` gives a map that loads, from answers made here: a tile list
// and empty tiles. The real host is never reached.
//
// Use it only with `test.use({ serviceWorkers: 'block' })`: MapLibre fetches tiles from its web
// worker, and in WebKit a page controlled by the PWA service worker would send those past the
// route below to the real host.
import { TILE_ORIGIN, type Page } from '../fixtures';

/** Mapbox vector tile: layer { name: 'x', extent: 4096, version: 2 }, no features. */
const EMPTY_TILE = Buffer.from([0x1a, 0x08, 0x0a, 0x01, 0x78, 0x28, 0x80, 0x20, 0x78, 0x02]);

const CORS = { 'Access-Control-Allow-Origin': '*' };

/** `failFirstTiles` (or failNext later): that many vector tiles fail (500) before the rest load (PLAN 4.4b 15). */
export async function stubTiles(page: Page, opts: { failFirstTiles?: number } = {}): Promise<{ asked: string[]; failNext: (n: number) => void }> {
  let failing = opts.failFirstTiles ?? 0;
  const asked: string[] = [];
  await page.addInitScript(() => {
    (window as unknown as { __pwTiles: string }).__pwTiles = 'pass';
  });
  await page.route(`${TILE_ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    asked.push(url.href);
    if (url.pathname === '/planet') {
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ tilejson: '3.0.0', tiles: [`${TILE_ORIGIN}/planet/test/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14, bounds: [-180, -85.05113, 180, 85.05113], attribution: 'test' }),
      });
    }
    if (url.pathname.endsWith('.pbf') && failing > 0) {
      failing--;
      return route.fulfill({ status: 500, headers: CORS, body: '' });
    }
    // A vector tile with one layer and nothing in it (a glyph range gets the same harmless bytes).
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/x-protobuf', body: EMPTY_TILE });
  });
  return { asked, failNext: (n: number) => void (failing = n) };
}

/** Every request the page tried to send to the tile host since it loaded (answered or refused). */
export const tileAsks = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __pwTileAsks?: string[] }).__pwTileAsks?.slice() ?? []);
