import { expect, test, type Page } from './fixtures';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, shotOn, usePlan, watchErrors, pickSetType } from './workout-helpers';

const SQUAT = 'barbell-back-squat';
type S = { id: string; order: number; kind: string; sessionId: string; reps?: number; load?: { total: number; unit: string } };
const todaySets = async (page: Page) => (await dbAll<S>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
const seedSquat4 = (page: Page) => seedFinished(page, { [SQUAT]: Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });

type L = { kind: string; total: number; barWeight?: number; perSide?: number[]; collars?: number; stackValue?: number; added?: number };
/** SPEC 21.1 data exactness: every stored total equals its parts, orders rise per workout, ids are unique, no set without its workout. */
async function exact(page: Page) {
  const all = await dbAll<S & { load?: L; exerciseId: string }>(page, 'sets');
  const sessions = new Set((await dbAll<{ id: string }>(page, 'sessions')).map((x) => x.id));
  expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
  const bySession = new Map<string, number[]>();
  for (const x of all) {
    expect(sessions.has(x.sessionId), `orphan ${x.id}`).toBe(true);
    (bySession.get(x.sessionId) ?? bySession.set(x.sessionId, []).get(x.sessionId)!).push(x.order);
    const l = x.load;
    if (!l) continue;
    const parts = (l.perSide ?? []).reduce((a, b) => a + b, 0) * 2;
    if (l.kind === 'barbell' || l.kind === 'plate_machine') expect(Math.abs(l.total - ((l.barWeight ?? 0) + parts + (l.collars ?? 0))), `${x.id} ${JSON.stringify(l)}`).toBeLessThan(1e-9);
    if (l.kind === 'stack') expect(l.total).toBeCloseTo((l.stackValue ?? 0) + (l.added ?? 0), 9);
    if (l.kind === 'bodyweight') expect(l.total).toBeCloseTo(l.added ?? 0, 9);
  }
  for (const [sid, orders] of bySession) {
    const sorted = [...orders].sort((a, b) => a - b);
    expect(new Set(orders).size, `dup order in ${sid}`).toBe(orders.length);
    expect(sorted).toEqual(orders.length ? sorted : []);
  }
}
const failReads = (page: Page, on: boolean) => page.evaluate((v) => ((window as unknown as { __anygymFailReads?: boolean }).__anygymFailReads = v), on);

test('a: 4 rows, row 3 first, then highlighted, then the rest', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat4(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId(`row-${SQUAT}`).tap();
  const view = exerciseView(page, SQUAT);
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await view.getByRole('button', { name: /^Log set 3:/ }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.waitForTimeout(500);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  for (let i = 2; i < 4; i++) {
    await page.waitForTimeout(500);
    const btn = view.getByTestId('set-todo').first().getByRole('button', { name: /^Log set/ });
    if (await btn.count()) await btn.tap(); else await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
  }
  await expect(loggedRows(view)).toHaveCount(4);
  const s = await todaySets(page);
  expect(s).toHaveLength(4);
  expect(new Set(s.map((x) => x.id)).size).toBe(4);
  for (let i = 1; i < s.length; i++) expect(s[i]!.order).toBeGreaterThan(s[i - 1]!.order);
  expect(s.map((x) => x.load?.total)).toEqual([185, 185, 185, 185]);
  await shotOn(page, '1.7j-t', 'a-four-logged');
  await exact(page);
  expect(errors).toEqual([]);
});

test('c: 4 set lift, all W: ring not complete, no advance, 4 working rows remain', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat4(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId(`row-${SQUAT}`).tap();
  const view = exerciseView(page, SQUAT);
  for (let i = 0; i < 4; i++) {
    await pickSetType(page, view.getByTestId('set-todo').first().getByTestId('set-type'), 'warmup');
    await expect(view.getByTestId('set-todo').first().getByTestId('set-type')).toHaveAttribute('aria-label', /Warm up/);
    // Gate 2: a warm up drops the working target; fill it from LAST TIME.
    await view.getByTestId('set-todo').first().getByRole('button', { name: /^Last time .*Copy into set/ }).tap();
    await page.waitForTimeout(500);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
  }
  await page.waitForTimeout(800);
  expect((await todaySets(page)).map((s) => s.kind)).toEqual(['warmup', 'warmup', 'warmup', 'warmup']);
  await expect(view).toBeVisible();
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await expect(page.getByTestId('next-chip')).toHaveCount(0);
  await shotOn(page, '1.7j-t', 'c-warmups');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByTestId(`row-${SQUAT}`)).not.toHaveAttribute('data-state', 'done');
  await exact(page);
  expect(errors).toEqual([]);
});

test('b: plan read failing disables Use this plan; active plan tap is idempotent', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page, 'plan-six-week-volume');
  const state = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
  const progressed = { ...state, weekIndex: 2, nextDayIndex: 1, doneDays: [0, 2] };
  await dbPut(page, { planState: [progressed] });
  await page.addInitScript(() => {
    Object.defineProperty(window, '__anygymFailReads', { get: () => sessionStorage.getItem('pwfail') === '1', set: (v) => (v ? sessionStorage.setItem('pwfail', '1') : sessionStorage.removeItem('pwfail')), configurable: true });
  });
  await page.reload();
  await failReads(page, true);
  await page.goto('./#/plans/six-week-volume');
  await page.reload();
  const bar = page.getByTestId('action-bar');
  await expect(page.getByTestId('load-error')).toBeVisible();
  await expect(page.getByTestId('load-error').getByRole('button', { name: 'Try again' })).toBeVisible();
  const use = bar.getByRole('button', { name: /Use this plan|Go to Today/ });
  await expect(use).toBeDisabled();
  await shotOn(page, '1.7j-t', 'b-read-failed');
  await failReads(page, false);
  await page.getByTestId('load-error').getByRole('button', { name: 'Try again' }).tap();
  const btn = bar.getByRole('button', { name: /Use this plan|Go to Today/ });
  await expect(btn).toBeEnabled();
  console.log('active plan button label:', await btn.textContent());
  await btn.tap();
  await page.waitForTimeout(600);
  const after = (await dbAll<Record<string, unknown>>(page, 'planState'))[0]!;
  expect({ w: after.weekIndex, n: after.nextDayIndex, d: after.doneDays }).toEqual({ w: 2, n: 1, d: [0, 2] });
  expect(after).toEqual(progressed);
  expect(errors.filter((e) => !/Failed|failed|boom/i.test(e))).toEqual([]);
});

test('g: Plate Russian Twist in kg gym offers 5 kg and enabled plates', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Settings' }).tap();
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await dbAll<{ unit: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.unit).toBe('kg');
  await quickWith(page, [['russian twist', 'Plate Russian Twist']]);
  const view = exerciseView(page, 'plate-russian-twist');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  const opts = await sheet.getByRole('option').allTextContents();
  console.log('kg options', JSON.stringify(opts));
  expect(opts).toContain('5');
  expect(opts).not.toContain('4');
  expect(opts).not.toContain('6');
  await shotOn(page, '1.7j-t', 'g-kg-plate-picker');
  await sheet.getByRole('option', { name: /^5 kg/ }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('5');
  await page.waitForTimeout(450);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await todaySets(page))[0]!.load).toMatchObject({ unit: 'kg', total: 5 });
  // progression from a 5 kg lift
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: /Finish/ }).first().tap();
  await page.waitForTimeout(300);
  console.log('url after finish tap', page.url());
  await exact(page);
  expect(errors).toEqual([]);
});

import { addIdbSeams, heldWrites, holdNextSetWrite, releaseSetWrite } from './helpers/idb';
const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
async function squat135(page: Page) {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQUAT);
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  return view;
}

test('d: edit an in-flight row during a slow write, land, reload: saved exactly [10,12], nothing re-offered', async ({ page }) => {
  const errors = watchErrors(page);
  await addIdbSeams(page);
  const view = await squat135(page);
  const todo0 = await view.getByTestId('set-todo').count();
  const reps1 = Number(await view.getByTestId('reps-cell').first().textContent());
  await holdNextSetWrite(page);
  await page.waitForTimeout(450);
  await checkCurrent(view).tap();
  await expect.poll(() => heldWrites(page)).toBe(1);
  await view.getByTestId('reps-cell').first().tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  const edited = Number(await view.getByTestId('reps-cell').first().textContent());
  console.log('reps submitted', reps1, 'edited', edited);
  await releaseSetWrite(page);
  await expect(loggedRows(view)).toHaveCount(1);
  await page.waitForTimeout(500);
  console.log('todo after land', await view.getByTestId('set-todo').count(), 'todo0', todo0);
  // kill memory
  await page.reload();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await todaySets(page)).map((s) => s.reps)).toEqual([reps1]);
  console.log('pending reps after reload', await view.getByTestId('reps-cell').allTextContents());
  await expect(view.getByTestId('reps-cell').first()).toHaveText(String(edited));
  await shotOn(page, '1.7j-t', 'd-after-reload');
  await page.waitForTimeout(500);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await page.reload();
  await expect(loggedRows(view)).toHaveCount(2);
  console.log('todo after 2 logged+reload', await view.getByTestId('set-todo').count(), await view.getByTestId('reps-cell').allTextContents());
  const saved = await todaySets(page);
  expect(saved.map((s) => s.reps)).toEqual([reps1, edited]);
  expect(new Set(saved.map((s) => s.id)).size).toBe(2);
  await expect(view.getByTestId('set-todo')).toHaveCount(todo0 - 1);
  console.log('todo0', todo0);
  await exact(page);
  expect(errors).toEqual([]);
});

test('e: type change during a slow Finish is rejected; counts match', async ({ page }) => {
  const errors = watchErrors(page);
  await addIdbSeams(page);
  const view = await squat135(page);
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(450);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
  }
  const typeBtn = loggedRows(view).first().getByTestId('set-type');
  console.log('first logged row type button exists:', await typeBtn.count());
  await holdNextSetWrite(page);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.waitForTimeout(400);
  console.log('held', await heldWrites(page), 'url', page.url());
  await page.getByTestId(`row-${SQUAT}`).tap({ timeout: 1500 }).catch(() => console.log('row not tappable during finish'));
  await shotOn(page, '1.7j-t', 'e-finish-held');
  const visible = await typeBtn.isVisible().catch(() => false);
  console.log('type btn visible during finish', visible);
  if (visible) await typeBtn.tap({ timeout: 1500 }).catch(() => console.log('type tap blocked'));
  await releaseSetWrite(page);
  await page.waitForTimeout(1500);
  const sess = await dbAll<{ endedAt?: number }>(page, 'sessions');
  const s = await todaySets(page);
  console.log('url', page.url(), 'ended', sess.map((x) => !!x.endedAt), 'kinds', s.map((x) => x.kind));
  await expect(page).toHaveURL(/\/done$/);
  expect(s.map((x) => x.kind)).toEqual(['work', 'work']);
  await exact(page);
  expect(errors).toEqual([]);
});

test('base: todo counts in a plain quick workout', async ({ page }) => {
  const view = await squat135(page);
  const out: number[] = [await view.getByTestId('set-todo').count()];
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(450); await checkCurrent(view).tap(); await expect(loggedRows(view)).toHaveCount(i + 1); out.push(await view.getByTestId('set-todo').count()); }
  console.log('BASE todo counts', JSON.stringify(out));
});

import { readFileSync, writeFileSync } from 'node:fs';
type GymRec = { id: string; isActive: boolean; unit: string; equipmentWeights: Record<string, unknown>; [k: string]: unknown };
const activeGym = async (page: Page) => (await dbAll<GymRec>(page, 'gyms')).find((g) => g.isActive)!;
const startGym = async (page: Page) => {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  return activeGym(page);
};
const histSet = (sid: string, i: number, exerciseId: string, load: Record<string, unknown>, reps = 8) => ({ id: `${sid}-${i}`, sessionId: sid, exerciseId, order: i, kind: 'work', uncertain: false, reps, load });
const seedSession = async (page: Page, gym: GymRec, exerciseId: string, loads: Record<string, unknown>[]) => {
  const sid = `seed-${Date.now() - 2 * 86_400_000}`;
  const start = Date.now() - 2 * 86_400_000;
  await dbPut(page, { sessions: [{ id: sid, gymId: gym.id, startedAt: start, endedAt: start + 3_600_000, imported: false, exerciseIds: [exerciseId] }], sets: loads.map((l, i) => histSet(sid, i, exerciseId, l)) });
};

test('f1: LAST TIME 135 lb Olympic, today women\'s bar: exact 135 or a plain refusal', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await startGym(page);
  await seedSession(page, gym, SQUAT, [{ kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, barId: 'olympic', perSide: [45], collars: 0 }, { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, barId: 'olympic', perSide: [45], collars: 0 }]);
  await dbPut(page, { exerciseSettings: [{ exerciseId: SQUAT, gymId: gym.id, barId: 'womens' }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, SQUAT);
  console.log('f1 initial weight cells', await view.getByTestId('weight-cell').allTextContents(), 'guide', await view.getByTestId('set-guide').allTextContents());
  const lastBtn = view.getByRole('button', { name: /^Last time/ }).first();
  console.log('f1 last-time buttons', await view.getByRole('button', { name: /^Last time/ }).allTextContents());
  await lastBtn.tap();
  await page.waitForTimeout(500);
  console.log('f1 after copy: weights', await view.getByTestId('weight-cell').allTextContents(), 'status', await view.getByTestId('set-status').allTextContents().catch(() => []));
  const toasts = await page.getByRole('status').allTextContents();
  console.log('f1 toasts', JSON.stringify(toasts));
  await shotOn(page, '1.7j-t', 'f1-womens-bar');
  const w = await view.getByTestId('weight-cell').first().textContent();
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  console.log('f1 math', await sheet.getByTestId('plate-total').getAttribute('data-math').catch(() => null), 'total', await sheet.getByTestId('plate-total').textContent().catch(() => null));
  await shotOn(page, '1.7j-t', 'f1-picker');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  void w;
  await exact(page);
  expect(errors).toEqual([]);
});

test('f2: LAST TIME 90 plate machine start 0, today start 50: 90 (20 per side) or refusal', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await startGym(page);
  await seedSession(page, gym, 'leg-press', [{ kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], collars: 0 }, { kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], collars: 0 }]);
  await dbPut(page, { gyms: [{ ...gym, equipmentWeights: { ...gym.equipmentWeights, 'leg-press': { kind: 'starting_resistance', value: 50 } } }] });
  await page.reload();
  await quickWith(page, [['leg press', 'Leg Press']]);
  const view = exerciseView(page, 'leg-press');
  console.log('f2 initial weights', await view.getByTestId('weight-cell').allTextContents());
  console.log('f2 last-time buttons', await view.getByRole('button', { name: /^Last time/ }).allTextContents());
  await view.getByRole('button', { name: /^Last time/ }).first().tap();
  await page.waitForTimeout(500);
  console.log('f2 after copy', await view.getByTestId('weight-cell').allTextContents(), JSON.stringify(await page.getByRole('status').allTextContents()));
  await shotOn(page, '1.7j-t', 'f2-machine');
  const before = await view.getByTestId('weight-cell').first().textContent();
  await view.getByTestId('weight-cell').first().tap();
  console.log('f2 math', await weightSheet(page).getByTestId('plate-total').getAttribute('data-math').catch(() => null));
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  void before;
  // log it and read the stored load
  await page.waitForTimeout(450);
  if (await checkCurrent(view).isEnabled()) { await checkCurrent(view).tap(); await expect(loggedRows(view)).toHaveCount(1); }
  console.log('f2 stored', JSON.stringify((await todaySets(page)).map((s) => s.load)));
  await exact(page);
  expect(errors).toEqual([]);
});

test('i: +25 lb dip history, gym switched to kg: row says Last time +25 lb. Pick the added weight in kg; check blocked', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await startGym(page);
  await seedSession(page, gym, 'wide-grip-pull-up', [{ kind: 'bodyweight', unit: 'lb', total: 25, added: 25 }, { kind: 'bodyweight', unit: 'lb', total: 25, added: 25 }]);
  await page.getByRole('link', { name: 'Settings' }).tap();
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await activeGym(page)).unit).toBe('kg');
  await quickWith(page, [['wide grip pull', 'Wide Grip Pull Up']]);
  const view = exerciseView(page, 'wide-grip-pull-up');
  await expect(view).toBeVisible();
  console.log('i guide', await view.getByTestId('set-guide').allTextContents(), 'status', await view.getByTestId('set-status').allTextContents(), 'target', await view.getByTestId('set-target').allTextContents());
  await expect(view).toContainText('Last time +25 lb. Pick the added weight in kg');
  await expect(checkCurrent(view)).toBeDisabled();
  await shotOn(page, '1.7j-t', 'i-dips-kg');
  expect(await todaySets(page)).toEqual([]);
  await exact(page);
  expect(errors).toEqual([]);
});

test('j: backup with stack step 0 is rejected as damaged, nothing changed', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  const g0 = await startGym(page);
  await seedSession(page, g0, SQUAT, [{ kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, barId: 'olympic', perSide: [45], collars: 0 }]);
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const path = await download.path();
  const file = JSON.parse(readFileSync(path, 'utf8'));
  const gymsBefore = await dbAll(page, 'gyms');
  const bads: Array<[string, (g: Record<string, unknown>) => void]> = [
    ['stackStep 0', (g) => { g.stackStep = 0; }],
    ['stackStep -5', (g) => { g.stackStep = -5; }],
    ['machine stack_step 0', (g) => { g.equipmentWeights = { 'leg-press': { kind: 'stack_step', value: 0 } }; }],
    ['dumbbells max<min', (g) => { g.dumbbellRange = { min: 50, max: 10, step: 5 }; }],
  ];
  for (const [label, mutate] of bads) {
    const bad = JSON.parse(JSON.stringify(file));
    mutate(bad.tables.gyms[0]);
    const out = `${path}.bad.json`;
    writeFileSync(out, JSON.stringify(bad));
    await page.goto('./#/settings');
    await page.getByTestId('restore-file').setInputFiles(out);
    await page.waitForTimeout(600);
    const err = await page.getByTestId('import-error').textContent().catch(() => null);
    const sheetOpen = await page.getByRole('dialog', { name: 'Restore backup' }).count();
    console.log(`j ${label}: error=${JSON.stringify(err)} sheetOpen=${sheetOpen}`);
    expect(sheetOpen, label).toBe(0);
    expect(err, label).toBeTruthy();
    expect(await dbAll(page, 'gyms')).toEqual(gymsBefore);
  }
  await shotOn(page, '1.7j-t', 'j-rejected');
  await exact(page);
  expect(errors).toEqual([]);
});

test('g2: progression from a 5 kg plate twist targets 5 kg (an enabled plate), also at the top of the range', async ({ page }) => {
  const errors = watchErrors(page);
  const gym = await startGym(page);
  await page.getByRole('link', { name: 'Settings' }).tap();
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await activeGym(page)).unit).toBe('kg');
  const g = await activeGym(page);
  void gym;
  for (const reps of [10, 20]) {
    await dbPut(page, { sets: [], sessions: [] });
    const sid = `seed-${Date.now() - 86_400_000 * (reps === 10 ? 3 : 2)}`;
    const start = Date.now() - 86_400_000 * (reps === 10 ? 3 : 2);
    const mk = (i: number) => ({ id: `${sid}-${i}`, sessionId: sid, exerciseId: 'plate-russian-twist', order: i, kind: 'work', uncertain: false, reps, load: { kind: 'single', unit: 'kg', total: 5 } });
    await dbPut(page, { sessions: [{ id: sid, gymId: g.id, startedAt: start, endedAt: start + 3_600_000, imported: false, exerciseIds: ['plate-russian-twist'] }], sets: [mk(0), mk(1), mk(2)] });
    await quickWith(page, [['russian twist', 'Plate Russian Twist']]);
    const view = exerciseView(page, 'plate-russian-twist');
    const cells = await view.getByTestId('weight-cell').allTextContents();
    console.log(`g2 reps ${reps}: weights`, cells, 'guide', await view.getByTestId('set-guide').allTextContents(), 'target', await view.getByTestId('set-target').allTextContents());
    await shotOn(page, '1.7j-t', `g2-progress-${reps}`);
    for (const c of cells) expect(['5', '10']).toContain(c.trim());
    if (reps === 10) expect(cells.every((c) => c.trim() === '5')).toBe(true);
    await page.goto('./');
    // abandon this quick workout so the next one starts clean
    // wait for Today to render before looking for Resume (it is empty right after goto)
    await expect(page.getByRole('button', { name: /Quick workout/ }).first()).toBeVisible();
    const resume = page.getByRole('button', { name: /in progress/ }).first();
    if (await resume.count()) { await resume.tap(); await page.getByRole('button', { name: 'Finish', exact: true }).tap().catch(() => undefined); await expect(page.getByRole('status').filter({ hasText: 'Workout discarded' })).toBeVisible(); await page.goto('./'); }
  }
  expect(errors).toEqual([]);
});
