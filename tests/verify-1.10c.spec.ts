import { expect, test, type Locator, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';

// Tester spec for PLAN 1.10c. Independent of tests/fixes-1.10c.spec.ts.
const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};
async function dbAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate((name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const c = req.result; const tx = c.transaction(name, 'readonly'); const r = tx.objectStore(name).getAll();
      tx.oncomplete = () => { c.close(); resolve(r.result as T[]); };
      tx.onabort = () => { c.close(); reject(tx.error); };
    };
  }), store);
}
const sets = async (p: Page) => (await dbAll<WorkoutSet>(p, 'sets')).sort((a, b) => a.order - b.order);
const logBtn = (p: Page) => p.getByTestId('action-bar').getByRole('button').first();
async function quick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}
async function add(page: Page, q: string, name: string) {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(q);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}
async function pad(scope: Locator, v: string) { for (const d of v) await scope.getByRole('button', { name: d, exact: true }).tap(); }
const shot = async (p: Page, n: string) => { await p.waitForTimeout(700); await p.screenshot({ path: `reports/shots/1.10c/${n}.png` }); };
const only15 = () => test.skip(test.info().project.name !== 'iPhone 15 Pro', 'one profile');

test.describe('1.10c verify', () => {
  test.beforeEach(() => only15());

  test('a timed hold: stop at ~2 s, Start again, 1.5 s, Log while running saves about 3.5 s', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'plank', 'Plank');
    const card = page.getByTestId('exercise-plank');
    await card.getByRole('button', { name: 'Start timer' }).tap();
    await page.waitForTimeout(2000);
    await card.getByRole('button', { name: 'Stop timer' }).tap();
    await page.waitForTimeout(500);
    await card.getByRole('button', { name: 'Start again timer' }).tap();
    await page.waitForTimeout(1500);
    await logBtn(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    const [s] = await sets(page);
    console.log('timed seconds', s!.seconds);
    expect(s!.seconds).toBeGreaterThanOrEqual(3);
    expect(s!.seconds).toBeLessThanOrEqual(5);
    expect(errors).toEqual([]);
  });

  test('b/c draft survives collapse and reload, cleared on log; delete hits Dexie at once, Undo restores id and order', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const sq = page.getByTestId('exercise-barbell-back-squat');
    await sq.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
    await sq.getByRole('button', { name: 'More reps' }).tap();
    await sq.getByRole('button', { name: 'More reps' }).tap();
    const label = await logBtn(page).textContent();
    console.log('draft label', label);
    await add(page, 'plank', 'Plank');
    await sq.getByRole('button', { expanded: false }).tap();
    expect(await logBtn(page).textContent()).toBe(label);
    await page.reload();
    expect(await logBtn(page).textContent()).toBe(label);
    await logBtn(page).tap();
    await expect(sq.getByTestId('set-row')).toHaveCount(1);
    await page.waitForTimeout(400);
    await logBtn(page).tap();
    await expect(sq.getByTestId('set-row')).toHaveCount(2);
    await page.waitForTimeout(400);
    await logBtn(page).tap();
    await expect(sq.getByTestId('set-row')).toHaveCount(3);
    const before = await sets(page);
    expect(before.length).toBe(3);
    await sq.getByTestId('set-row').nth(1).tap();
    await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
    // immediately (no waiting for the undo toast to expire)
    await expect.poll(async () => (await sets(page)).length, { timeout: 1500 }).toBe(2);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect.poll(() => sets(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('d stack: pin 15 at step 5, change step to 10 clears pin and disables Log', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'leg press', 'Leg Press');
    await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Machine with a pin/ }).tap();
    const card = page.getByTestId('exercise-leg-press');
    await card.getByRole('radio', { name: 'Pin at 15 lb', exact: true }).tap();
    await card.getByRole('button', { name: /Steps of 5/ }).tap();
    await page.getByRole('dialog', { name: 'Weight steps' }).getByRole('button', { name: 'Goes up by 10 lb', exact: true }).tap();
    await expect(card.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(logBtn(page)).toBeDisabled();
    await page.reload();
    await expect(card.getByRole('radio', { checked: true })).toHaveCount(0);
    await expect(logBtn(page)).toBeDisabled();
    expect(await sets(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('e Smith unknown bar: "+ bar", Set bar weight, diagram total = Log label = saved total', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'smith machine upright row', 'Smith Machine Upright Row');
    const card = page.getByTestId('exercise-smith-machine-upright-row');
    const ask = page.getByRole('dialog', { name: 'How do you load this?' });
    if (await ask.count()) await ask.getByRole('button', { name: /Plates on a bar/ }).tap();
    await card.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
    await expect(card.getByTestId('plate-total')).toContainText('+ bar');
    await expect(card.getByRole('button', { name: 'Set bar weight' })).toBeVisible();
    await expect(logBtn(page)).toBeDisabled();
    await shot(page, 'smith-unknown');
    await card.getByRole('button', { name: 'Set bar weight' }).tap();
    const prompt = page.getByRole('dialog', { name: 'Smith machine bar' });
    await pad(prompt, '15');
    await prompt.getByRole('button', { name: 'Save bar weight' }).tap();
    await expect(prompt).toHaveCount(0);
    const tot = (await card.getByTestId('plate-total').textContent())!;
    const lab = (await logBtn(page).textContent())!;
    console.log('smith', tot, lab);
    expect(tot).toBe('35lb');
    expect(lab).toContain('35 lb');
    await logBtn(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    expect((await sets(page))[0]!.load).toMatchObject({ total: 35 });
    expect(errors).toEqual([]);
  });

  test('f sheet a11y: focus inside, Tab cycles, root inert, Close named, Escape top only', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
    const d = page.getByRole('dialog', { name: 'Add exercise' });
    await expect(d).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
    expect(await page.locator('#root').getAttribute('inert')).not.toBeNull();
    const close = d.getByRole('button', { name: 'Close', exact: true });
    const box = (await close.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < 30; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(d).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('g finish -> History row -> detail; fresh install empty state', async ({ page }) => {
    const errors = watch(page);
    await page.goto('./#/history');
    await expect(page.getByRole('heading', { name: 'No workouts yet' })).toBeVisible();
    await shot(page, 'history-empty');
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const sq = page.getByTestId('exercise-barbell-back-squat');
    await sq.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
    await logBtn(page).tap();
    await expect(sq.getByTestId('set-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByRole('status').filter({ hasText: /Workout saved/ })).toBeVisible();
    await page.getByRole('link', { name: 'History' }).tap();
    const row = page.getByTestId('history-row');
    await expect(row).toHaveCount(1);
    const rb = (await row.boundingBox())!;
    expect(rb.height).toBeGreaterThanOrEqual(48);
    await expect(row).toContainText('Quick workout');
    await expect(row).toContainText('1 set');
    await shot(page, 'history-list');
    await row.tap();
    await expect(page.getByTestId('history-set')).toHaveCount(1);
    await expect(page.getByTestId('history-set')).toContainText('95 lb');
    await shot(page, 'history-detail');
    await page.reload();
    await expect(page.getByTestId('history-set')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('h landscape guard and back, state intact', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const sq = page.getByTestId('exercise-barbell-back-squat');
    await sq.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
    const label = await logBtn(page).textContent();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByText('Turn your phone upright')).toBeVisible();
    await shot(page, 'landscape');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Turn your phone upright')).toBeHidden();
    expect(await logBtn(page).textContent()).toBe(label);
    expect(errors).toEqual([]);
  });

  test('i Six Week day 3 Plank shows reps not a timer', async ({ page }) => {
    const errors = watch(page);
    await page.goto('./#/plans/six-week-volume');
    await page.getByRole('button', { name: /Use this plan|Go to Today/ }).tap();
    await page.getByRole('button', { name: 'Change day' }).tap();
    await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 3 ·/ }).tap();
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page).toHaveURL(/#\/workout\//);
    const plank = page.locator('[data-testid^="exercise-"]').filter({ hasText: /Plank/ });
    const n = await plank.count();
    console.log('plank cards', n);
    expect(n).toBeGreaterThan(0);
    for (let k = 0; k < n; k++) {
      const c = plank.nth(k);
      if ((await c.getAttribute('data-expanded')) !== 'true') await c.getByRole('button').first().tap();
      await expect(c.getByRole('button', { name: /Start timer/ })).toHaveCount(0);
      await expect(c.getByTestId('timer-clock')).toHaveCount(0);
      await expect(c.getByTestId('stepper-reps')).toBeVisible();
    }
    await shot(page, 'plank-reps');
    expect(errors).toEqual([]);
  });

  test('j SE: bodyweight Add weight opens a sheet, card fits after adding 25', async ({ page }) => {
    const errors = watch(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await quick(page);
    await add(page, 'wide grip pull', 'Wide Grip Pull Up');
    const c = page.getByTestId('exercise-wide-grip-pull-up');
    await c.getByRole('button', { name: 'Add weight', exact: true }).tap();
    const sh = page.getByRole('dialog', { name: 'Add weight', exact: true });
    await expect(sh).toBeVisible();
    await pad(sh, '25');
    const done = sh.getByRole('button', { name: 'Done', exact: true });
    expect((await done.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await done.tap();
    await expect(c.getByTestId('bodyweight-added')).toHaveText('+ 25 lb added');
    const m = await page.getByRole('main').evaluate((e) => ({ s: e.scrollHeight, c: e.clientHeight }));
    console.log('SE main', m);
    expect(m.s).toBeLessThanOrEqual(m.c);
    await shot(page, 'se-added');
    expect(errors).toEqual([]);
  });

  test('reload mid workout offline and double tap Log', async ({ page, context }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    await context.setOffline(true);
    await logBtn(page).dblclick();
    await page.waitForTimeout(600);
    expect((await sets(page)).length).toBe(1);
    await page.reload().catch(() => {});
    await context.setOffline(false);
    expect((await sets(page)).length).toBe(1);
    const open = (await dbAll<Session>(page, 'sessions')).filter((s) => s.endedAt === undefined);
    expect(open.length).toBe(1);
    expect(errors.filter((e) => !/Failed to load resource|offline/i.test(e))).toEqual([]);
  });
});
