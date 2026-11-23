import { expect, test, type Page } from './fixtures';
import { checkContrast } from './helpers/contrast';
import { simulateSafeAreas } from './helpers/layout';
import { tokenColor } from './helpers/tokens';
import { bar185, exerciseView, quickWith, seedFinished, usePlan } from './workout-helpers';

// PLAN 3.5t, now Monolith (PLAN M0): flat graphite, no glass. Originally TITANIUM GLASS on the whole app. Graphite gradient behind every screen (the status bar
// strip included), glass cards, one ice blue accent with dark text on it, Inter, a floating glass
// tab bar, and no lime anywhere a person can see. Colours are read from the tokens, never typed.

test.beforeEach(async ({ page }) => simulateSafeAreas(page));

/** "rgb(r, g, b)" or any CSS colour as [r, g, b, a], by painting it. */
const paint = (page: Page, css: string) =>
  page.evaluate((value) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, css);

const luminance = ([r, g, b]: number[]) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

/** Every colour the screen draws with (text, fills, borders, shadows, gradients, SVG inks), as one string. */
const drawnColours = (page: Page) =>
  page.evaluate(() => {
    const out = new Set<string>();
    for (const el of document.querySelectorAll('*')) {
      for (const pseudo of [null, '::before', '::after']) {
        const s = getComputedStyle(el, pseudo);
        for (const p of ['color', 'backgroundColor', 'backgroundImage', 'borderTopColor', 'borderBottomColor', 'boxShadow', 'fill', 'stroke', 'outlineColor', 'textDecorationColor']) out.add(s[p as 'color']);
      }
    }
    return [...out].join(' | ');
  });

const LIME = /212,\s*255,\s*58|0\.83\d* 1 0\.22|d4ff3a/i;

test('tokens: ice blue accent, dark text on it, flat graphite, Inter; the browser bar matches @matrix', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
  expect(await paint(page, await tokenColor(page, '--accent'))).toEqual([159, 211, 255, 255]);
  expect(await paint(page, await tokenColor(page, '--on-accent'))).toEqual([15, 17, 20, 255]);
  // Monolith (PLAN M0, SPEC 10): white text and #A3A6AB secondary on graphite.
  expect(await paint(page, await tokenColor(page, '--text'))).toEqual([255, 255, 255, 255]);
  expect(await paint(page, await tokenColor(page, '--text-2'))).toEqual([163, 166, 171, 255]);
  // Warning amber and destructive red are kept.
  expect(await paint(page, await tokenColor(page, '--amber'))).toEqual([255, 176, 32, 255]);
  expect(await paint(page, await tokenColor(page, '--red'))).toEqual([255, 77, 77, 255]);
  // Inter, self hosted, is what the page is set in.
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Inter"?,/);
  expect(await page.evaluate(() => document.fonts.check('700 17px Inter'))).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))).toContain('Inter');
  // The primary button (PLAN M1, Monolith): white heavy text on graphite over an ice blue bar, no fill, well over AA.
  const primary = page.getByRole('button', { name: 'See plans' });
  const [bg, fg, bar] = await primary.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color, getComputedStyle(el, '::after').backgroundColor]);
  expect(fg).toBe(await tokenColor(page, '--text'));
  expect(bg).toBe('rgba(0, 0, 0, 0)');
  expect(bar).toBe(await tokenColor(page, '--accent'));
  expect(ratio(await paint(page, fg!), await paint(page, await tokenColor(page, '--bg')))).toBeGreaterThan(7);
  // The page behind everything, and the browser's own bar, are the graphite of the gradient's top.
  const top = await tokenColor(page, '--bg-top');
  const theme = await page.locator('meta[name="theme-color"]').getAttribute('content');
  expect((await paint(page, theme!)).slice(0, 3)).toEqual((await paint(page, top)).slice(0, 3));
  // Monolith (PLAN M0): the page behind everything is flat graphite, no gradient image.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)).toBe(top);
});

test('the status bar strip shows the new background on Today, a pushed screen and a workout @matrix', async ({ page }) => {
  const top = await (async () => {
    await page.goto('./');
    return tokenColor(page, '--bg-top');
  })();
  const bottom = await tokenColor(page, '--bg');
  /** The first painted layer under a point in the status bar strip. */
  const strip = () =>
    page.evaluate(() => {
      for (const el of document.elementsFromPoint(innerWidth / 2, 2)) {
        const s = getComputedStyle(el);
        if (s.backgroundImage !== 'none') return s.backgroundImage;
        const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
        if (m && (m[1]!.split(',').length < 4 || Number(m[1]!.split(',')[3]) > 0.5)) return s.backgroundColor;
      }
      return 'nothing';
    });
  // Monolith (PLAN M0, SPEC 10): flat graphite, no gradient: every colour the strip paints is --bg.
  expect(top).toBe(bottom);
  const flat = (v: string) => /rgb/.test(v) && [...v.matchAll(/rgba?\([^)]*\)/g)].every((m) => m[0] === bottom);
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
  expect(flat(await strip()), await strip()).toBe(true);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  expect(flat(await strip()), await strip()).toBe(true);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  // The live header is glass over the same gradient: never a black band.
  const live = await strip();
  expect(live).not.toMatch(/rgb\(0, 0, 0\)/);
});

// Monolith (PLAN M0, SPEC 23.1): no glass. The bar is solid (no blur, opaque) with square corners;
// docking it to the edge is M1's job, so its position is not asserted here.
test('the tab bar is solid Monolith: no blur, opaque, square corners, the accent on the active tab @matrix', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });
  // PLAN M1: the bar itself (the nav, docked to the bottom edge) carries the solid fill now.
  const capsule = nav.locator('[class*="capsule"]');
  const box = (await capsule.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  const style = await nav.evaluate((el) => {
    const s = getComputedStyle(el);
    return { blur: s.backdropFilter || (s as unknown as { webkitBackdropFilter: string }).webkitBackdropFilter, bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius), border: s.borderTopColor };
  });
  expect(style.blur || 'none').toBe('none');
  expect((await paint(page, style.bg))[3]).toBeGreaterThan(200); // opaque: text never reads through
  expect(style.radius).toBeLessThanOrEqual(4);
  const active = nav.getByRole('link', { name: 'Today' });
  // PLAN M1 (style sheet): the active tab is white with the ice blue mark above it.
  expect(await active.evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColor(page, '--text'));
  expect(await active.locator('[data-pill]').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await tokenColor(page, '--accent'));
  expect(await nav.getByRole('link', { name: 'Run' }).evaluate((el) => getComputedStyle(el).color)).toBe(await tokenColor(page, '--text-2'));
});

test('a pushed screen top bar fills in graphite once the page scrolls under it', async ({ page }) => {
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  const bar = page.locator('[class*="_bar_"]').first();
  const alpha = async () => (await paint(page, await bar.evaluate((el) => getComputedStyle(el).backgroundColor)))[3]!;
  expect(await alpha()).toBeLessThan(20);
  await page.evaluate(() => {
    const scroller = [...document.querySelectorAll<HTMLElement>('*')].find((e) => e.scrollHeight > e.clientHeight + 200 && getComputedStyle(e).overflowY === 'auto');
    scroller?.scrollTo(0, 400);
  });
  await expect.poll(alpha).toBeGreaterThan(230);
});

test('no lime is drawn anywhere: Today, plans, the workout, the weight sheet, Settings, Quick workout @matrix', async ({ page }) => {
  const seen: string[] = [];
  const look = async (where: string) => {
    const colours = await drawnColours(page);
    if (LIME.test(colours)) seen.push(where);
    // The accent really is in use on the screen (not just absent lime).
    return colours;
  };
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
  await usePlan(page);
  expect(await look('today')).toContain((await tokenColor(page, '--accent')).replace(/^rgb\(|\)$/g, ''));
  await page.goto('./#/plans');
  await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
  await look('plans');
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await look('settings');
  await page.goto('./#/quick?min=30');
  await expect(page.locator('[data-concept]').first()).toBeVisible();
  await look('quick');
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row').first()).toBeVisible();
  await look('workout, a set logged');
  await view.getByTestId('weight-cell').nth(1).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await look('weight sheet');
  expect(seen).toEqual([]);
});

for (const scale of [100, 130]) {
  test(`AA contrast on the glass at ${scale}% text: Today with a plan, a logged set, the finish screen, Settings @matrix`, async ({ page }) => {
    const text = async () => {
      await page.waitForTimeout(400); // toggles and springs settled
      if (scale !== 100) await page.evaluate((pct) => (document.documentElement.style.fontSize = `${pct}%`), scale);
    };
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
    await usePlan(page);
    await text();
    await checkContrast(page);
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
    await text();
    await checkContrast(page);
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row').first()).toBeVisible();
    await text();
    await checkContrast(page);
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page).toHaveURL(/done$/);
    await text();
    await checkContrast(page);
  });
}

test('the app icons and the manifest are the Diagonal (no lime pixel, black splash)', async ({ page, baseURL }) => {
  const manifest = await (await page.request.get(new URL('manifest.webmanifest', baseURL!).href)).json();
  // PLAN M8 (SPEC 1): the splash and the installed app's bar are pure black like the icon's ground.
  expect(manifest.theme_color).toBe('#000000');
  expect(manifest.background_color).toBe('#000000');
  // The apple touch icon: ice blue pixels on the barbell, graphite in a corner, nothing lime.
  await page.goto('./');
  const px = await page.evaluate(async () => {
    const img = new Image();
    img.src = 'icons/apple-touch-icon-180.png';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, 180, 180).data;
    let ice = 0;
    let lime = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (b > 220 && g > 170 && r > 100 && r < 215 && b - r > 40) ice++;
      if (g > 220 && r > 180 && b < 120) lime++;
    }
    return { ice, lime, corner: [d[0]!, d[1]!, d[2]!] };
  });
  expect(px.lime).toBe(0);
  expect(px.ice).toBeGreaterThan(300);
  expect(Math.max(...px.corner)).toBeLessThan(90);
});
