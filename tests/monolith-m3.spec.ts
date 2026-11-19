import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './fixtures';
import { checkLayout, simulateSafeAreas } from './helpers/layout';
import { stubTiles } from './helpers/tiles';
import { dbAll, dbPut } from './workout-helpers';

// PLAN M3 (SPEC 10, 12.9, 23; M-TEST): the Monolith run summary, its share card and the saved run's
// detail with worst case runs, on the iPhone 15 (the iPhone 15 Pro's size), the iPhone SE and the
// 320 x 568 floor (the SE project at 320 px), at the normal and the largest text size. Shots go to
// reports/monolith/m3/ (small JPEGs); the checks are the real test. The finish screen of a saved run
// opens on the dev route #/dev/run-summary/<id>?dev (VITE_DEV_PREVIEW=1 builds only, like M1's).

test.use({ serviceWorkers: 'block', locale: 'en-US' });

const DIR = process.env.M3_SHOTS ?? 'reports/monolith/m3';
const SIZES: Array<{ name: string; project: string; viewport?: { width: number; height: number } }> = [
  { name: 'iPhone-15', project: 'iPhone 15' },
  { name: 'iPhone-SE', project: 'iPhone SE' },
  { name: '320x568', project: 'iPhone SE', viewport: { width: 320, height: 568 } },
];

const DAY = 86_400_000;
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const MILE = 1609.344;

type Pt = [number, number, number, number];

/** A zigzag north from a park: `legs` legs of `legM` meters, a position every 15 m at `mps`. */
function zigzag(startedAt: number, legs: number, legM: number, mps: number): Pt[] {
  const pts: Pt[] = [];
  let lat = 40.7712;
  let lng = -73.9745;
  let t = startedAt;
  pts.push([lat, lng, t, 5]);
  const step = 15;
  const lngPerM = 1 / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  for (let leg = 0; leg < legs; leg++) {
    for (let d = step; d <= legM; d += step) {
      if (leg % 2 === 0) lat += step / M_PER_DEG;
      else lng += (leg % 4 === 1 ? 1 : -1) * step * lngPerM;
      t += (step / mps) * 1000;
      pts.push([lat, lng, Math.round(t), 5]);
    }
  }
  return pts;
}

const base = (id: string, startedAt: number, points: Pt[], meters: number, movingSec: number) => ({
  id,
  startedAt,
  endedAt: startedAt + movingSec * 1000,
  type: 'free',
  movingSec,
  elapsedSec: movingSec,
  distanceM: meters,
  points,
  gaps: [] as Array<[number, number]>,
  splits: [] as number[],
  splitUnit: 'mi',
  timedM: meters,
});

/** The worst case: 99.99 mi in 1:59:59, 30 splits (one holds a GPS gap), a dashed GPS gap on the route. */
function worstRun(startedAt: number) {
  const points = zigzag(startedAt, 12, 450, 3.5);
  // A GPS gap after the middle point: 2 minutes and about 300 m with no position.
  const mid = Math.floor(points.length / 2);
  for (let i = mid + 1; i < points.length; i++) points[i] = [points[i]![0] + 300 / M_PER_DEG, points[i]![1], points[i]![2] + 120_000, 5];
  const row = base('worst', startedAt, points, 160_930, 7199);
  row.gaps = [[points[mid]![2], points[mid + 1]![2]]];
  row.splits = Array.from({ length: 30 }, (_, i) => 230 + ((i * 7) % 40));
  return { ...row, splitGaps: [7], city: 'Llanfairpwllgwyngyll' };
}

/** A plain 2.2 mi run: the first run, so it proves the records it covers (longest run, fastest mile). */
function provedRun(startedAt: number) {
  const points = zigzag(startedAt, 8, 450, 3.4);
  const row = base('proved', startedAt, points, 3600, Math.round(3600 / 3.4));
  row.splits = [473, 470];
  return row;
}

/** A slow short run after faster longer ones: it sets nothing. */
function plainRun(startedAt: number) {
  const points = zigzag(startedAt, 4, 450, 2.2);
  const row = base('none', startedAt, points, 1800, Math.round(1800 / 2.2));
  row.splits = [731];
  return row;
}

const shortRun = (startedAt: number) => base('short', startedAt, zigzag(startedAt, 1, 30, 3), 30, 10);
const noRoute = (startedAt: number) => ({ ...base('noroute', startedAt, [], 0, 600), timedM: 0 });

async function seed(page: Page, worst = true) {
  await stubTiles(page);
  await simulateSafeAreas(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const now = Date.now();
  await dbPut(page, { runs: [provedRun(now - 6 * DAY), ...(worst ? [worstRun(now - 5 * DAY)] : []), plainRun(now - 4 * DAY), shortRun(now - 3 * DAY), noRoute(now - 2 * DAY)] });
}

async function shot(page: Page, name: string, size: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}-${size}.jpg`, type: 'jpeg', quality: 60, animations: 'disabled' });
}

/** The phone's largest text size, as the 130% specs do it (tests/text-130-1.7e.spec.ts): every size x1.3. */
async function largestText(page: Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(200);
}

/** Text cut by its own box or a clipping parent, numbers wider than their field, or a sideways scroll. */
async function clipping(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document.body;
    const bad: string[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (el.closest('[aria-hidden="true"]') || el.tagName === 'svg' || el.closest('svg') || el.tagName === 'CANVAS') continue;
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') bad.push(`${el.tagName} "${el.textContent!.trim().slice(0, 30)}" ${el.scrollWidth} > ${el.clientWidth}`);
      if (r.right > innerWidth + 0.5 || r.left < -0.5) bad.push(`${el.tagName} "${el.textContent!.trim().slice(0, 30)}" past the screen edge`);
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (!/(hidden|clip)/.test(s.overflowX)) continue;
        const q = p.getBoundingClientRect();
        if (r.left < q.left - 1 || r.right > q.right + 1) bad.push(`${el.tagName} "${el.textContent!.trim().slice(0, 30)}" cut sideways by ${p.className}`);
        break;
      }
    }
    for (const f of Array.from(root.querySelectorAll<HTMLElement>('[data-field]'))) {
      const n = f.querySelector<HTMLElement>('[data-value]')!;
      const fr = f.getBoundingClientRect();
      const nr = n.getBoundingClientRect();
      const lines = Math.round(nr.height / parseFloat(getComputedStyle(n).lineHeight));
      if (nr.right > fr.right + 0.5 || lines > 1) bad.push(`field "${n.textContent}" ${nr.right.toFixed(1)} > ${fr.right.toFixed(1)} (lines ${lines})`);
    }
    if (document.documentElement.scrollWidth > innerWidth) bad.push(`page scrolls sideways ${document.documentElement.scrollWidth} > ${innerWidth}`);
    return bad;
  }, scope);
}

/** At least 44 x 44 to tap. */
async function target44(l: Locator) {
  await l.scrollIntoViewIfNeeded();
  const b = (await l.boundingBox())!;
  expect(b.height, await l.innerText()).toBeGreaterThanOrEqual(44);
  expect(b.width, await l.innerText()).toBeGreaterThanOrEqual(44);
}

async function openSummary(page: Page, id: string) {
  await page.goto(`./?dev#/dev/run-summary/${id}`);
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await expect(page.getByTestId('celebrate-big')).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(400);
}

for (const size of SIZES) {
  test.describe(`M3 at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      test.skip(test.info().project.name !== size.project, `M3 ${size.name}: ${size.project} project`);
      if (size.viewport) await page.setViewportSize(size.viewport);
      // The records test leaves the 99.99 mi run out, so the plain 2.2 mi run holds the longest run.
      await seed(page, !test.info().title.startsWith('run summary: records'));
    });

    test('run summary, worst case: map hero up top, stat row fits, 30 splits with one Best, Done in reach', async ({ page }) => {
      await openSummary(page, 'worst');
      const vh = page.viewportSize()!.height;
      // The route is the hero of the top half: it starts there, spans the screen and is the tallest piece.
      const map = (await page.getByTestId('summary-map').boundingBox())!;
      expect(map.y).toBeLessThan(vh / 2);
      expect(map.width).toBeCloseTo(page.viewportSize()!.width, 0);
      expect(map.height).toBeGreaterThanOrEqual(Math.min(220, vh * 0.38));
      await expect(page.getByTestId('summary-map')).toHaveAttribute('data-dashed', '1');
      // The stat row: exactly what lib/run printed, never clipped.
      await expect(page.getByTestId('summary-distance')).toHaveText('99.99');
      await expect(page.getByTestId('summary-time')).toHaveText('1:59:59');
      const splits = page.getByTestId('summary-splits').locator('li');
      await expect(splits).toHaveCount(30);
      await expect(splits.filter({ hasText: 'Best' })).toHaveCount(1);
      await expect(splits.nth(6)).toHaveText('Mile 7GPS gap');
      // Done, Share card and Export GPX: 44 pt to tap; Done is on screen without a scroll.
      const done = (await page.getByTestId('summary-done').boundingBox())!;
      expect(done.y + done.height).toBeLessThanOrEqual(vh);
      await target44(page.getByTestId('summary-done'));
      await target44(page.getByTestId('run-share-card'));
      expect(await clipping(page, '[data-testid="run-summary"]')).toEqual([]);
      await shot(page, 'summary-worst', size.name);
      await checkLayout(page, { scope: '[data-testid="run-summary"]', primary: page.getByTestId('summary-done') });
      await page.getByTestId('summary-splits').locator('li').nth(12).scrollIntoViewIfNeeded();
      await shot(page, 'summary-worst-splits', size.name);
      await target44(page.getByTestId('run-export-gpx'));
      await shot(page, 'summary-worst-end', size.name);
      await page.getByTestId('summary-map').scrollIntoViewIfNeeded();
      await largestText(page);
      expect(await clipping(page, '[data-testid="run-summary"]')).toEqual([]);
      await target44(page.getByTestId('summary-done'));
      await shot(page, 'summary-worst-largest-text', size.name);
    });

    test('run summary: records proved, records none, under 50 m, no route', async ({ page }) => {
      await openSummary(page, 'proved');
      await expect(page.getByTestId('run-summary')).toContainText('Longest run');
      expect(await clipping(page, '[data-testid="run-summary"]')).toEqual([]);
      await shot(page, 'summary-records', size.name);
      await page.getByTestId('summary-win').or(page.getByTestId('summary-win-row')).first().scrollIntoViewIfNeeded();
      await shot(page, 'summary-records-cards', size.name);

      await openSummary(page, 'none');
      await expect(page.getByTestId('summary-win')).toHaveCount(0);
      await expect(page.getByTestId('summary-win-row')).toHaveCount(0);
      // One timed split: nothing to be best against, so no mark.
      await expect(page.getByTestId('summary-splits')).not.toContainText('Best');
      expect(await clipping(page, '[data-testid="run-summary"]')).toEqual([]);
      await shot(page, 'summary-no-records', size.name);

      for (const id of ['short', 'noroute']) {
        await openSummary(page, id);
        await expect(page.getByTestId('summary-plain')).toBeVisible();
        await expect(page.getByTestId('summary-distance')).toHaveCount(0);
        await target44(page.getByTestId('summary-discard'));
        await target44(page.getByTestId('summary-keep'));
        expect(await clipping(page, '[data-testid="run-summary"]')).toEqual([]);
        await shot(page, `summary-${id}`, size.name);
        await largestText(page);
        expect(await clipping(page, '[data-testid="run-summary"]')).toEqual([]);
        await shot(page, `summary-${id}-largest-text`, size.name);
      }
    });

    test('share card: the sheet, privacy on, the card fits and Share is 44 pt', async ({ page }) => {
      await openSummary(page, 'worst');
      await page.getByTestId('run-share-card').tap();
      const sheet = page.getByTestId('run-share-sheet');
      await expect(sheet).toBeVisible();
      await expect(page.getByRole('switch', { name: /Hide start and end/ })).toBeChecked();
      await expect(page.getByTestId('run-share-go')).toBeEnabled();
      const card = (await page.getByTestId('run-share-preview').boundingBox())!;
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.x + card.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      await target44(page.getByTestId('run-share-go'));
      expect(await clipping(page, '[data-testid="run-share-sheet"]')).toEqual([]);
      await page.waitForTimeout(400);
      await shot(page, 'share-sheet', size.name);
      // The card itself, full size, as the share sheet gets it.
      const png = await page.getByTestId('run-share-preview').evaluate((c: HTMLCanvasElement) => c.toDataURL('image/jpeg', 0.6));
      mkdirSync(DIR, { recursive: true });
      const { writeFileSync } = await import('node:fs');
      if (size.name === 'iPhone-15') writeFileSync(`${DIR}/share-card-worst.jpg`, Buffer.from(png.split(',')[1]!, 'base64'));
    });

    test('run detail, worst case: same family, stats fit, buttons 44 pt', async ({ page }) => {
      await page.goto('./#/history/run/worst');
      await expect(page.getByTestId('run-detail')).toBeVisible();
      await page.waitForTimeout(400);
      await expect(page.getByTestId('detail-distance')).toContainText('99.99');
      await expect(page.getByTestId('summary-splits').locator('li')).toHaveCount(30);
      expect(await clipping(page, 'main')).toEqual([]);
      await shot(page, 'detail-worst', size.name);
      await checkLayout(page);
      await target44(page.getByTestId('run-share-card'));
      await target44(page.getByTestId('run-export-gpx'));
      await shot(page, 'detail-worst-end', size.name);
      await page.evaluate(() => scrollTo(0, 0));
      await largestText(page);
      expect(await clipping(page, 'main')).toEqual([]);
      await shot(page, 'detail-worst-largest-text', size.name);
      for (const id of ['short', 'noroute']) {
        await page.goto(`./#/history/run/${id}`);
        await expect(page.getByTestId('run-detail-plain')).toBeVisible();
        await shot(page, `detail-${id}`, size.name);
      }
    });
  });
}
