import { expect, test, type Page } from './fixtures';

// PLAN 3.6k (audit A4, SPEC 0 rule 4): a fresh phone finishes the intake online, the current plan's
// photos are saved in the background, then the first workout offline shows every picture.
test.beforeEach(() => test.skip(!['iPhone 15', 'iPhone SE'].includes(test.info().project.name), 'iPhone 15 and iPhone SE only'));
test.use({ intake: 'fresh' });

const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const FULL = ['barbell_rack', 'flat_bench', 'adjustable_bench', 'dumbbells', 'cable_station', 'leg_press', 'lat_pulldown', 'seated_row', 'pull_up_bar'];
const ANSWERS = { goal: 'muscle', goals: ['muscle'], units: US, experience: '1_2y', days: 4, minutes: 60, place: 'full', equipmentFor: 'full', equipment: FULL };

const intake = (page: Page) => page.getByTestId('intake');

/** The kept exercise photos: URL and bytes. Read only, the test never fills the cache itself. */
const keptPhotos = (page: Page) =>
  page.evaluate(async () => {
    const cache = await caches.open('exercise-photos');
    const out: { url: string; v: string | null; bytes: number }[] = [];
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      out.push({ url: new URL(req.url).pathname, v: new URL(req.url).searchParams.get('v'), bytes: res ? (await res.blob()).size : 0 });
    }
    return out;
  });

async function photosLoaded(page: Page, selector: string): Promise<number> {
  const imgs = page.locator(selector);
  const n = await imgs.count();
  for (let i = 0; i < n; i++) {
    await expect.poll(() => imgs.nth(i).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0), { timeout: 10_000 }).toBe(true);
  }
  return n;
}

test('fresh phone: intake online, then the first workout offline shows every exercise photo', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate((a) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: 'reveal', answers: a })), ANSWERS);
  await page.reload();
  await expect(intake(page)).toHaveAttribute('data-step', 'reveal');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await page.getByTestId('reveal-cta').locator('button[data-variant="primary"]').tap();
  await expect(page).toHaveURL(/#\/$/);
  const today = page.getByRole('region', { name: "Today's plan day" });
  await expect(today).toBeVisible();

  // The app's own first save, then the background photo save: wait until the kept list stops growing.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  let last = -1;
  let steady = 0;
  await expect
    .poll(
      async () => {
        const n = (await keptPhotos(page)).length;
        steady = n > 0 && n === last ? steady + 1 : 0;
        last = n;
        return steady >= 3;
      },
      { timeout: 60_000, intervals: [700] },
    )
    .toBe(true);
  const kept = await keptPhotos(page);
  // Only the plan's photos, one format, both frames: never the whole catalog.
  expect(kept.every((k) => /\/anygym\/ex\/[^/]+\/[01]\.webp$/.test(k.url))).toBe(true);
  expect(kept.length % 2).toBe(0);
  // PLAN 4.6c (2): each photo is kept under its own file's version.
  expect(kept.every((k) => /^[0-9a-z]{7}$/.test(k.v ?? ''))).toBe(true);
  expect(new Set(kept.map((k) => k.v)).size).toBe(kept.length);
  expect(kept.length).toBeLessThan(120);
  const bytes = kept.reduce((s, k) => s + k.bytes, 0);
  test.info().annotations.push({ type: 'photos kept', description: `${kept.length} files, ${bytes} bytes` });
  console.log(`3.6k photos kept for a 4 day plan: ${kept.length} files, ${bytes} bytes`);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(today).toBeVisible();
    await today.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page).toHaveURL(/#\/workout\//);
    const rows = page.locator('[data-testid^="row-"]');
    await expect(rows.first()).toBeVisible();
    // Every row with a sure demo shows its photo offline, and each picture really drew.
    await expect.poll(() => page.locator('[data-testid="thumb"][data-photo]').count(), { timeout: 10_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    const offlineThumbs = await page.locator('[data-testid="thumb"][data-photo]').count();
    expect(await photosLoaded(page, '[data-testid="thumb"][data-photo] img')).toBeGreaterThan(0);

    // An exercise with a photo: its hero shows both frames offline.
    const first = page.locator('[data-testid^="row-"]:has([data-testid="thumb"][data-photo])').first();
    await first.tap();
    const hero = page.getByTestId('ex-hero');
    await expect(hero).toBeVisible();
    await expect.poll(() => hero.locator('img').count(), { timeout: 10_000 }).toBeGreaterThan(0);
    expect(await photosLoaded(page, '[data-testid="ex-hero"] img')).toBeGreaterThan(0);
    await page.goBack();
    await expect(rows.first()).toBeVisible();

    // The same day online shows no more photos than it did offline: nothing was left out.
    await context.setOffline(false);
    await page.reload();
    await expect(rows.first()).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.locator('[data-testid="thumb"][data-photo]').count()).toBe(offlineThumbs);
  } finally {
    await context.setOffline(false);
  }
});
