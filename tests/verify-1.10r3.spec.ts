import { expect, test, type Page } from './fixtures';
import { fullyShown } from './helpers/layout';
import { readFileSync } from 'node:fs';

const oh = JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8'));
const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};
const dbAll = (page: Page, store: string) =>
  page.evaluate((name) => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const q = req.result.transaction(name, 'readonly').objectStore(name).getAll(); q.onsuccess = () => (resolve(q.result), req.result.close()); };
  }), store);
// PLAN 1.7c: the band warm ups are hand mapped as bodyweight (reps only), so nothing is asked.
const answer = async (page: Page) => {
  await expect(page.locator('[data-testid^="exercise-"]')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
};
// PLAN 1.7c: a plan day opens on the day list; each exercise opens from its row.
async function start(page: Page, n: number) {
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: /Use this plan|Go to Today/ }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: new RegExp(`Day ${n} ·`) }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.locator('[data-row]').first().waitFor();
}

test('r3: warm up tag + db kind', async ({ page }) => {
  const errors = watch(page);
  await start(page, 2);
  const groups = page.locator('[data-testid="pair-group"][data-warmup]');
  expect(await groups.count()).toBeGreaterThan(0);
  expect(await groups.first().innerText()).toContain('Warm up');
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/1.10/r3-warmup-${test.info().project.name.replace(/ /g, '-')}.png` });
  await groups.first().locator('[data-row]').first().tap();
  await answer(page);
  await page.getByTestId('check-current').tap();
  await expect.poll(async () => (await dbAll(page, 'sets')).length).toBe(1);
  const sets = await dbAll(page, 'sets');
  expect(sets[0].kind).toBe('warmup');
  expect(errors).toEqual([]);
});

test('r3: finisher in viewer and workout', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/plans/five-day-split');
  for (let i = 0; i < oh.days.length; i++) {
    const d = oh.days[i];
    const reg = page.getByRole('region', { name: new RegExp(`^Day ${i + 1} ·`) });
    const fin = reg.locator(`[data-testid="finisher-day-${i + 1}"]`);
    if (!d.finisher) { expect(await fin.count(), `day ${i + 1} no finisher`).toBe(0); continue; }
    const t = (await fin.innerText()).replace(/\s+/g, ' ');
    expect(t.toLowerCase()).toContain(d.finisher.name.toLowerCase());
    if (d.finisher.minutes === null) expect(t).not.toMatch(/\d/);
    else expect(t).toContain(String(d.finisher.minutes));
  }
  if (test.info().project.name === 'iPhone 15') { await page.screenshot({ path: 'reports/shots/1.10/r3-viewer.png', fullPage: true }); }
  // workout: day 2 finisher (15 min) is the last row, and opens as a timed hold.
  await start(page, 2);
  const last = page.getByTestId('finisher');
  await expect(last).toHaveCount(1);
  expect(await page.locator('[data-row]').last().getAttribute('data-testid')).toBe('finisher');
  const f = oh.days[1].finisher;
  expect((await last.innerText()).toLowerCase()).toContain(f.name.toLowerCase());
  await last.tap();
  const view = page.getByTestId('exercise-finisher-stair-climbing');
  await expect(view).toBeVisible();
  await expect(view.getByRole('button', { name: 'Start timer' })).toBeVisible();
  await expect(view.getByTestId('hold-cell')).toHaveText([`${f.minutes * 60 < 60 ? `${f.minutes * 60} s` : `${f.minutes}:00`}Tap to start`]);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/1.10/r3-finisher-d2-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(errors).toEqual([]);
});

test('r3: long title fits on SE', async ({ page }) => {
  const errors = watch(page);
  await start(page, 2);
  await page.getByTestId('row-band-internal-shoulder-rotation-90-degrees').tap();
  await answer(page);
  const view = page.getByTestId('exercise-band-internal-shoulder-rotation-90-degrees');
  const title = view.getByRole('heading', { name: 'Band Internal Shoulder Rotation (90 degrees)' });
  await expect(title).toBeVisible();
  await page.waitForTimeout(450);
  expect(await fullyShown(title)).toBe(true);
  await page.screenshot({ path: `reports/shots/1.10/r3-title-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(await page.getByRole('main').evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('r3: day 5 finisher null minutes in workout', async ({ page }) => {
  const errors = watch(page);
  await start(page, 5);
  const last = page.getByTestId('finisher');
  await expect(last).toHaveCount(1);
  const t = (await last.innerText()).replace(/\n+/g, ' / ');
  expect(t).toContain('Cycling');
  expect(t).not.toMatch(/\d+ min/);
  await last.tap();
  const view = page.locator('[data-testid^="exercise-finisher-"]');
  await expect(view.getByRole('heading', { name: 'Cycling' })).toBeVisible();
  expect(await view.innerText()).not.toMatch(/\d+ min/);
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/1.10/r3-finisher-d5-${test.info().project.name.replace(/ /g, '-')}.png` });
  expect(errors).toEqual([]);
});
