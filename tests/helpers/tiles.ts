// PLAN 4.2: the Run map in tests. By default every spec sees "Map offline" (tests/fixtures.ts
// refuses the tile host). `stubTiles` gives a map that loads, from answers made here: a tile list
// and empty tiles. The real host is never reached.
//
// Use it only with `test.use({ serviceWorkers: 'block' })`: MapLibre fetches tiles from its web
// worker, and in WebKit a page controlled by the PWA service worker would send those past the
// route below to the real host.
import { TILE_ORIGIN, type Page } from '../fixtures';

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function stubTiles(page: Page): Promise<{ asked: string[] }> {
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
        body: JSON.stringify({ tilejson: '3.0.0', tiles: [`${TILE_ORIGIN}/planet/test/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14, bounds: [-180, -85.05113, 180, 85.05113], attribution: 'test', vector_layers: [] }),
      });
    }
    // A tile or a glyph range with nothing in it.
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
  });
  return { asked };
}

/** Every request the page tried to send to the tile host since it loaded (answered or refused). */
export const tileAsks = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __pwTileAsks?: string[] }).__pwTileAsks?.slice() ?? []);
