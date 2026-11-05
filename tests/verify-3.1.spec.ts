// Independent verification of PLAN 3.1 (curated plans): week strips against the JSON for chosen
// exercises, Undo restoring the previous plan, no personal names, 130% text, reduced motion, offline.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';
import { dbAll, watchErrors } from './workout-helpers';

const six = JSON.parse(readFileSync('data/plans/six-week-volume.json', 'utf8')) as {
  days: Array<{ n: number; name: string; items: Array<{ exercise: string; weeks: Array<{ sets?: number; reps?: number; rounds?: number }> }> }>;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SPOT = ['Front Squat', 'Leg Press', 'Bulgarian Split Squat', '28 Method Squat', 'Leg Extension', 'Bent Over Barbell Row', 'Overhead Press', '30 Second Interval Sprint'];
const DIR = 'reports/shots/3.1/verify';
const tag = () => test.info().project.name.replace(/ /g, '-');

test.beforeEach(async ({ page }) => simulateSafeAreas(page));

async function noNames(page: Page) {
  const text = await page.evaluate(() => document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' '));
  expect(text).not.toMatch(/rabah|ohrabah/i);
}

test('spot check 8 exercises in weeks 1, 3, 6 against the JSON; lone tile; no personal names @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  // PLAN 3.5: home, travel and bodyweight have plans too.
  await expect(page.locator('[data-testid^="place-"]')).toHaveCount(4);
  await noNames(page);
  await page.screenshot({ path: `${DIR}/picker-${tag()}.png` });
  await page.goto('./#/plans/place/full');
  await noNames(page);
  await expect(page.getByText('No plans here yet')).toHaveCount(0);
  await page.screenshot({ path: `${DIR}/place-${tag()}.png` });
  await page.goto('./#/plans/place/full/six-week-volume');
  await noNames(page);
  const all = six.days.flatMap((d) => d.items);
  for (const name of SPOT) {
    const it = all.find((x) => x.exercise === name)!;
    expect(it, name).toBeTruthy();
    const t = page.getByTestId(`week-table-${slug(name)}`).first();
    await expect(t.getByTestId('week-cell')).toHaveCount(6);
    for (const wk of [1, 3, 6]) {
      await page.getByRole('button', { name: `Week ${wk}` }).tap();
      const w = it.weeks[wk - 1]!;
      const cell = t.locator('li[data-current]');
      const label = (await cell.getAttribute('aria-label'))!;
      const ws = it.weeks;
      const varies = (k: 'sets' | 'reps' | 'rounds') => new Set(ws.map((x) => x[k])).size > 1;
      const want = ws[0]!.rounds !== undefined ? String(w.rounds) : varies('sets') && varies('reps') ? `${w.sets} × ${w.reps}` : varies('reps') ? String(w.reps) : String(w.sets);
      expect(label, `${name} wk${wk}`).toBe(`Week ${wk}: ${want}`);
      // The line above shows the same week.
      const line = await page.getByTestId(`plan-item-${slug(name)}`).first().innerText();
      if (w.sets && w.reps) expect(line).toContain(`${w.sets} sets × ${w.reps}`);
    }
  }
  await page.getByTestId('week-table-front-squat').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${DIR}/strips-${tag()}.png` });
  await page.goto('./#/plans/place/full/five-day-split');
  await noNames(page);
  expect(errors).toEqual([]);
});

test('Use this plan over another plan: Undo restores the previous plan, double tap saves once @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/place/full/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  const first = (await dbAll(page, 'planState')) as Array<{ planId: string }>;
  expect(first[0]!.planId).toBe('five-day-split');
  await page.goto('./#/plans/place/full/six-week-volume');
  const use = page.getByRole('button', { name: 'Use this plan' });
  await use.dblclick();
  await expect(page.getByRole('status').filter({ hasText: 'Plan saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  expect(((await dbAll(page, 'planState')) as Array<{ planId: string }>).map((p) => p.planId)).toEqual(['six-week-volume']);
  await page.screenshot({ path: `${DIR}/saved-${tag()}.png` });
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(async () => ((await dbAll(page, 'planState')) as Array<{ planId: string }>).map((p) => p.planId)).toEqual(['five-day-split']);
  await page.reload();
  expect(((await dbAll(page, 'planState')) as Array<{ planId: string }>).map((p) => p.planId)).toEqual(['five-day-split']);
  expect(errors).toEqual([]);
});

test('offline, reload, zero ids: the place screens stay calm @matrix', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('place-full')).toBeVisible();
  await page.goto('./#/plans/place/full/six-week-volume');
  await expect(page.getByTestId('week-table-front-squat')).toBeVisible();
  for (const bad of ['nope', '0', '%20', 'constructor', '__proto__']) {
    await page.goto(`./#/plans/place/${bad}`);
    await expect(page.getByRole('heading', { name: 'No plans here yet' })).toBeVisible();
  }
  await page.goto('./#/plans/place/full/nope');
  await expect(page).toHaveURL(/#\/plans\/place\/full$/);
  await context.setOffline(false);
  expect(errors.filter((e) => !/Failed to load resource|offline/i.test(e))).toEqual([]);
});

test('130% text and reduced motion on the plan screens', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const route of ['./#/plans', './#/plans/place/full', './#/plans/place/full/six-week-volume', './#/plans/place/cardio']) {
    await page.goto(route);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const s = getComputedStyle(el);
        const size = parseFloat(s.fontSize);
        const line = parseFloat(s.lineHeight);
        el.style.fontSize = `${size * 1.3}px`;
        if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
      }
    });
    await page.waitForTimeout(200);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways, route).toBeLessThanOrEqual(1);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((el) => !el.closest('[aria-hidden="true"]') && el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1 && /(hidden|clip)/.test(getComputedStyle(el).overflowX) && (el.textContent ?? '').trim())
        .map((el) => `${el.tagName}.${el.className} "${(el.textContent ?? '').trim().slice(0, 30)}"`),
    );
    expect(clipped, route).toEqual([]);
    await page.screenshot({ path: `${DIR}/t130-${route.replace(/\W+/g, '_')}-${tag()}.png` });
  }
  expect(errors).toEqual([]);
});
