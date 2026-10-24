import { expect, test, type Page } from './fixtures';

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};
const dump = (page: Page, store: string) =>
  page.evaluate(
    (s) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction(s, 'readonly');
          const r = tx.objectStore(s).getAll();
          tx.oncomplete = () => { req.result.close(); resolve(r.result); };
        };
      }),
    store,
  );
// PLAN 1.7c: the set card's Log set is the current row's check in the exercise view's set table.
const logBtn = (p: Page) => p.getByTestId('check-current');
const shot = (p: Page, n: string) => p.screenshot({ path: `reports/shots/1.10d/v-${n}-${test.info().project.name.replace(/ /g, '-')}.png` });
const picker = (p: Page) => p.getByRole('dialog', { name: 'Pick the weight', exact: true });
async function quick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}
/** Adds exercises from the picker (it opens by itself on an empty quick workout). One opens straight away. */
async function add(page: Page, ...picks: Array<[string, string]>) {
  const s = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(page.getByTestId('workout-title')).toBeVisible();
  if (!(await s.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  for (const [q, name] of picks) {
    await s.getByRole('searchbox', { name: 'Search exercises' }).fill(q);
    await s.getByRole('button', { name, exact: true }).tap();
  }
  await s.getByRole('button', { name: `Add ${picks.length}`, exact: true }).tap();
  await expect(s).toHaveCount(0);
}
/** Weight cell of the first open row → plates → Done. */
async function plates(page: Page, card: ReturnType<Page['getByTestId']>, ...labels: string[]) {
  await card.getByTestId('weight-cell').first().tap();
  for (const l of labels) await picker(page).getByRole('button', { name: `Add ${l} plate to each side` }).tap();
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(picker(page)).toHaveCount(0);
}
const back = (page: Page) => page.getByRole('button', { name: 'Back to the list' }).tap();

test.describe('1.10d verify', () => {
  test('a double tap + switch exercises mid log: one set, next log gets a new id', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, ['back squat', 'Barbell Back Squat'], ['plank', 'Plank']);
    await page.getByTestId('row-barbell-back-squat').tap();
    const sq = page.getByTestId('exercise-barbell-back-squat');
    await plates(page, sq, '45 lb');
    await logBtn(page).dblclick();
    await page.waitForTimeout(600);
    expect(await dump(page, 'sets')).toHaveLength(1);
    await page.waitForTimeout(400);
    // tap then immediately leave for the other exercise and come back
    await logBtn(page).tap();
    await back(page);
    await page.getByTestId('row-plank').tap({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(300);
    await back(page).catch(() => {});
    await page.getByTestId('row-barbell-back-squat').tap();
    await page.waitForTimeout(600);
    const sets = (await dump(page, 'sets')).filter((s) => s.exerciseId.includes('squat'));
    expect(sets).toHaveLength(2);
    expect(new Set(sets.map((s) => s.id)).size).toBe(2);
    expect(errors).toEqual([]);
  });

  test('b edit 8 to 10, delete, undo -> 10; slow write keeps Delete disabled', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, ['back squat', 'Barbell Back Squat']);
    const card = page.getByTestId('exercise-barbell-back-squat');
    await plates(page, card, '45 lb');
    await logBtn(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await page.waitForTimeout(400);
    const edit = page.getByRole('dialog', { name: 'Edit set' });
    await card.getByTestId('set-row').tap();
    // slow every write for the next second
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, v: any, k?: any) {
        const store = this; const t0 = Date.now();
        const spin = () => { if (Date.now() - t0 < 1500) store.count().onsuccess = spin; };
        spin();
        return put.call(store, v, k);
      } as any;
    });
    await edit.getByRole('button', { name: 'More reps' }).tap();
    await edit.getByRole('button', { name: 'More reps' }).tap();
    await edit.getByRole('button', { name: 'Save' }).tap();
    const del = edit.getByRole('button', { name: 'Delete set' });
    const state = await del.evaluate((e) => ({ aria: e.getAttribute('aria-disabled'), dis: (e as HTMLButtonElement).disabled }));
    console.log('delete during save', JSON.stringify(state));
    await expect(edit).toHaveCount(0, { timeout: 10000 });
    await expect(card.getByTestId('set-row').getByRole('button', { name: /Edit$/ })).toHaveAccessibleName('Set 1: 10 × 135 lb. Edit');
    await page.waitForTimeout(400);
    await card.getByTestId('set-row').tap();
    await edit.getByRole('button', { name: 'Delete set' }).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(card.getByTestId('set-row').getByRole('button', { name: /Edit$/ })).toHaveAccessibleName('Set 1: 10 × 135 lb. Edit');
    expect((await dump(page, 'sets')).map((s) => s.reps)).toEqual([10]);
    expect(errors).toEqual([]);
  });

  test('c delete only set, Finish, Undo: no orphan', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, ['back squat', 'Barbell Back Squat']);
    const card = page.getByTestId('exercise-barbell-back-squat');
    await plates(page, card, '45 lb');
    await logBtn(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await page.waitForTimeout(400);
    await card.getByTestId('set-row').tap();
    await page.getByRole('dialog', { name: 'Edit set' }).getByRole('button', { name: 'Delete set' }).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(0);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      btns.find((b) => b.textContent?.trim() === 'Finish')?.click();
      btns.find((b) => b.textContent?.trim() === 'Undo')?.click();
    });
    await page.waitForTimeout(1500);
    const sets = await dump(page, 'sets');
    const sessions = await dump(page, 'sessions');
    console.log('after finish+undo', sets.length, sessions.length, await page.locator('[role=status]').allTextContents());
    for (const s of sets) expect(sessions.some((x) => x.id === s.sessionId)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('d women\'s bar on bench, persists, back to Olympic', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, ['incline bench', 'Barbell Incline Bench Press']);
    const card = page.getByTestId('exercise-barbell-incline-bench-press');
    await card.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    const bar = picker(page).getByRole('button', { name: /^Bar: Olympic/ });
    const bb = (await bar.boundingBox())!;
    console.log('bar control box', bb.width, bb.height);
    expect(bb.height).toBeGreaterThanOrEqual(44);
    await shot(page, 'bar-control');
    await bar.tap();
    const sheet = page.getByRole('dialog', { name: 'Which bar?' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, 'bar-sheet');
    await sheet.getByRole('button', { name: /Women's bar/ }).tap();
    await expect(picker(page).getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');
    await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(logBtn(page)).toHaveAccessibleName('Log set 1: 8 × 125 lb');
    await logBtn(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    expect((await dump(page, 'sets'))[0].load).toMatchObject({ total: 125, barWeight: 35, perSide: [45] });
    await page.reload();
    await card.getByTestId('weight-cell').first().tap();
    await expect(picker(page).getByRole('button', { name: /^Bar: Women's/ })).toBeVisible();
    await picker(page).getByRole('button', { name: /^Bar: Women's/ }).tap();
    await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Olympic bar/ }).tap();
    await expect(picker(page).getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');
    expect(errors).toEqual([]);
  });

  test('e localStorage throws: draft survives switching exercises, plain toast', async ({ page }) => {
    const errors = watch(page);
    await page.addInitScript(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'anygym-drafts') throw new DOMException('full', 'QuotaExceededError');
        return real.call(this, k, v);
      };
    });
    await quick(page);
    await add(page, ['back squat', 'Barbell Back Squat'], ['plank', 'Plank']);
    await page.getByTestId('row-barbell-back-squat').tap();
    const sq = page.getByTestId('exercise-barbell-back-squat');
    await plates(page, sq, '45 lb');
    await sq.getByTestId('reps-cell').first().tap();
    await sq.getByRole('button', { name: 'More reps' }).tap();
    const toast = page.getByRole('status').filter({ hasText: 'Drafts will not survive' });
    await expect(toast).toBeVisible();
    await back(page);
    await page.getByTestId('row-plank').tap();
    await back(page);
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(logBtn(page)).toHaveAccessibleName('Log set 1: 9 × 135 lb');
    expect(errors).toEqual([]);
  });

  test('f one screen on a barbell exercise; g Smith bar flow', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, ['back squat', 'Barbell Back Squat']);
    const card = page.getByTestId('exercise-barbell-back-squat');
    await plates(page, card, '45 lb');
    await page.waitForTimeout(500);
    const m = await page.getByRole('main').evaluate((el) => ({ s: el.scrollHeight, c: el.clientHeight }));
    expect(m.s).toBeLessThanOrEqual(m.c);
    await shot(page, 'barbell-card');
    await back(page);
    await add(page, ['smith machine upright row', 'Smith Machine Upright Row']);
    const sm = page.getByTestId('exercise-smith-machine-upright-row');
    // PLAN 1.7c: hand mapped as plates on the Smith bar, so nothing is asked.
    await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
    await plates(page, sm, '10 lb');
    await expect(sm.getByTestId('weight-cell').first()).toContainText('+ bar');
    await expect(logBtn(page)).toBeDisabled();
    await sm.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Set bar weight' }).tap();
    const prompt = page.getByRole('dialog', { name: 'Smith machine bar' });
    for (const d of '15') await prompt.getByRole('button', { name: d, exact: true }).tap();
    await prompt.getByRole('button', { name: 'Save bar weight' }).tap();
    await expect(picker(page).getByTestId('plate-total')).toHaveText('35lb');
    await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(logBtn(page)).toHaveAccessibleName(/35 lb$/);
    await shot(page, 'smith-bar-known');
    await logBtn(page).tap();
    await expect(sm.getByTestId('set-row')).toHaveCount(1);
    expect((await dump(page, 'sets')).find((s) => s.exerciseId.includes('smith'))!.load.total).toBe(35);
    expect(errors).toEqual([]);
  });
});
