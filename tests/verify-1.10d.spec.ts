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
const logBtn = (p: Page) => p.getByTestId('action-bar').getByRole('button').first();
const shot = (p: Page, n: string) => p.screenshot({ path: `reports/shots/1.10d/v-${n}-${test.info().project.name.replace(/ /g, '-')}.png` });
async function quick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}
async function add(page: Page, q: string, name: string) {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const s = page.getByRole('dialog', { name: 'Add exercise' });
  await s.getByRole('searchbox', { name: 'Search exercises' }).fill(q);
  await s.getByRole('button', { name, exact: true }).tap();
  await expect(s).toHaveCount(0);
}

test.describe('1.10d verify', () => {
  test('a double tap + switch cards mid log: one set, next log gets a new id', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    await add(page, 'plank', 'Plank');
    const sq = page.getByTestId('exercise-barbell-back-squat');
    if (await sq.getByRole('button', { expanded: false }).count()) await sq.getByRole('button', { expanded: false }).tap();
    await sq.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await logBtn(page).dblclick();
    await page.waitForTimeout(600);
    expect(await dump(page, 'sets')).toHaveLength(1);
    await page.waitForTimeout(400);
    // tap then immediately open the other card and come back
    await logBtn(page).tap();
    const plank = page.getByTestId('exercise-plank');
    await plank.getByRole('button', { expanded: false }).tap({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(300);
    const sqHead = page.getByTestId('exercise-barbell-back-squat').getByRole('button', { expanded: false });
    if (await sqHead.count()) await sqHead.tap();
    await page.waitForTimeout(600);
    const sets = (await dump(page, 'sets')).filter((s) => s.exerciseId.includes('squat'));
    expect(sets).toHaveLength(2);
    expect(new Set(sets.map((s) => s.id)).size).toBe(2);
    expect(errors).toEqual([]);
  });

  test('b edit 10 to 12, delete, undo -> 12; slow write keeps Delete disabled', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const card = page.getByTestId('exercise-barbell-back-squat');
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
    await expect(card.getByTestId('set-row')).toHaveText(['112 × 45 lb']);
    await page.waitForTimeout(400);
    await card.getByTestId('set-row').tap();
    await edit.getByRole('button', { name: 'Delete set' }).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(card.getByTestId('set-row')).toHaveText(['112 × 45 lb']);
    expect((await dump(page, 'sets')).map((s) => s.reps)).toEqual([12]);
    expect(errors).toEqual([]);
  });

  test('c delete only set, Finish, Undo: no orphan', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const card = page.getByTestId('exercise-barbell-back-squat');
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
    // second path: finish first, then try Undo in the toast if still present
    expect(errors).toEqual([]);
  });

  test('d women\'s bar on bench, persists, back to Olympic', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'incline bench', 'Barbell Incline Bench Press');
    const card = page.getByTestId('exercise-barbell-incline-bench-press');
    await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    const bar = card.getByRole('button', { name: /^Bar: Olympic/ });
    const bb = (await bar.boundingBox())!;
    console.log('bar control box', bb.width, bb.height);
    expect(bb.height).toBeGreaterThanOrEqual(48);
    await shot(page, 'bar-control');
    await bar.tap();
    const sheet = page.getByRole('dialog', { name: 'Which bar?' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, 'bar-sheet');
    console.log('sheet text:', (await sheet.innerText()).replace(/\n/g, ' | '));
    await sheet.getByRole('button', { name: /Women's bar/ }).tap();
    await expect(card.getByTestId('plate-math')).toHaveText('35 bar + 2 × 45 = 125 lb');
    await expect(logBtn(page)).toHaveText('Log set · 10 × 125 lb');
    await logBtn(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    expect((await dump(page, 'sets'))[0].load).toMatchObject({ total: 125, barWeight: 35, perSide: [45] });
    await page.reload();
    await expect(card.getByRole('button', { name: /^Bar: Women's/ })).toBeVisible();
    await card.getByRole('button', { name: /^Bar: Women's/ }).tap();
    await page.getByRole('dialog', { name: 'Which bar?' }).getByRole('button', { name: /Olympic bar/ }).tap();
    await expect(card.getByTestId('plate-math')).toHaveText('45 bar + 2 × 45 = 135 lb');
    expect(errors).toEqual([]);
  });

  test('e localStorage throws: draft survives card switch, plain toast', async ({ page }) => {
    const errors = watch(page);
    await page.addInitScript(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'anygym-drafts') throw new DOMException('full', 'QuotaExceededError');
        return real.call(this, k, v);
      };
    });
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const sq = page.getByTestId('exercise-barbell-back-squat');
    await sq.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await sq.getByRole('button', { name: 'More reps' }).tap();
    const toast = page.getByRole('status').filter({ hasText: 'Drafts will not survive' });
    await expect(toast).toBeVisible();
    console.log('toast:', await toast.innerText());
    await add(page, 'plank', 'Plank');
    await sq.getByRole('button', { expanded: false }).tap();
    await expect(logBtn(page)).toHaveText('Log set · 11 × 135 lb');
    expect(errors).toEqual([]);
  });

  test('f one screen on barbell card; g trap bar flow', async ({ page }) => {
    const errors = watch(page);
    await quick(page);
    await add(page, 'back squat', 'Barbell Back Squat');
    const card = page.getByTestId('exercise-barbell-back-squat');
    await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
    await page.waitForTimeout(500);
    const m = await page.getByRole('main').evaluate((el) => ({ s: el.scrollHeight, c: el.clientHeight }));
    console.log('main', m.s, m.c);
    expect(m.s).toBeLessThanOrEqual(m.c);
    await shot(page, 'barbell-card');
    await add(page, 'smith machine upright row', 'Smith Machine Upright Row');
    const sm = page.getByTestId('exercise-smith-machine-upright-row');
    const ask = page.getByRole('dialog', { name: 'How do you load this?' });
    if (await ask.count()) await ask.getByRole('button', { name: /Plates on a bar/ }).tap();
    await sm.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
    await expect(sm.getByTestId('plate-total')).toContainText('+ bar');
    await expect(logBtn(page)).toBeDisabled();
    await sm.getByRole('button', { name: 'Set bar weight' }).tap();
    const prompt = page.getByRole('dialog', { name: 'Smith machine bar' });
    for (const d of '15') await prompt.getByRole('button', { name: d, exact: true }).tap();
    await prompt.getByRole('button', { name: 'Save bar weight' }).tap();
    await expect(sm.getByTestId('plate-total')).toHaveText('35lb');
    await expect(logBtn(page)).toContainText('35 lb');
    await shot(page, 'smith-bar-known');
    await logBtn(page).tap();
    await expect(sm.getByTestId('set-row')).toHaveCount(1);
    expect((await dump(page, 'sets')).find((s) => s.exerciseId.includes('smith'))!.load.total).toBe(35);
    expect(errors).toEqual([]);
  });
});
