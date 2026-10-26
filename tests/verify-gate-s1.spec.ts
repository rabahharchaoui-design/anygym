import { expect, test, type Page } from './fixtures';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Independent tester spec for the Session 1 merge gate recheck (blockers 1 to 8, 12, 14, data exactness).
const DAY = 86_400_000;
const shot = async (page: Page, name: string) => {
  const p = test.info().project.name;
  if (!['iPhone SE', 'iPhone 15'].includes(p)) return;
  await page.waitForTimeout(450);
  await page.screenshot({ path: `reports/shots/gate-s1/${name}-${p.replace(/ /g, '-')}.png` });
};
type Row = Record<string, unknown> & { id: string };
const mine = async (page: Page, store: string) => (await dbAll<Row>(page, store)).filter((r) => !r.id.startsWith('seed-'));

async function planDay(page: Page, lastReps = 10) {
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: lastReps, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
}

test('1 set type sheet: 4 choices, chip words, stored kinds work/warmup/drop/work+failure', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }, { reps: 10, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const want: Array<['warmup' | 'drop' | 'failure' | 'normal', string]> = [['warmup', 'Warm up'], ['drop', 'Drop set'], ['failure', ''], ['normal', '']];
  for (let i = 0; i < want.length; i++) {
    const [type, chip] = want[i]!;
    const row = view.getByTestId('set-todo').first();
    await row.getByTestId('set-type').tap();
    const sheet = page.getByRole('dialog', { name: 'Set type' });
    await expect(sheet.getByRole('radio')).toHaveCount(4);
    await expect(sheet.getByRole('button', { name: /^What is/ })).toHaveCount(4);
    if (i === 0) await shot(page, 'settype-sheet');
    await sheet.getByTestId(`set-type-${type}`).tap();
    await expect(sheet).toHaveCount(0);
    if (chip) await expect(row.getByTestId('set-type-chip')).toHaveText(chip);
    if (type === 'warmup') {
      // Gate 2: a warm up drops the working target; it is filled by hand (here from LAST TIME).
      await expect(row.getByTestId('weight-cell')).toHaveText('Pick');
      await row.getByRole('button', { name: /^Last time .*Copy into set/ }).tap();
    }
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
  }
  const sets = (await mine(page, 'sets')).sort((a, b) => (a.order as number) - (b.order as number));
  expect(sets.map((s) => [s.kind, s.failure ?? false])).toEqual([['warmup', false], ['drop', false], ['work', true], ['work', false]]);
  expect(errors).toEqual([]);
});

test('4 partial finish: copy, one Next up line, data untouched', async ({ page }) => {
  const errors = watchErrors(page);
  await planDay(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved · 1 set');
  await page.waitForTimeout(1500);
  await shot(page, 'finish-partial');
  const before = { sets: await mine(page, 'sets'), sessions: (await mine(page, 'sessions')).length };
  // PLAN 2.0a: no choices on screen; 1 set keeps Day 1, the line says so, and the sets are untouched.
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 1 · Legs (hamstring focus)');
  const after = { sets: await mine(page, 'sets'), sessions: (await mine(page, 'sessions')).length };
  expect(after).toEqual(before);
  expect(before.sets).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('5 coach mark arrow is within 24 px of the current check, far from + Add set', async ({ page }) => {
  const errors = watchErrors(page);
  await planDay(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  const hint = page.locator('[data-hint="setCard"]');
  await expect(hint).toBeVisible();
  await page.waitForTimeout(500);
  const c = (await checkCurrent(view).boundingBox())!;
  const h = (await hint.boundingBox())!;
  const add = (await view.getByRole('button', { name: '+ Add set' }).boundingBox())!;
  const arrowX = h.x + h.width - 26;
  expect(Math.abs(arrowX - (c.x + c.width / 2))).toBeLessThanOrEqual(24);
  // Gate 2: the bubble floats over the column header, its arrow down onto the check.
  expect(Math.abs(h.y + h.height - c.y)).toBeLessThanOrEqual(24);
  expect(Math.abs(h.y - (add.y + add.height))).toBeGreaterThan(24);
  expect(h.x).toBeGreaterThanOrEqual(0);
  expect(h.x + h.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await shot(page, 'coach-mark');
  expect(errors).toEqual([]);
});

test('6 day list: hint once, Start pill opens the current exercise @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await planDay(page);
  // Gate 2: no "Tap an exercise to begin" bubble; the pill says it.
  await expect(page.locator('[data-hint="dayList"]')).toHaveCount(0);
  await shot(page, 'daylist');
  const pill = page.getByTestId('start-next');
  const name = (await pill.textContent())!.replace(/^Start · /, '');
  expect(name.length).toBeGreaterThan(2);
  const pb = (await pill.boundingBox())!;
  expect(pb.height).toBeGreaterThanOrEqual(47.5);
  await pill.tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+\/[\w-]+$/);
  await expect(page.getByRole('main')).toContainText(name);
  await shot(page, 'start-pill-result');
  expect(errors).toEqual([]);
});

test('8 target rule: not top of range = same load more reps; at the top = +5 lb', async ({ page }) => {
  const errors = watchErrors(page);
  await planDay(page, 10);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-next')).toHaveText('Beat last time: 11 reps at 185 lb');
  await expect(view.getByText(/^Last time \d/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('8b top of range: target is +5 lb', async ({ page }) => {
  const errors = watchErrors(page);
  await planDay(page, 12);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  const text = await view.getByTestId('set-next').textContent();
  await shot(page, 'target-top');
  expect(text).toMatch(/190 lb/);
  expect(errors).toEqual([]);
});

test('7+3 aliases: shown once; history under either id merges (LAST TIME, PR, data untouched)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const gymId = await seedFinished(page, { 'bent-over-barbell-row': [{ reps: 10, load: bar185 }, { reps: 10, load: bar185 }] }, 9);
  const mk = (id: string, ex: string, daysAgo: number, reps: number) => ({
    s: { id, gymId, startedAt: Date.now() - daysAgo * DAY, endedAt: Date.now() - daysAgo * DAY + 3_600_000, imported: false, exerciseIds: [ex] },
    set: { id: `${id}-0`, sessionId: id, exerciseId: ex, order: 0, kind: 'work', reps, load: bar185, uncertain: false },
  });
  const a = mk('alias-a', 'barbell-bent-over-row', 6, 8);
  const b = mk('alias-b', 'bent-over-barbell-row', 3, 9);
  await dbPut(page, { sessions: [a.s, b.s], sets: [a.set, b.set] });
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(sheet).toBeVisible();
  const recent = sheet.getByRole('region', { name: 'Recent' });
  await expect(recent.getByRole('button', { name: /Bent Over/ })).toHaveCount(1);
  await shot(page, 'picker-default');
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('bent over');
  await expect(sheet.getByRole('region', { name: 'Results' }).getByRole('button').filter({ hasText: /Row/ })).toHaveText(['Barbell Bent Over Row']);
  await sheet.getByRole('button', { name: 'Barbell Bent Over Row', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = exerciseView(page, 'barbell-bent-over-row');
  await expect(view.getByRole('button', { name: /^Last time 9 × 185/ })).toBeVisible();
  // 9 reps last, 12 not reached: target is more reps at 185, built from the merged history.
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toBeVisible();
  const sets = await dbAll<Row>(page, 'sets');
  expect(sets.map((s) => s.id).filter((i) => i.startsWith('alias-') || i.startsWith('seed-')).length).toBe(4);
  expect(JSON.stringify(sets.filter((s) => s.id === 'alias-a-0'))).toContain('"exerciseId":"barbell-bent-over-row"');
  expect(JSON.stringify(sets.filter((s) => s.id === 'alias-b-0'))).toContain('"exerciseId":"bent-over-barbell-row"');
  const chips = (await page.getByTestId('pr-chip').allTextContents()).join('|');
  console.log('PR chips:', chips);
  expect(chips).toBe('');
  await page.goto('./#/history');
  await expect(page.getByTestId('history-row')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('12 Settings has no tab bar @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  const nav = page.locator('nav[aria-label="Main"]');
  await expect(nav).toHaveAttribute('data-hidden', 'true');
  await expect.poll(async () => (await nav.boundingBox())!.y).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  await shot(page, 'settings');
  expect(errors).toEqual([]);
});

test('14 reminder reason: 6 workouts, 40 days', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string }>(page, 'gyms'))[0]!;
  const now = Date.now();
  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `r-${i}`, gymId: gym.id, startedAt: now - (30 - i) * DAY, endedAt: now - (30 - i) * DAY + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat'] }));
  const sets = sessions.map((s, i) => ({ id: `rs-${i}`, sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 8, load: bar185, uncertain: false }));
  await dbPut(page, { sessions, sets, profile: [{ id: 'me', defaultUnit: 'lb', createdAt: now - 90 * DAY, lastBackupAt: now - 40 * DAY }] });
  await page.reload();
  await expect(page.getByTestId('reminder-reason')).toHaveText('6 workouts are only on this phone. Last backup 40 days ago.');
  await shot(page, 'today-reminder');
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('130% text: exercise view and partial finish screen, shots and no sideways scroll', async ({ page }) => {
  const errors = watchErrors(page);
  await planDay(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const scale = () => page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const z = els.map((el) => { const s = getComputedStyle(el); return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) }; });
    for (const { el, size, line } of z) { el.style.fontSize = `${size * 1.3}px`; if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`; }
  });
  await scale();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-next')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await shot(page, 'text130-exercise');
  await checkCurrent(view).tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toBeVisible();
  await page.waitForTimeout(900);
  await scale();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await shot(page, 'text130-finish');
  expect(errors).toEqual([]);
});

test('3 backup round trip with aliased ids is lossless and history still merges', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); } catch { /* ignore */ } });
  await page.goto('./');
  const gymId = await seedFinished(page, { 'bent-over-barbell-row': [{ reps: 10, load: bar185 }] }, 9);
  const mk = (id: string, ex: string, daysAgo: number, reps: number) => ({
    s: { id, gymId, startedAt: Date.now() - daysAgo * DAY, endedAt: Date.now() - daysAgo * DAY + 3_600_000, imported: false, exerciseIds: [ex] },
    set: { id: `${id}-0`, sessionId: id, exerciseId: ex, order: 0, kind: 'work', reps, load: bar185, uncertain: false },
  });
  const a = mk('alias-a', 'barbell-bent-over-row', 6, 8);
  const b = mk('alias-b', 'bent-over-barbell-row', 3, 9);
  await dbPut(page, { sessions: [a.s, b.s], sets: [a.set, b.set] });
  const snap = async () => ({ s: (await dbAll<Row>(page, 'sessions')).sort((x, y) => x.id.localeCompare(y.id)), t: (await dbAll<Row>(page, 'sets')).sort((x, y) => x.id.localeCompare(y.id)) });
  const before = await snap();
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const path = await download.path();
  await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByText('No workouts yet')).toBeVisible();
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles(path);
  await page.getByTestId('restore-replace').tap();
  await page.getByTestId('restore-replace').tap();
  await expect(page.getByText(/^Restored 3 workouts/)).toBeVisible();
  expect(await snap()).toEqual(before);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('bent over');
  await sheet.getByRole('button', { name: 'Barbell Bent Over Row', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  await expect(exerciseView(page, 'barbell-bent-over-row').getByRole('button', { name: /^Last time 9 × 185/ })).toBeVisible();
  expect(errors).toEqual([]);
});
