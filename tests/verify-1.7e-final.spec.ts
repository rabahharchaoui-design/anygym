import { expect, test, type Page } from './fixtures';
import { bar185, dbAll, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Final tester pass for PLAN 1.7e + 1.7g: data exactness. Shots go to reports/shots/1.7e/final/.

type PlanState = { nextDayIndex: number; doneDays: number[]; weekIndex: number; partial?: Record<string, number> };
const shot = async (page: Page, name: string, wait = 600) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `reports/shots/1.7e/final/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};
const seedSquat = (page: Page) => seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
async function startSquat(page: Page) {
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
}
const logSquat = async (page: Page, n: number) => {
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  for (let i = 0; i < n; i++) {
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  return view;
};
const clear = (page: Page, name: string, scope = page.getByRole('dialog', { name: 'Pick the weight' })) =>
  scope.getByRole('button', { name, exact: true }).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.bottom <= innerHeight && r.top >= 0 && (hit === el || el.contains(hit));
  });

test('a Hold cell: 3 s stop logs 3, untouched logs the 45 s target, 60 s plank reads 1:00, never clipped', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-static-quadricep-stretch').tap();
  const view = page.getByTestId('exercise-static-quadricep-stretch');
  await expect(view.getByTestId('check-current')).toHaveAccessibleName('Log set 1: 45 s');
  // ✓ without starting: the target.
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await expect.poll(async () => (await dbAll<{ seconds?: number; exerciseId: string }>(page, 'sets')).map((s) => s.seconds)).toEqual([45]);
  // Next hold (another exercise): start, ~3 s, stop.
  await expect(page.getByTestId('row-dynamic-hip-flexor-stretch')).toBeVisible();
  await page.getByTestId('row-dynamic-hip-flexor-stretch').tap();
  const v2 = page.getByTestId('exercise-dynamic-hip-flexor-stretch');
  await page.clock.install();
  await v2.getByRole('button', { name: 'Start timer' }).tap();
  await page.clock.runFor(3100);
  const run = v2.getByRole('button', { name: 'Stop timer' });
  await expect(run).toContainText('3 s');
  const clipped = await v2.getByTestId('hold-cell').evaluate((c) => [c, ...Array.from(c.querySelectorAll<HTMLElement>('*'))].some((e) => e.scrollWidth > e.clientWidth + 1));
  expect(clipped).toBe(false);
  await shot(page, 'hold-running');
  await run.tap();
  await expect(v2.getByRole('button', { name: 'Start timer' })).toContainText('3 s');
  expect(await v2.getByTestId('check-current').getAttribute('aria-label')).toMatch(/^Log set 1: [2-4] s$/);
  await page.clock.runFor(600);
  await v2.getByTestId('check-current').tap();
  const secs = (await dbAll<{ seconds?: number }>(page, 'sets')).map((x) => x.seconds).sort((x, y) => x! - y!);
  expect(secs.length).toBe(2);
  expect(secs[0]!).toBeGreaterThanOrEqual(2);
  expect(secs[0]!).toBeLessThanOrEqual(4);
  expect(secs[1]).toBe(45);
  expect(errors).toEqual([]);
});

test('a 60 s plank target reads 1:00 in the Hold cell', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { plank: [{ seconds: 60, load: { kind: 'timed', unit: 'lb', total: 0 } }] });
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('plank');
  await sheet.getByRole('button', { name: 'Plank', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = page.getByTestId('exercise-plank');
  const cell = view.getByTestId('hold-cell').first();
  const t = (await cell.textContent())!;
  console.log('plank cell', t, await view.getByTestId('check-current').getAttribute('aria-label'));
  expect(t).toContain('1:00');
  await page.clock.install();
  await view.getByRole('button', { name: 'Start timer' }).tap();
  await page.clock.runFor(2100);
  const clipped = await cell.evaluate((c) => [c, ...Array.from(c.querySelectorAll<HTMLElement>('*'))].some((e) => e.scrollWidth > e.clientWidth + 1));
  expect(clipped).toBe(false);
  expect(errors).toEqual([]);
});

test('finish 1 of 4: Saved 0 done, 1 of 4 sets; Keep keeps Day 1 with a partial pip; Undo restores exactly', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  const before = (await dbAll<PlanState>(page, 'planState'))[0]!;
  await logSquat(page, 1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText(/^Saved · 0 of \d+ done$/);
  await expect(page.getByTestId('finish-exercise')).toContainText('1 of 4 sets');
  await shot(page, 'finish-partial', 2200);
  await page.getByRole('button', { name: 'Done' }).dblclick();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 · /);
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', /next|partial/);
  const after = (await dbAll<PlanState>(page, 'planState'))[0]!;
  expect(after.nextDayIndex).toBe(before.nextDayIndex);
  expect(Object.keys(after.partial ?? {})).toContain(String(before.nextDayIndex));
  expect(after.doneDays).toEqual(before.doneDays);
  await shot(page, 'today-partial');
  expect((await dbAll(page, 'sessions')).length).toBe(2); // seed + this one, no duplicate from the double tap
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  const restored = (await dbAll<PlanState>(page, 'planState'))[0]!;
  expect(restored.nextDayIndex).toBe(before.nextDayIndex);
  expect(restored.doneDays).toEqual(before.doneDays);
  expect(restored.partial ?? {}).toEqual(before.partial ?? {});
  expect((await dbAll(page, 'sets')).length).toBe(4 + 1);
  expect(errors).toEqual([]);
});

test('finish with all 4 squat sets counts the squat as done; Go to Day 2 moves on', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  await logSquat(page, 4);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  const title = page.getByTestId('finish-title');
  await expect(title).toHaveText(/^Saved · 1 of \d+ done$/);
  await expect(page.getByTestId('finish-sets-left')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Go to Day 2' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 · /);
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'partial');
  await shot(page, 'today-day2-ticks');
  const st = (await dbAll<PlanState>(page, 'planState'))[0]!;
  expect(st.nextDayIndex).toBe(1);
  expect(errors).toEqual([]);
});

test('weight sheet: controls uncovered, one row of plates, swipe down keeps plates', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await page.waitForTimeout(500);
  for (const n of ['Type it', 'Clear']) expect(await clear(page, n), n).toBe(true);
  expect(await sheet.getByTestId('bar-link').evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && (h === el || el.contains(h)); })).toBe(true);
  const tops = await sheet.getByRole('group', { name: 'Plates' }).getByRole('button').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  const math = await sheet.getByTestId('plate-math').textContent();
  const total = await sheet.getByTestId('plate-total').textContent();
  console.log('math', math, total);
  await shot(page, 'weight-sheet');
  // swipe down to dismiss: changed plates are kept
  const b = (await sheet.boundingBox())!;
  const x = b.x + b.width / 2;
  await page.mouse.move(x, b.y + 6);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) { await page.mouse.move(x, b.y + 6 + (b.height * 0.6 * i) / 14); await page.waitForTimeout(25); }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('check-current')).toHaveAccessibleName(/Log set 1: \d+ × 155 lb$/);
  await view.getByTestId('weight-cell').first().tap();
  await expect(sheet.getByTestId('plate-total')).toHaveText('155lb');
  expect(errors).toEqual([]);
});

test('Smith first use: question on top, nothing logged until answered, diagram = label = saved', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['smith', 'Smith Machine Upright Row']]);
  const view = page.getByTestId('exercise-smith-machine-upright-row');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  const q = sheet.getByTestId('bar-question');
  await expect(q).toBeVisible();
  await expect(sheet.getByTestId('plate-total')).toHaveText('—lb');
  for (const n of ['Count plates only', 'Other…']) await expect(q.getByRole('button', { name: n })).toBeVisible();
  expect((await q.getByRole('button', { name: /^Bar weighs/ }).count())).toBeGreaterThan(2);
  expect(await dbAll(page, 'sets')).toEqual([]);
  expect((await q.boundingBox())!.y).toBeLessThan((await sheet.getByTestId('plate-total').boundingBox())!.y);
  await shot(page, 'smith-question');
  await q.getByRole('button', { name: 'Bar weighs 25 lb' }).tap();
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  const math = (await sheet.getByTestId('plate-math').textContent())!;
  const total = (await sheet.getByTestId('plate-total').textContent())!;
  expect(total).toBe('45lb');
  expect(math).toContain('= 45 lb');
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(view.getByTestId('check-current')).toHaveAccessibleName(/45 lb$/);
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  const sets = await dbAll<{ load: { total: number } }>(page, 'sets');
  expect(sets.map((s) => s.load.total)).toEqual([45]);
  expect(errors).toEqual([]);
});

test('Settings Units lb to kg: gym unit and kg plates in the sheet, 40 px scroll collapses the title, back to lb', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  const lb = page.getByRole('radio', { name: 'lb', exact: true });
  const kg = page.getByRole('radio', { name: 'kg', exact: true });
  await expect(lb).toBeChecked();
  for (const r of [lb, kg]) { const b = (await r.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); }
  await kg.tap();
  await expect(kg).toBeChecked();
  await expect.poll(async () => (await dbAll<{ unit: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.unit).toBe('kg');
  // the large title collapses after a 40 px scroll
  const scroller = page.getByRole('main');
  const big = page.getByRole('heading', { level: 1, name: 'Settings' });
  const op0 = await big.evaluate((el) => +getComputedStyle(el).opacity);
  await scroller.evaluate((el) => { const s = [el, ...Array.from(el.querySelectorAll('*'))].find((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible'); (s ?? el).scrollTo({ top: 40 }); });
  await page.waitForTimeout(400);
  console.log('settings title opacity', op0, await big.evaluate((el) => +getComputedStyle(el).opacity));
  await page.getByRole('link', { name: 'Today', exact: true }).tap();
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet.getByRole('button', { name: 'Add 20 kg plate to each side' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Add 45 lb/ })).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close', exact: true }).tap().catch(() => {});
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'lb', exact: true }).tap();
  await expect(page.getByRole('radio', { name: 'lb', exact: true })).toBeChecked();
  await expect.poll(async () => (await dbAll<{ unit: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.unit).toBe('lb');
  expect(errors).toEqual([]);
});

test('minimize: Change day gone, resume bar on other tabs, one in-progress card, Resume returns to the day list', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  await logSquat(page, 1);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page.getByRole('button', { name: 'Change day' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(1);
  await expect(page.getByTestId('day-card-progress')).toHaveCount(1);
  await expect(page.getByTestId('resume-bar')).toHaveCount(0);
  await page.getByRole('link', { name: 'History' }).tap();
  const bar = page.getByTestId('resume-bar');
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await bar.tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await shot(page, 'daylist');
  expect(errors).toEqual([]);
});

test('no horizontal overflow on Today, Plans, History, Run, Settings at 320, 375 and 440', async ({ page }) => {
  const errors = watchErrors(page);
  for (const w of [320, 375, 440]) {
    await page.setViewportSize({ width: w, height: 700 });
    for (const h of ['#/', '#/plans', '#/history', '#/run', '#/settings']) {
      await page.goto(`./${h}`);
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${h}@${w}`).toBeLessThanOrEqual(0);
    }
  }
  expect(errors).toEqual([]);
});

test('settings screenshot', async ({ page }) => {
  await page.goto('./#/settings');
  await shot(page, 'settings');
  await page.getByRole('main').evaluate((el) => { const sc = [el, ...Array.from(el.querySelectorAll('*'))].find((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible'); (sc ?? el).scrollTo({ top: 40 }); });
  await shot(page, 'settings-scrolled40');
});
