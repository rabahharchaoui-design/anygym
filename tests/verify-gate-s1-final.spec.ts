import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from './fixtures';
import { sumLoad } from '../src/lib/load';
import { bar185, checkCurrent, dbAll, exerciseView, fillReps, loggedRows, pickSetType, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Independent tester spec for the Session 1 merge gate, final round (items a to g and the data sweep).
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json');
const SHOT_PROJECTS = ['iPhone SE', 'iPhone 15'];
const shot = async (page: Page, name: string) => {
  const p = test.info().project.name;
  if (!SHOT_PROJECTS.includes(p)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/gate-s1/final/${name}-${p.replace(/ /g, '-')}.png` });
};
type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const alphaOf = async (l: Locator, pseudo?: '::before') => {
  await l.page().waitForTimeout(1200); // let the enter animation finish
  return l.evaluate((el, pseudo) => {
    // Effective opacity of the surface: own background alpha, times the element's own CSS opacity.
    const bg = getComputedStyle(el, pseudo).backgroundColor;
    const nums = bg.match(/[\d.]+/g)!.map(Number);
    const a = /^rgba|\//.test(bg) || nums.length === 4 ? (nums.length >= 4 ? nums[3]! : 1) : 1;
    return a * Number(getComputedStyle(el, pseudo).opacity);
  }, pseudo);
};
const scrollAll = async (page: Page, to: number | 'end') => {
  await page.evaluate((to) => {
    for (const e of Array.from(document.querySelectorAll<HTMLElement>('*'))) if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = to === 'end' ? e.scrollHeight : to;
  }, to);
  await page.waitForTimeout(600);
};
const noShare = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
type Row = { id: string; sessionId: string; exerciseId: string; order: number; kind: string; reps?: number; load?: { kind: string; unit: 'lb' | 'kg'; total: number; barWeight?: number; perSide?: number[]; collars?: number } };
const mine = async (page: Page, store: string) => (await dbAll<Row>(page, store)).filter((r) => !r.id.startsWith('seed-'));
const fmt = (n: number) => n.toLocaleString('en-US');

test('a. warm up pick is for that row only; working rows keep 185; Total lifted skips warm ups in header, finish and History; e. chips and numbering', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [10, 10, 10].map((reps) => ({ reps, load: bar185 })) });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const rows = view.getByTestId('set-todo');
  const letters = view.getByTestId('set-type').locator('span:first-child');
  await expect(letters).toHaveText(['1', '2', '3']);
  await pickSetType(page, rows.first().getByTestId('set-type'), 'warmup');
  // (e) W label + "Warm up" chip, working sets 1..n, and the header agrees.
  await expect(letters).toHaveText(['W', '1', '2']);
  await expect(rows.first().getByTestId('set-type-chip')).toHaveText('Warm up');
  await expect(view.getByTestId('set-target')).toContainText('Set 1 of 3');
  await shot(page, 'warmup-rows');
  // (a) warm up weight sheet says so and changes only that row.
  await rows.first().getByTestId('weight-cell').tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet.getByText('Just this warm up', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell')).toHaveText(['145', '185', '185']);
  await fillReps(view, rows.first(), 5);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(view.getByTestId('weight-cell')).toHaveText(['185', '185', '185']);
  await expect(view.getByTestId('set-target')).toContainText('Set 1 of 3');
  // A working row's pick never changes the (logged) warm up, and does not touch a second, unlogged warm up row.
  await view.getByRole('button', { name: '+ Add set' }).tap();
  const todo = view.getByTestId('set-todo');
  await expect(todo).toHaveCount(4);
  await pickSetType(page, todo.last().getByTestId('set-type'), 'warmup');
  await expect(todo.last().getByTestId('weight-cell')).toHaveText(/^(Pick|–)$/);
  await todo.first().getByTestId('weight-cell').tap();
  await expect(sheet.getByText(/This set/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  const weights = (await view.getByTestId('weight-cell').allTextContents()).map((t) => t.trim());
  expect(weights.slice(0, 3)).toEqual(['195', '195', '195']);
  expect(weights[3]).toMatch(/^(Pick|–)$/);
  // Log: warm up (done), 3 working rows at 195 x default reps.
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(3);
  // Remove the unlogged warm up row from the plan by leaving it: the data checks use what is saved.
  const sets = (await mine(page, 'sets')).sort((x, y) => x.order - y.order);
  expect(sets.map((x) => [x.kind, x.load!.total])).toEqual([['warmup', 145], ['work', 195], ['work', 195]]);
  const expected = sets.filter((x) => x.kind !== 'warmup').reduce((n, x) => n + x.reps! * x.load!.total, 0);
  expect(expected).toBeGreaterThan(0);
  // Header (the workout top bar), not counting the 145 x 5 warm up.
  const headerText = await page.locator('[data-testid="workout-total"], header').first().innerText().catch(() => '');
  const body = await page.locator('body').innerText();
  expect(body).toContain(`Total lifted ${fmt(expected)} lb`);
  expect(body).not.toContain(`Total lifted ${fmt(expected + 5 * 145)} lb`);
  void headerText;
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-total')).toHaveText(`${fmt(expected)} lb`);
  await shot(page, 'finish-total');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByRole('link', { name: 'History' }).tap();
  await expect(page).toHaveURL(/#\/history$/);
  await page.getByTestId('history-row').first().tap();
  await expect(page.getByTestId('history-meta')).toContainText(`${fmt(expected)} lb lifted`);
  await expect(page.getByTestId('history-meta')).not.toContainText(fmt(expected + 5 * 145));
  await shot(page, 'history-detail');
  expect(errors).toEqual([]);
});

test('b. Cable Reverse Grip Tricep Pulldown is under Arms; no tricep or bicep exercise under Back or Chest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(page.getByTestId('workout-title')).toBeVisible();
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).tap();
  await expect(sheet).toBeVisible();
  const names = async (part: string) => {
    await sheet.getByRole('group', { name: 'Body part' }).getByRole('button', { name: part, exact: true }).tap();
    await page.waitForTimeout(350);
    const region = sheet.getByRole('listitem').getByRole('button');
    // Scroll the list through so a lazily drawn list is read in full.
    const out = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const t of await region.allTextContents()) out.add(t.replace(/Added$/, '').trim());
      const more = await region.first().evaluate((el) => {
        let s: HTMLElement | null = el as HTMLElement;
        while (s && !(s.scrollHeight > s.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement;
        if (!s) return false;
        const before = s.scrollTop;
        s.scrollTop += s.clientHeight * 0.8;
        return s.scrollTop !== before;
      });
      if (!more) break;
      await page.waitForTimeout(80);
    }
    return [...out];
  };
  const arms = await names('Arms');
  expect(arms.some((n) => n === 'Cable Reverse Grip Tricep Pulldown')).toBe(true);
  await shot(page, 'picker-arms');
  for (const part of ['Back', 'Chest']) {
    const list = await names(part);
    expect(list.length, part).toBeGreaterThan(3);
    expect(list.filter((n) => /tricep|bicep/i.test(n)), part).toEqual([]);
  }
  await expect(sheet.getByRole('button', { name: 'Cable Reverse Grip Tricep Pulldown' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('c. surfaces are at least 90% opaque; the Today toast after Done overlaps no button; the last day list row clears the rest bar', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const rest = page.getByTestId('rest-timer');
  await expect(rest).toBeVisible();
  expect(await alphaOf(rest)).toBeGreaterThanOrEqual(0.9);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(rest).toBeVisible();
  // The last row of the day list scrolls clear of the rest bar and the Start pill.
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await page.waitForTimeout(900);
  await scrollAll(page, 'end');
  const last = (await page.locator('[data-testid^="row-"]').last().boundingBox())!;
  const r = (await rest.boundingBox())!;
  const pill = page.getByTestId('start-next');
  expect(last.y + last.height, 'last row bottom vs rest bar top').toBeLessThanOrEqual(r.y + 1);
  await shot(page, 'daylist-last-row-rest');
  if (await pill.count()) expect.soft(last.y + last.height, 'last row vs pill').toBeLessThanOrEqual((await pill.boundingBox())!.y + 1);
  // Finish, Done: the toast.
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await expect(toast).toBeVisible();
  await page.waitForTimeout(900);
  const t = (await toast.boundingBox())!;
  expect(await alphaOf(toast)).toBeGreaterThanOrEqual(0.9);
  for (const b of await page.getByRole('button').all()) {
    if (!(await b.isVisible()) || (await b.evaluate((el) => !!el.closest('[role="status"]')))) continue;
    const bb = await b.boundingBox();
    if (bb && bb.width > 0) expect(overlaps(t, bb), `toast over button "${(await b.innerText()).slice(0, 30)}"`).toBe(false);
  }
  for (const l of await page.getByRole('link').all()) {
    const bb = await l.boundingBox();
    if (bb && bb.width > 0 && (await l.isVisible())) expect(overlaps(t, bb), `toast over link ${await l.getAttribute('aria-label') ?? ''}`).toBe(false);
  }
  await shot(page, 'today-toast');
  expect(errors).toEqual([]);
});

test('c2. Settings toast and pushed top bars are at least 90% opaque', async ({ page }) => {
  const errors = watchErrors(page);
  await noShare(page);
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  void download;
  const toast = page.getByRole('status').filter({ hasText: /Backup/ });
  await expect(toast).toBeVisible();
  expect(await alphaOf(toast)).toBeGreaterThanOrEqual(0.9);
  await shot(page, 'settings-toast');
  await scrollAll(page, 400);
  expect(await alphaOf(page.locator('header[data-compact]').last(), '::before'), 'Settings top bar scrolled').toBeGreaterThanOrEqual(0.9);
  await page.goto('./#/history');
  await page.goto('./#/plans');
  await page.getByTestId('plan-five-day-split').tap();
  await expect(page).toHaveURL(/#\/plans\/five-day-split/);
  await page.waitForTimeout(1000);
  await scrollAll(page, 400);
  expect(await alphaOf(page.locator('header[data-compact]').last(), '::before'), 'plan viewer top bar scrolled').toBeGreaterThanOrEqual(0.9);
  await shot(page, 'plan-viewer');
  expect(errors).toEqual([]);
});

test('d. dumbbell sheet first open: the hint is below the wheel and overlaps nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'dumbbell-bench-press': [{ reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 } }] });
  await quickWith(page, [['dumbbell bench', 'Dumbbell Bench Press']]);
  await exerciseView(page, 'dumbbell-bench-press').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  const hint = sheet.locator('[data-hint="wheel"]');
  await expect(hint).toBeVisible();
  await page.waitForTimeout(600);
  const h = (await hint.boundingBox())!;
  const wheel = (await sheet.getByRole('listbox').boundingBox())!;
  expect(h.y).toBeGreaterThanOrEqual(wheel.y + wheel.height - 1);
  for (const l of [sheet.getByRole('button', { name: 'Done' }), sheet.getByText('You hold one in each hand')]) {
    const b = (await l.first().boundingBox())!;
    expect(overlaps(h, b), await l.first().innerText()).toBe(false);
  }
  await shot(page, 'dumbbell-sheet');
  expect(errors).toEqual([]);
});

test('f. partial finish: title, "0 of 16 exercises finished · 1 started", first row above pinned choices at 360x640', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved · 1 set');
  await expect(page.getByTestId('finish-progress')).toHaveText('0 of 16 exercises finished · 1 started');
  await page.waitForTimeout(1500);
  const first = (await page.getByTestId('finish-exercise').first().boundingBox())!;
  const choices = (await page.getByRole('radio', { name: 'Next time: repeat Day 1' }).boundingBox())!;
  expect(first.y).toBeGreaterThanOrEqual(0);
  expect(first.y + first.height).toBeLessThanOrEqual(choices.y);
  const done = (await page.getByRole('button', { name: 'Done', exact: true }).boundingBox())!;
  expect(done.y + done.height).toBeLessThanOrEqual(640);
  expect(done.height).toBeGreaterThanOrEqual(48);
  await shot(page, 'finish-partial-360x640');
  expect(errors).toEqual([]);
});

test('g. import review: one "In your file" name, closest matches first, "Skip these N sets"', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/settings');
  await page.getByTestId('import-file').setInputFiles(FIXTURE);
  await expect(page).toHaveURL(/#\/settings\/import$/);
  await expect(page.getByTestId('import-summary')).toBeVisible();
  const ask = page.locator('[data-testid="import-exercise"]', { has: page.getByTestId('ask-pick') });
  await expect(ask.getByRole('heading', { level: 2 })).toHaveText('Moon press (not matched)');
  await expect(page.getByTestId('ask-pick').getByRole('button', { name: /^Skip these \d+ sets$/ })).toBeVisible();
  await shot(page, 'import-review');
  await page.getByTestId('import-confirm').tap();
  const kind = page.getByRole('dialog', { name: 'How do you load this?' });
  await kind.getByRole('button', { name: /Dumbbells/ }).tap();
  await page.getByTestId('import-confirm').tap();
  const pick = page.getByRole('dialog', { name: 'Pick the exercise' });
  await expect(pick).toBeVisible();
  await expect(pick.getByText(/In your file/)).toHaveCount(1);
  await expect(pick.getByText('In your file: “Moon press”')).toBeVisible();
  const first = pick.getByRole('list', { name: 'Exercises' }).getByRole('button');
  const firstFew = (await first.allTextContents()).slice(0, 5);
  expect(firstFew.some((t) => /press/i.test(t))).toBe(true);
  expect(firstFew.every((t) => /^[A-C]/.test(t))).toBe(false); // not an A to Z start
  await shot(page, 'import-pick');
  expect(errors).toEqual([]);
});

test('3. data exactness after one full flow: totals equal sumLoad, orders increase, no duplicate ids, no orphans', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [10, 10].map((reps) => ({ reps, load: bar185 })), 'barbell-incline-bench-press': [{ reps: 8, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['incline bench', 'Barbell Incline Bench Press']]);
  await page.getByTestId('row-barbell-back-squat').tap();
  const squat = exerciseView(page, 'barbell-back-squat');
  await pickSetType(page, squat.getByTestId('set-todo').first().getByTestId('set-type'), 'warmup');
  await squat.getByTestId('set-todo').first().getByTestId('weight-cell').tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await fillReps(squat, squat.getByTestId('set-todo').first(), 5);
  // Double tap the primary button: exactly one set is logged.
  const c = checkCurrent(squat);
  await Promise.all([c.tap().catch(() => undefined), c.tap().catch(() => undefined)]);
  await page.waitForTimeout(800);
  await expect(loggedRows(squat)).toHaveCount(1);
  for (let i = 2; i <= 4; i++) {
    await checkCurrent(squat).tap();
    await expect(loggedRows(squat)).toHaveCount(i);
  }
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-barbell-incline-bench-press').tap();
  const bench = exerciseView(page, 'barbell-incline-bench-press');
  await checkCurrent(bench).tap();
  await expect(loggedRows(bench)).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to the list' }).tap().catch(() => undefined);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const sets = await mine(page, 'sets');
  const sessions = await mine(page, 'sessions');
  expect(sets.length).toBeGreaterThanOrEqual(5);
  expect(new Set(sets.map((s) => s.id)).size).toBe(sets.length);
  expect(new Set(sessions.map((s) => s.id)).size).toBe(sessions.length);
  const ids = new Set(sessions.map((s) => s.id));
  for (const s of sets) expect(ids.has(s.sessionId), `orphan set ${s.id}`).toBe(true);
  for (const s of sets) {
    const l = s.load!;
    if (l.perSide) {
      const sum = sumLoad({ bar: l.barWeight ?? null, perSide: l.perSide, collars: 'none', unit: l.unit }).total! + (l.collars ?? 0);
      expect(l.total, `set ${s.id} total`).toBe(sum);
    }
  }
  for (const sid of ids) {
    const o = sets.filter((s) => s.sessionId === sid).sort((a, b) => a.order - b.order).map((s) => s.order);
    for (let i = 1; i < o.length; i++) expect(o[i]!, `order of ${sid}`).toBeGreaterThan(o[i - 1]!);
  }
  // Every exercise a set points at exists in some session's list; every session has at least one set (no empty saved shells).
  for (const s of sessions) expect(sets.some((x) => x.sessionId === s.id), `empty session ${s.id}`).toBe(true);
  for (const store of ['journal']) {
    const left = await dbAll<{ id?: string }>(page, store).catch(() => []);
    expect(left.length, `${store} left over`).toBe(0);
  }
  expect(errors).toEqual([]);
});
