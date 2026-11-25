import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { pastIntake } from './helpers/quick';
import { dbPut } from './workout-helpers';

// PLAN M6 (boards 10, 11, 12): the Plan tab, a plan, History and History empty in the Monolith look.
// Rows on graphite split by hairlines, one giant word per screen, no boxes, no icons in rows, and
// never a tick or a number the app is not sure of. Worst case data: a long plan, 30 history rows,
// a 99.99 mi run, the empty state; normal and largest text; nothing clips, no sideways scroll.

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones');
});

const SHOTS = 'reports/monolith/m6';
export const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  const phone = test.info().project.name.replace(/\s+/g, '-');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/${name}-${phone}.jpg`, type: 'jpeg', quality: 55 });
};

/** The phone's largest text size, as tests/monolith-m14.spec.ts does it: every size x1.3. */
export async function largestText(page: Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(150);
}

/** No sideways scroll, and no text pushed past the right edge of the screen. */
export async function noOverflow(page: Page) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const scroller = document.querySelector<HTMLElement>('[data-scroller]');
    const wide = Array.from(document.querySelectorAll<HTMLElement>('main *, [data-scroller] *'))
      .filter((el) => el.getClientRects().length && el.children.length === 0 && (el.textContent ?? '').trim())
      .filter((el) => el.getBoundingClientRect().right > w + 1)
      .map((el) => el.textContent!.trim().slice(0, 40));
    return { sideways: (scroller?.scrollWidth ?? 0) > (scroller?.clientWidth ?? 0) + 1 || document.documentElement.scrollWidth > w + 1, wide };
  });
  expect(r.sideways, 'sideways scroll').toBe(false);
  expect(r.wide, 'text past the right edge').toEqual([]);
}

/** Every row given is at least 44 pt tall. */
export async function rowsTall(page: Page, selector: string) {
  const heights = await page.locator(selector).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
}

/** No box around a row: no visible border on all four sides, no fill. */
async function noBoxes(page: Page, selector: string) {
  const boxed = await page.locator(selector).evaluateAll((els) =>
    els.filter((el) => {
      const s = getComputedStyle(el);
      const four = ['Top', 'Right', 'Bottom', 'Left'].every((k) => parseFloat(s.getPropertyValue(`border-${k.toLowerCase()}-width`)) > 0);
      const fill = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
      return four || fill;
    }).length,
  );
  expect(boxed).toBe(0);
}

const planState = (o: Record<string, unknown>) => ({ id: 'active', planId: 'five-day-split', startedAt: Date.now() - 5 * 86_400_000, weekIndex: 0, nextDayIndex: 2, doneDays: [0, 1], ...o });

test.describe('M6 Plan tab (board 10)', () => {
  test('a plan in use: Plan giant, its days as rows, a tick only on days done this pass, the next day marked @matrix', async ({ page }) => {
    await pastIntake(page);
    await dbPut(page, { planState: [planState({})] });
    await page.goto('./#/plans');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan', exact: true })).toBeVisible();
    await expect(page.getByTestId('plan-line')).toHaveText('Classic 5 Day Split');
    const week = page.getByTestId('plan-week');
    await expect(week.locator('li')).toHaveCount(5);
    await expect(week.locator('li[data-state="done"]')).toHaveCount(2);
    await expect(week.locator('li[data-state="next"]')).toHaveCount(1);
    // A rotation has no calendar: the next day is "Next", never a made up "Today", and the labels are Day N.
    await expect(week.locator('li[data-state="next"]')).toContainText('Next');
    await expect(week.getByTestId('week-row-1')).toContainText('Day 1');
    await expect(week.locator('svg')).toHaveCount(2);
    await rowsTall(page, '[data-testid="plan-week"] a');
    await noBoxes(page, '[data-testid="plan-week"] a, [data-testid^="plan-five"], [data-testid^="place-"]');
    // No icons in the list rows (gap list pattern 5).
    await expect(page.locator('[data-testid^="place-"] svg, [data-testid^="plan-five"] svg')).toHaveCount(0);
    await noOverflow(page);
    await shot(page, 'plan-tab');
    await largestText(page);
    await noOverflow(page);
    await shot(page, 'plan-tab-largest');
    // A row opens the plan.
    await page.getByTestId('week-row-3').tap();
    await expect(page).toHaveURL(/#\/plans\/five-day-split$/);
  });

  test('a fresh plan shows no tick; a set length plan says its week @matrix', async ({ page }) => {
    await pastIntake(page);
    await dbPut(page, { planState: [planState({ planId: 'six-week-volume', nextDayIndex: 0, doneDays: [], weekIndex: 1 })] });
    await page.goto('./#/plans');
    await expect(page.getByTestId('plan-line')).toHaveText('Six Week Volume Builder · Week 2 of 6');
    await expect(page.getByTestId('plan-week').locator('li[data-state="done"]')).toHaveCount(0);
    await expect(page.getByTestId('plan-week').locator('svg')).toHaveCount(0);
  });

  test('no plan in use: the lists as rows, no week @matrix', async ({ page }) => {
    await pastIntake(page);
    await page.goto('./#/plans');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan', exact: true })).toBeVisible();
    await expect(page.getByTestId('plan-week')).toHaveCount(0);
    await expect(page.getByTestId('place-full')).toHaveAccessibleName('Full gym, 5 plans');
    await rowsTall(page, '[data-testid^="place-"], a[data-testid^="plan-"]');
    await noOverflow(page);
    await shot(page, 'plan-tab-none');
  });
});

test.describe('M6 plan detail', () => {
  test('the plan name giant, its days as rows, tips as text rows, Use this plan over the line @matrix', async ({ page }) => {
    await pastIntake(page);
    await page.goto('./#/plans/six-week-volume');
    const title = page.getByRole('heading', { level: 1, name: 'Six Week Volume Builder' });
    await expect(title).toBeVisible();
    expect(parseFloat(await title.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(60);
    await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
    // No boxes: the exercises, the weeks and the tips are plain rows.
    await noBoxes(page, '[data-testid^="plan-item-"], [data-testid="plan-pair"], [data-testid="coach-tips"], [aria-label^="Week "]');
    await rowsTall(page, '[aria-label^="Week "][type="button"]');
    await noOverflow(page);
    await shot(page, 'plan-detail');
    if (await page.getByTestId('coach-tips-toggle').count()) {
      await page.getByTestId('coach-tips-toggle').tap();
      await page.waitForTimeout(400);
      await shot(page, 'plan-detail-tips');
    }
    await largestText(page);
    await noOverflow(page);
    await shot(page, 'plan-detail-largest');
  });

  test('a pair plan scrolled to its pairs @matrix', async ({ page }) => {
    await pastIntake(page);
    await page.goto('./#/plans/five-day-split');
    await page.getByTestId('plan-pair').first().scrollIntoViewIfNeeded();
    await noBoxes(page, '[data-testid="plan-pair"], [data-testid^="plan-item-"]');
    await noOverflow(page);
    await shot(page, 'plan-detail-pairs');
  });
});

const DAY = 86_400_000;
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
/** A straight run north: a point every 15 m. */
const line = (startedAt: number, meters: number, sec: number) =>
  Array.from({ length: Math.floor(meters / 15) + 1 }, (_, i) => [40.77 + (i * 15) / M_PER_DEG, -73.97, Math.round(startedAt + (i * 15 * sec * 1000) / meters), 5]);
/** The worst case: 99.99 mi in 1:59:59 (the points carry a short line; the saved distance is the run's). */
const bigRun = (startedAt: number) => ({
  id: 'worst', startedAt, endedAt: startedAt + 7199_000, type: 'free', movingSec: 7199, elapsedSec: 7199, distanceM: 160_930,
  points: line(startedAt, 3000, 7199), gaps: [], splits: [], splitUnit: 'mi', timedM: 160_930,
});

/** 30 finished workouts, one a day back from yesterday, 4 to 20 sets each, and the 99.99 mi run. */
async function seedHistory30(page: Page) {
  await pastIntake(page);
  const gym = ((await page.evaluate(() => new Promise<Array<{ id: string; isActive: boolean }>>((res) => {
    const r = indexedDB.open('anygym');
    r.onsuccess = () => { const q = r.result.transaction('gyms').objectStore('gyms').getAll(); q.onsuccess = () => res(q.result); };
  }))).find((g) => g.isActive))!;
  const now = Date.now();
  const sessions: unknown[] = [];
  const sets: unknown[] = [];
  for (let i = 0; i < 30; i++) {
    const startedAt = now - (i + 1) * DAY;
    const id = `h${i}`;
    sessions.push({ id, gymId: gym.id, startedAt, endedAt: startedAt + (40 + i) * 60_000, imported: false, exerciseIds: ['bench'] });
    for (let k = 0; k < 4 + (i % 17); k++) sets.push({ id: `${id}-${k}`, sessionId: id, exerciseId: 'bench', order: k, kind: 'work', uncertain: false, reps: 8, load: { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] } });
  }
  await dbPut(page, { sessions, sets, runs: [bigRun(now - 2 * DAY + 3_600_000)] });
}

test.describe('M6 History (board 11)', () => {
  test.use({ locale: 'en-US' });

  test('30 rows and a 99.99 mi run: plain rows, name and date left, the number right, the week line @matrix', async ({ page }) => {
    await seedHistory30(page);
    await page.goto('./#/history');
    await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
    await expect(page.getByTestId('history-row')).toHaveCount(30);
    const run = page.getByTestId('history-run-row');
    await expect(run).toContainText('99.99 mi');
    await expect(run).toContainText('1:59:59');
    await expect(page.getByTestId('history-row').first()).toContainText(/\d+ min/);
    await expect(page.getByTestId('history-row').first()).toContainText(/\d+ sets/);
    await expect(page.getByTestId('history-week')).toContainText(/^This week: /);
    await expect(page.getByTestId('history-runs-link')).toHaveText('Run records and heatmap');
    await expect(page.locator('[data-testid="history-row"] svg, [data-testid="history-run-row"] svg')).toHaveCount(0);
    await noBoxes(page, '[data-testid="history-row"], [data-testid="history-run-row"]');
    await rowsTall(page, '[data-testid="history-row"], [data-testid="history-run-row"], [data-testid="history-runs-link"]');
    await noOverflow(page);
    await shot(page, 'history');
    await largestText(page);
    await noOverflow(page);
    await shot(page, 'history-largest');
  });
});

test('M6 History empty (board 12): No workouts yet, one line, Start workout over the line, no picture @matrix', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/history');
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  const empty = page.locator('section', { has: page.getByRole('heading', { name: 'No workouts yet' }) });
  await expect(empty.getByRole('heading', { name: 'No workouts yet' })).toBeVisible();
  await expect(empty).toContainText('Your first one shows up here.');
  await expect(empty.locator('svg, img')).toHaveCount(0);
  await expect(page.getByTestId('history-week')).toHaveCount(0);
  await expect(page.getByTestId('history-runs-link')).toHaveCount(0);
  await rowsTall(page, 'main button:has-text("Start workout"), [data-scroller] button:has-text("Start workout")');
  await noOverflow(page);
  await shot(page, 'history-empty');
  await largestText(page);
  await noOverflow(page);
  await shot(page, 'history-empty-largest');
  await page.getByRole('button', { name: 'Start workout' }).tap();
  await expect(page).toHaveURL(/#\/$/);
});

test.describe('M6 workout detail', () => {
  test.use({ locale: 'en-US' });
  test('its exercises as rows with hairlines, sets as plain lines, 3 digit weights, no boxes @matrix', async ({ page }) => {
    await seedHistory30(page);
    await page.goto('./#/history/h16');
    await expect(page.getByTestId('history-meta')).toContainText('20 sets');
    await expect(page.getByTestId('history-set')).toHaveCount(20);
    await expect(page.getByTestId('history-set').first()).toContainText('185');
    await noBoxes(page, 'section[aria-label], [data-testid="history-set"], [data-testid="history-set"] span');
    await noOverflow(page);
    await shot(page, 'workout-detail');
    await largestText(page);
    await noOverflow(page);
    await shot(page, 'workout-detail-largest');
  });
});

test.describe('M6 run records and heatmap', () => {
  test.use({ locale: 'en-US', serviceWorkers: 'block' });
  test('records as rows with Not yet in words, the view switch as words @matrix', async ({ page }) => {
    await seedHistory30(page);
    await page.goto('./#/history');
    await page.getByTestId('history-runs-link').tap();
    await expect(page).toHaveURL(/#\/history\/runs$/);
    const records = page.getByTestId('run-record');
    await expect(records).toHaveCount(5);
    await expect(records.filter({ hasText: 'Longest run' })).toContainText('99.99 mi');
    // The switch is words (M15's shared toggle): the picked one is not a filled block.
    const bg = await page.getByRole('radio', { name: 'Records' }).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBe(true);
    await expect(page.getByRole('radio', { name: 'Records' })).toBeChecked();
    await noBoxes(page, '[data-testid="run-record"]');
    await rowsTall(page, '[data-testid="run-record"], [role="radio"]');
    await noOverflow(page);
    await shot(page, 'run-records');
    await largestText(page);
    await noOverflow(page);
    await shot(page, 'run-records-largest');
  });
});
