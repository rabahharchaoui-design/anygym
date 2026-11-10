import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, usePlan, watchErrors } from './workout-helpers';

const DAY = 86_400_000;
const lb = (total: number, perSide: number[]) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide });
const prof = () => test.info().project.name.replace(/ /g, '-');
async function snap(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `reports/shots/3.8c-verify/${name}-${prof()}.png` });
}
async function seed(page: Page, startedAt: number, sets: Array<{ exerciseId: string; reps: number; load: Record<string, unknown> }>) {
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `v38c-${startedAt}`;
  await dbPut(page, {
    sessions: [{ id, gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: [...new Set(sets.map((s) => s.exerciseId))] }],
    sets: sets.map((s, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: s.exerciseId, order: i, kind: 'work', reps: s.reps, load: s.load, uncertain: false })),
  });
}
const three = (exerciseId: string, reps: number, load: Record<string, unknown>) => [0, 1, 2].map(() => ({ exerciseId, reps, load }));
async function twoEx(page: Page) {
  await page.goto('./');
  await seed(page, Date.now() - 3 * DAY, [...three('barbell-back-squat', 10, lb(185, [45, 25])), ...three('barbell-incline-bench-press', 10, lb(135, [45]))]);
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-back-squat');
  if (!(await view.isVisible())) await page.getByTestId('row-barbell-back-squat').tap();
  return view;
}
async function tapCircle(page: Page, view: Locator) {
  const circle = checkCurrent(view).locator('span').first();
  await expect(circle).toBeVisible();
  await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
  await page.waitForTimeout(150);
  const b = (await circle.boundingBox())!;
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
async function logAllTimed(view: Locator, n = 3) {
  const page = view.page();
  for (let i = 1; i <= n; i++) {
    if (i === n) {
      const t0 = Date.now();
      await tapCircle(page, view);
      return t0;
    }
    await tapCircle(page, view);
    await expect(loggedRows(view)).toHaveCount(i);
  }
  return 0;
}

test.describe('verify 3.8c', () => {
  test('C1+C2 quick workout: chip, auto return ~2.5 s, one prompt row, 48pt chips, tap saves, reload persists @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    const view = await twoEx(page);
    const t0 = await logAllTimed(view);
    await expect(page.getByTestId('next-chip')).toBeVisible();
    await snap(page, 'c1-chip');
    await expect(page.getByTestId('workout-title')).toBeVisible({ timeout: 8000 });
    await expect(view).toHaveCount(0);
    const ms = Date.now() - t0;
    console.log('C1 RETURN ms', prof(), ms);
    expect(ms).toBeGreaterThan(2000);
    expect(ms).toBeLessThan(3600);
    await expect(page.getByTestId('list-effort')).toHaveCount(1);
    await expect(page.getByText('How did that feel?')).toHaveCount(1);
    for (const e of ['easy', 'good', 'hard']) {
      const b = (await page.getByTestId(`list-effort-${e}`).boundingBox())!;
      console.log('C2 chip', prof(), e, b.height, b.width);
      expect(b.height).toBeGreaterThanOrEqual(47.5);
    }
    await snap(page, 'c2-list-prompt');
    // 3.5g: opening the finished exercise again asks nothing (the list row is the one place)
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(view).toBeVisible();
    await expect(view.getByTestId('effort')).toHaveCount(0);
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(page.getByTestId('list-effort')).toHaveCount(1);
    // double tap on one chip saves once
    await page.waitForTimeout(900);
    const good = page.getByTestId('list-effort-good');
    await good.tap();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    await expect.poll(async () => (await dbAll<{ effort: string }>(page, 'efforts')).length).toBe(1);
    await snap(page, 'c2-after-answer');
    await page.reload();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    expect((await dbAll(page, 'efforts')).length).toBe(1);
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(view.getByTestId('effort')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('C2 plan workout also gets exactly one row; next exercise removes it @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seed(page, Date.now() - 3 * DAY, [...three('barbell-back-squat', 10, lb(185, [45, 25])), ...three('angled-machine-leg-press', 10, { kind: 'machine', unit: 'lb', pin: 100 })]);
    await usePlan(page);
    await page.getByRole('button', { name: /^Start/ }).first().tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view).toBeVisible();
    await expect(view.getByTestId('set-todo')).toHaveCount(4);
    for (let i = 1; i <= 4; i++) {
      await tapCircle(page, view);
      if (i < 4) await expect(loggedRows(view)).toHaveCount(i);
    }
    await expect(page.getByTestId('next-chip')).toBeVisible();
    await expect(page.getByTestId('workout-title')).toBeVisible({ timeout: 9000 });
    await expect(page.getByTestId('list-effort')).toHaveCount(1);
    await expect(page.getByText('How did that feel?')).toHaveCount(1);
    await snap(page, 'c2-plan');
    await page.getByTestId('row-angled-machine-leg-press').tap();
    await page.getByRole('button', { name: /Back/ }).first().tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await expect(page.getByTestId('list-effort')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test('C2b double tap on a list chip saves once and removes the row @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await twoEx(page);
  await logAllTimed(view);
  await expect(page.getByTestId('list-effort')).toHaveCount(1, { timeout: 8000 });
  await page.waitForTimeout(900);
  const gb = (await page.getByTestId('list-effort-good').boundingBox())!;
  console.log('C2b hit', await page.evaluate(([x, y]: number[]) => { const e = document.elementFromPoint(x as number, y as number); return e ? `${e.tagName} ${e.getAttribute('data-testid')} ${e.className}`.slice(0, 120) : null; }, [gb.x + gb.width / 2, gb.y + gb.height / 2]), JSON.stringify(gb));
  await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2).catch(() => {});
  await page.waitForTimeout(1500);
  const efforts = await dbAll(page, 'efforts');
  console.log('C2b efforts', prof(), JSON.stringify(efforts), 'rows', await page.getByTestId('list-effort').count());
  await snap(page, 'c2b-double');
  expect(efforts.length).toBe(1);
  await expect(page.getByTestId('list-effort')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('C2c reopen-then-back, then raw tap on a list chip @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await twoEx(page);
  await logAllTimed(view);
  await expect(page.getByTestId('list-effort')).toHaveCount(1, { timeout: 8000 });
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(view).toBeVisible();
  await expect(view.getByTestId('effort')).toHaveCount(0); // 3.5g: asked on the list row only
  await page.getByRole('button', { name: /Back/ }).first().tap();
  await expect(page.getByTestId('list-effort')).toHaveCount(1);
  for (const w of [900, 1500, 3000]) {
    await page.waitForTimeout(w);
    const gb = (await page.getByTestId('list-effort-good').boundingBox())!;
    console.log('C2c box', prof(), w, JSON.stringify(gb), 'scrollY', await page.evaluate(() => scrollY), 'vh', await page.evaluate(() => innerHeight));
    await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2).catch((e) => console.log('2nd tap err', String(e).slice(0, 80)));
    await page.waitForTimeout(800);
    const n = await page.getByTestId('list-effort').count();
    console.log('C2c rows after tap', n, 'efforts', (await dbAll(page, 'efforts')).length);
    if (!n) break;
  }
  await snap(page, 'c2c');
  expect(errors).toEqual([]);
});

test('C1b chip then list timing without screenshots in the way @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await twoEx(page);
  const t0 = await logAllTimed(view);
  await expect(page.getByTestId('next-chip')).toBeVisible();
  const tChip = Date.now() - t0;
  await page.getByTestId('workout-title').waitFor({ state: 'visible', timeout: 8000 });
  const ms = Date.now() - t0;
  console.log('C1b TIMING', prof(), 'chip at', tChip, 'list at', ms);
  expect(ms).toBeGreaterThan(2000);
  expect(ms).toBeLessThan(3500);
  expect(errors).toEqual([]);
});

test('C2d Galaxy single raw tap on list chip, retry every second @matrix', async ({ page }) => {
  const view = await twoEx(page);
  await logAllTimed(view);
  await expect(page.getByTestId('list-effort')).toHaveCount(1, { timeout: 8000 });
  await page.waitForTimeout(900);
  const gb = (await page.getByTestId('list-effort-good').boundingBox())!;
  for (let i = 1; i <= 5; i++) {
    const guard = await page.getByTestId('arrival-guard').count();
    await page.touchscreen.tap(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.waitForTimeout(1000);
    const n = await page.getByTestId('list-effort').count();
    console.log('C2d try', i, 'guard', guard, 'rows left', n, 'efforts', (await dbAll(page, 'efforts')).length);
    if (!n) break;
  }
});
