import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

// PLAN M8: the app icon is G's "Diagonal" (Monolith B06, Nov 19 9 PM; it replaced "Loaded Bar"). The built app's manifest, its
// Home Screen icon link, its favicons and the service worker's precache all point at the new files,
// each the size it says, and every icon is opaque (iOS fills a transparent pixel with its own colour).

/** Width, height and PNG colour type (2 = RGB, 6 = RGB with alpha) from the IHDR chunk, and whether a tRNS chunk adds transparency. */
function pngInfo(bytes: Buffer) {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25], tRNS: bytes.includes(Buffer.from('tRNS', 'latin1')) };
}

async function png(page: Page, baseURL: string, path: string) {
  const res = await page.request.get(new URL(path, baseURL).href);
  expect(res.status(), path).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
  return pngInfo(await res.body());
}

const opaque = (info: ReturnType<typeof pngInfo>) => (info.colorType === 2 || info.colorType === 0) && !info.tRNS;

test('the manifest lists the Diagonal icons at their real sizes, on a black splash', async ({ page, baseURL }) => {
  const manifest = await (await page.request.get(new URL('manifest.webmanifest', baseURL!).href)).json();
  expect(manifest.theme_color).toBe('#000000');
  expect(manifest.background_color).toBe('#000000');
  const icons = manifest.icons as Array<{ src: string; sizes: string; type: string; purpose: string }>;
  expect(icons.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
    ['icons/icon-192.png', '192x192', 'any'],
    ['icons/icon-512.png', '512x512', 'any'],
    ['icons/icon-512-maskable.png', '512x512', 'maskable'],
  ]);
  for (const icon of icons) {
    const info = await png(page, baseURL!, icon.src);
    expect(`${info.width}x${info.height}`, icon.src).toBe(icon.sizes);
    expect(opaque(info), `${icon.src} has no alpha`).toBe(true);
  }
});

test('the page links the 180 px apple touch icon and PNG favicons, no alpha, all precached', async ({ page, baseURL }) => {
  await page.goto('./');
  const touch = page.locator('link[rel="apple-touch-icon"]');
  await expect(touch).toHaveCount(1);
  expect(await touch.getAttribute('sizes')).toBe('180x180');
  const touchHref = await touch.evaluate((el) => (el as HTMLLinkElement).href);
  expect(touchHref).toMatch(/\/anygym\/icons\/apple-touch-icon-180\.png$/);
  const info = await png(page, baseURL!, touchHref);
  expect([info.width, info.height]).toEqual([180, 180]);
  expect(opaque(info), 'apple touch icon has no alpha').toBe(true);

  const favicons = await page.locator('link[rel="icon"]').evaluateAll((els) => els.map((el) => [(el as HTMLLinkElement).href, el.getAttribute('sizes'), el.getAttribute('type')]));
  expect(favicons.map(([href, sizes, type]) => [href!.replace(/^.*\/anygym\//, ''), sizes, type])).toEqual([
    ['icons/favicon-32.png', '32x32', 'image/png'],
    ['icons/favicon-48.png', '48x48', 'image/png'],
  ]);
  for (const [href, sizes] of favicons) {
    const f = await png(page, baseURL!, href!);
    expect(`${f.width}x${f.height}`).toBe(sizes);
    expect(opaque(f)).toBe(true);
  }
  // The retired Titanium Glass favicon is gone from the build.
  expect((await page.request.get(new URL('icons/favicon.svg', baseURL!).href)).headers()['content-type'] ?? '').not.toContain('svg');

  // The service worker precaches every icon, so the Home Screen app has them with no signal.
  const sw = await (await page.request.get(new URL('sw.js', baseURL!).href)).text();
  for (const name of ['apple-touch-icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'favicon-32.png', 'favicon-48.png']) expect(sw, name).toContain(`icons/${name}`);
  expect(sw).not.toContain('favicon.svg');
  expect(sw).not.toContain('logo-1024.png');
});

// sha256 of G's chosen 180 px icon (anygym-art, art/app-icon/app-icon-180.png). It changes ONLY when G
// picks a new icon. The first M8 build shipped the old Loaded Bar file (3a42d6...) and every other check passed.
const APPLE_TOUCH_180_SHA256 = '3006ec070fb3ebbe2764385225372ebd31aa526f1dc77e4339c1dfe9712f929a';

test('the committed and served apple touch icon is exactly the Diagonal file G picked', async ({ page, baseURL }) => {
  const committed = readFileSync(new URL('../public/icons/apple-touch-icon-180.png', import.meta.url));
  expect(createHash('sha256').update(committed).digest('hex')).toBe(APPLE_TOUCH_180_SHA256);
  const served = await (await page.request.get(new URL('icons/apple-touch-icon-180.png', baseURL!).href)).body();
  expect(createHash('sha256').update(served).digest('hex')).toBe(APPLE_TOUCH_180_SHA256);
});

test('the apple touch icon is the Diagonal: black ground, ice blue shaft corner to corner, white plates', async ({ page }) => {
  await page.goto('./');
  const px = await page.evaluate(async () => {
    const img = new Image();
    img.src = 'icons/apple-touch-icon-180.png';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    // The shaft runs top left to bottom right through the middle; a plate sits at each end; the other
    // two corners and the middle of each edge are bare ground (a level bar would cover them).
    return {
      shaft: [at(70, 70), at(90, 90), at(110, 110)],
      plates: [at(40, 40), at(140, 140)],
      ground: [at(150, 30), at(30, 150), at(90, 30), at(90, 150), at(48, 90), at(2, 177)],
    };
  });
  for (const [r, g, b] of px.shaft as [number, number, number][]) {
    expect(b).toBeGreaterThan(220);
    expect(b - r).toBeGreaterThan(40);
    expect(g).toBeGreaterThan(170);
  }
  for (const plate of px.plates) expect(Math.min(...plate)).toBeGreaterThan(190);
  for (const ground of px.ground) expect(Math.max(...ground)).toBeLessThan(16);
});
