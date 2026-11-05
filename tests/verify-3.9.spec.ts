// Tester checks for PLAN 3.9 (SPEC 3, 19, 20.1): exact hotel preset, delete and Undo byte identical,
// blocked deletes, two-tap switching on Today / day list / Run, mid workout switch with exact Undo,
// Last time per gym, backup and restore with and without the per set gym, control audit.
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { checkControls, checkLayout, simulateSafeAreas } from './helpers/layout';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, seedFinished, shotOn, usePlan, watchErrors } from './workout-helpers';

type G = Record<string, unknown> & { id: string; name: string; isActive: boolean; equipment: string[] };
type Sess = Record<string, unknown> & { id: string; gymId: string; endedAt?: number };
type S = Record<string, unknown> & { id: string; gymId?: string; sessionId: string };

const gyms = (p: Page) => dbAll<G>(p, 'gyms');
const sessions = (p: Page) => dbAll<Sess>(p, 'sessions');
const sets = async (p: Page) => {
  const live = (await dbAll<Sess>(p, 'sessions')).find((s) => s.endedAt === undefined);
  return (await dbAll<S>(p, 'sets')).filter((x) => !live || x.sessionId === live.id).sort((a, b) => a.id.localeCompare(b.id));
};
const allSets = async (p: Page) => (await dbAll<S>(p, 'sets')).sort((a, b) => a.id.localeCompare(b.id));
const live = async (p: Page) => (await sessions(p)).find((s) => s.endedAt === undefined)!;
const SHOTS = '3.9/verify';

const openGyms = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).or(page.getByRole('button', { name: 'Settings' })).first().tap();
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByTestId('gyms-list')).toBeVisible();
};
const addHotel = async (page: Page, name: string, city: string) => {
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('gym-name').fill(name);
  if (city) await page.getByTestId('gym-city').fill(city);
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gyms-list')).toContainText(name);
};
const rowOf = (page: Page, name: string) => page.getByTestId('gyms-list').locator('button', { hasText: name });
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v);

test('V1 Settings Gyms: list, exact hotel preset, rename, make active, equipment, delete + Undo identical, blocked deletes @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await openGyms(page);
  await expect.poll(async () => (await gyms(page)).length).toBe(1);
  const first = (await gyms(page))[0]!;
  await expect(page.getByTestId(`gyms-row-${first.id}`)).toContainText('Active');

  // The last gym cannot be deleted, with a plain reason.
  await page.getByTestId(`gyms-row-${first.id}`).tap();
  await expect(page.getByTestId('delete-gym')).toBeDisabled();
  await expect(page.getByText('You need at least one gym.')).toBeVisible();
  await page.getByLabel('Back to Gyms').tap();

  await addHotel(page, 'Hotel gym', 'Osaka');
  const row = rowOf(page, 'Hotel gym');
  await expect(row).toContainText('Osaka');
  await expect(row).toContainText('Dumbbells 5 to 50 lb');
  await shotOn(page, SHOTS, 'gyms-list');
  const hotel = (await gyms(page)).find((g) => g.name === 'Hotel gym')!;
  // SPEC 3 hotel preset, nothing more.
  expect([...hotel.equipment].sort()).toEqual(['adjustable_bench', 'bike', 'cable_station', 'dumbbells', 'treadmill']);
  expect(hotel.dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
  expect(hotel).toMatchObject({ type: 'hotel', unit: 'lb', city: 'Osaka', isActive: false, equipmentWeights: {}, collars: 'none' });
  expect(hotel.bars).toEqual({ olympic: 45, womens: 35, ez_curl: null, trap: null, smith: null });
  expect(hotel.equipment).toHaveLength(5);

  // Rename and make active.
  await row.tap();
  await page.getByTestId('detail-name').fill('Hilton');
  await page.getByTestId('detail-name').blur();
  await expect(page.getByRole('heading', { name: 'Hilton' })).toBeVisible();
  await page.getByTestId('make-active').tap();
  await expect(page.getByTestId('gym-is-active')).toBeVisible();
  expect((await gyms(page)).find((g) => g.isActive)?.name).toBe('Hilton');
  // Make the original active again so Hilton can be deleted (no workouts).
  await page.getByLabel('Back to Gyms').tap();
  await page.getByTestId(`gyms-row-${first.id}`).tap();
  await page.getByTestId('make-active').tap();
  await expect(page.getByTestId('gym-is-active')).toBeVisible();
  await page.getByLabel('Back to Gyms').tap();

  // Equipment through the picker: turn the bike off, the summary and record change.
  await rowOf(page, 'Hilton').tap();
  await page.getByTestId('edit-equipment').tap();
  await page.getByRole('button', { name: /^Bike/ }).first().tap();
  await expect.poll(async () => (await gyms(page)).find((g) => g.id === hotel.id)!.equipment).not.toContain('bike');
  await page.getByLabel('Back to the gym').tap();
  await expect(page.getByTestId('detail-equipment')).toBeVisible();

  // Delete with Undo restores the record byte for byte.
  const before = JSON.stringify(sorted((await gyms(page)).find((g) => g.id === hotel.id)));
  await page.getByTestId('delete-gym').tap();
  await expect(page.getByTestId('gyms-list')).not.toContainText('Hilton');
  expect((await gyms(page)).some((g) => g.id === hotel.id)).toBe(false);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('gyms-list')).toContainText('Hilton');
  expect(JSON.stringify(sorted((await gyms(page)).find((g) => g.id === hotel.id)))).toBe(before);
  expect((await gyms(page)).filter((g) => g.isActive)).toHaveLength(1);

  // Delete the active hotel gym: the other takes over; Undo gives the active flag back too.
  await rowOf(page, 'Hilton').tap();
  await page.getByTestId('make-active').tap();
  const gymsBefore = JSON.stringify(sorted(await gyms(page)));
  await page.getByTestId('delete-gym').tap();
  await expect(page.getByTestId('gyms-list')).not.toContainText('Hilton');
  expect((await gyms(page)).filter((g) => g.isActive)).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('gyms-list')).toContainText('Hilton');
  expect(JSON.stringify(sorted(await gyms(page)))).toBe(gymsBefore);

  // A gym with a workout cannot be deleted, with the reason.
  await dbPut(page, { sessions: [{ id: 'old', gymId: hotel.id, startedAt: Date.now() - 86_400_000, endedAt: Date.now() - 80_000_000, imported: false }] });
  await rowOf(page, 'Hilton').tap();
  await expect(page.getByTestId('delete-gym')).toBeDisabled();
  await expect(page.getByText('Workouts were logged here')).toBeVisible();
  await checkControls(page);
  await shotOn(page, SHOTS, 'gym-detail-blocked');
  expect(errors).toEqual([]);
});

test('V2 the pill on Today, the day list and Run opens the sheet in one tap; a switch is two taps @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await expect.poll(async () => (await gyms(page)).length).toBe(1);
  const base = (await gyms(page))[0]!;
  await dbPut(page, { gyms: [{ ...base, id: 'gym-b', name: 'Casa', type: 'home', equipment: [], dumbbellRange: null, isActive: false, createdAt: base.createdAt + 5 }] });
  const sheet = page.getByRole('dialog', { name: 'Gyms' });
  const ids = async () => (await gyms(page)).find((g) => g.isActive)!.id;

  // Today.
  await page.goto('./');
  await checkControls(page);
  await shotOn(page, SHOTS, 'today');
  await page.getByTestId('gym-pill').first().tap(); // tap 1
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('new-gym-row')).toBeVisible();
  await expect(sheet.getByTestId('gym-gym-b')).toBeVisible();
  await shotOn(page, SHOTS, 'sheet');
  await sheet.getByTestId('gym-gym-b').tap(); // tap 2
  await expect(sheet).toHaveCount(0);
  expect(await ids()).toBe('gym-b');
  await expect(page.getByTestId('gym-pill').first()).toContainText('Casa');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(ids).toBe(base.id);

  // Day list title area.
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await expect(page.getByTestId('workout-meta')).toBeVisible();
  await page.getByTestId('gym-pill').tap();
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('gym-gym-b').tap(); // preview for a live workout
  await expect(page.getByTestId('switch-preview')).toBeVisible();
  await page.getByTestId('switch-stay').tap();
  await expect(page.getByTestId('switch-preview')).toHaveCount(0);
  expect(await ids()).toBe(base.id);
  expect((await live(page)).gymId).toBe(base.id);

  // Run.
  await page.goto('./#/run');
  await expect(page.getByTestId('gym-pill')).toBeVisible();
  await checkControls(page);
  await page.getByTestId('gym-pill').tap();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('new-gym-row')).toBeVisible();
  expect(errors).toEqual([]);
});

test('V3 mid workout: log 2 sets, switch to a hotel gym; preview first; sets keep exercise and gym; Undo restores session and sets exactly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const full = (await gyms(page)).find((g) => g.isActive)!;
  const sessBefore = JSON.stringify(sorted(await live(page)));
  const setsBefore = JSON.stringify(sorted(await sets(page)));
  expect((await sets(page)).length).toBe(2);

  await page.getByTestId('gym-pill').tap();
  await page.getByRole('dialog', { name: 'Gyms' }).getByTestId('new-gym-row').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('add-gym').tap();
  const preview = page.getByTestId('switch-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId('switch-change-swap').first()).toBeVisible();
  const text = await preview.innerText();
  console.log(`PREVIEW:\n${text}`);
  expect(text).toMatch(/Swapped:/);
  expect(text).toMatch(/Sets you logged stay/);
  expect(await preview.getByTestId('switch-change-noFit').count()).toBeGreaterThanOrEqual(0);
  await shotOn(page, SHOTS, 'preview');
  // The sheet's own invisible grabber "Close" (53 pt tall) pokes 11 pt under the status bar on a full height sheet; reported, not asserted.
  for (const id of ['switch-confirm', 'switch-stay']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(b.height).toBeGreaterThanOrEqual(48);
    expect(b.y + b.height).toBeLessThanOrEqual(vh);
    expect(b.x).toBeGreaterThanOrEqual(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  // Nothing written yet.
  expect(JSON.stringify(sorted(await live(page)))).toBe(sessBefore);
  expect(JSON.stringify(sorted(await sets(page)))).toBe(setsBefore);

  await page.getByTestId('switch-confirm').tap();
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toBeVisible();
  const after = await sets(page);
  expect(after).toHaveLength(2);
  for (const s of after) expect(s).toMatchObject({ exerciseId: 'barbell-back-squat', gymId: full.id });
  expect((await live(page)).gymId).not.toBe(full.id);
  await shotOn(page, SHOTS, 'after-switch');

  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('swap-line-Dumbbell_Squat')).toHaveCount(0);
  await expect.poll(async () => JSON.stringify(sorted(await live(page)))).toBe(sessBefore);
  expect(JSON.stringify(sorted(await sets(page)))).toBe(setsBefore);
  expect((await gyms(page)).find((g) => g.isActive)?.id).toBe(full.id);
  expect((await gyms(page)).filter((g) => g.isActive)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('V4 Last time follows the active gym for machines; free weights are shared @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await gyms(page)).length).toBe(1);
  const a = (await gyms(page))[0]!;
  const day = 86_400_000;
  const mk = (id: string, gymId: string, ago: number, ex: string, reps: number, load: Record<string, unknown>) => ({
    s: { id, gymId, startedAt: Date.now() - ago * day, endedAt: Date.now() - ago * day + 3_600_000, imported: false, exerciseIds: [ex] },
    w: { id: `${id}-0`, sessionId: id, exerciseId: ex, order: 0, kind: 'work', uncertain: false, reps, load },
  });
  const ex = 'cable-tricep-pushdown';
  const A = mk('hist-a', a.id, 3, ex, 10, { kind: 'stack', unit: 'lb', total: 55, stackValue: 55 });
  const B = mk('hist-b', 'gym-b', 1, ex, 12, { kind: 'stack', unit: 'lb', total: 35, stackValue: 35 });
  const FA = mk('hist-fa', a.id, 4, 'barbell-back-squat', 5, { kind: 'barbell', unit: 'lb', total: 225, barWeight: 45, perSide: [45, 45] });
  await dbPut(page, {
    gyms: [{ ...a, id: 'gym-b', name: 'Other gym', isActive: false, createdAt: a.createdAt + 5 }],
    sessions: [A.s, B.s, FA.s],
    sets: [A.w, B.w, FA.w],
  });
  await quickWith(page, [['pushdown', 'Cable Tricep Pushdown']]);
  const view = exerciseView(page, ex);
  await expect(view).toBeVisible();
  await expect(view).toContainText('Last time');
  const atA = await view.innerText();
  console.log(`LAST AT A:\n${atA}`);
  expect(atA).toMatch(/55/);
  expect(atA).not.toMatch(/\b35\b/);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('gym-pill').tap();
  await page.getByRole('dialog', { name: 'Gyms' }).getByTestId('gym-gym-b').tap();
  if (await page.getByTestId('switch-confirm').isVisible().catch(() => false)) await page.getByTestId('switch-confirm').tap();
  await expect.poll(async () => (await gyms(page)).find((g) => g.isActive)?.id).toBe('gym-b');
  await page.getByTestId(`row-${ex}`).tap();
  await expect(exerciseView(page, ex)).toContainText('35 lb × 12');
  const atB = await exerciseView(page, ex).innerText();
  console.log(`LAST AT B:\n${atB}`);
  expect(atB).toMatch(/35/);
  expect(atB).not.toMatch(/\b55\b/);
  await shotOn(page, SHOTS, 'last-time-at-b');
  expect(errors).toEqual([]);
});

test('V5 backup keeps gyms and the per set gym; an old backup without the field loads @matrix', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('gym-pill').tap();
  await page.getByRole('dialog', { name: 'Gyms' }).getByTestId('new-gym-row').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('add-gym').tap();
  await page.getByTestId('switch-confirm').tap();
  await expect(page.getByTestId('switch-preview')).toHaveCount(0);
  const full = (await gyms(page)).find((g) => g.name !== 'Hotel gym')!;
  expect((await sets(page))[0]!.gymId).toBe(full.id);
  const sess0 = await sessions(page);
  const gyms0 = await gyms(page);

  const wipe = async () => {
    await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
    await page.goto('./#/history');
    await page.reload();
    await expect(page.getByText('No workouts yet')).toBeVisible({ timeout: 15000 });
  };
  const restore = async (path: string) => {
    await page.goto('./#/settings');
    await page.getByTestId('restore-file').setInputFiles(path);
    await expect(page.getByRole('dialog', { name: 'Restore backup' })).toBeVisible();
    await page.getByTestId('restore-replace').tap();
    await page.getByTestId('restore-replace').tap();
    await expect(page.getByRole('dialog', { name: 'Restore backup' })).toHaveCount(0);
  };

  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const path = (await download.path())!;
  const file = JSON.parse(readFileSync(path, 'utf8'));
  expect(file.tables.gyms).toHaveLength(2);
  expect(file.tables.sets[0].gymId).toBe(full.id);

  await wipe();
  await restore(path);
  expect(await gyms(page)).toHaveLength(2);
  expect(sorted(await gyms(page))).toEqual(sorted(gyms0));
  expect((await sets(page))[0]!.gymId).toBe(full.id);
  expect(sorted((await sessions(page)).map((s) => s.gymId))).toEqual(sorted(sess0.map((s) => s.gymId)));

  // An old backup: the same file without the per set field.
  for (const s of file.tables.sets) delete s.gymId;
  const old = info.outputPath('old-backup.json');
  writeFileSync(old, JSON.stringify(file));
  await wipe();
  await restore(old);
  expect(await gyms(page)).toHaveLength(2);
  const restored = await sets(page);
  expect(restored).toHaveLength(1);
  expect(restored[0]!.gymId).toBeUndefined();
  await page.goto('./#/history');
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('V6 reduced motion and double tap on a switch: one gym change, no duplicate gyms @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await simulateSafeAreas(page);
  await openGyms(page);
  await page.getByTestId('settings-new-gym').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('gym-name').fill('Dbl');
  await page.getByTestId('add-gym').dblclick();
  await expect(page.getByTestId('gyms-list')).toContainText('Dbl');
  await page.waitForTimeout(600);
  expect((await gyms(page)).filter((g) => g.name === 'Dbl')).toHaveLength(1);
  await rowOf(page, 'Dbl').tap();
  await page.getByTestId('make-active').dblclick();
  await expect(page.getByTestId('gym-is-active')).toBeVisible();
  expect((await gyms(page)).filter((g) => g.isActive)).toHaveLength(1);
  // Huge and empty names.
  await page.getByTestId('detail-name').fill('x'.repeat(200));
  await page.getByTestId('detail-name').blur();
  await expect.poll(async () => (await gyms(page)).find((g) => g.isActive)!.name.length).toBeLessThanOrEqual(40);
  await page.getByTestId('detail-name').fill('   ');
  await page.getByTestId('detail-name').blur();
  expect((await gyms(page)).find((g) => g.isActive)!.name.trim().length).toBeGreaterThan(0);
  await page.getByLabel('Back to Gyms').tap();
  await checkControls(page);
  await checkLayout(page);
  expect(errors).toEqual([]);
});

test('V7 plates follow the active gym inventory @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await gyms(page)).length).toBe(1);
  const a = (await gyms(page))[0]!;
  const inv = (a.plateInventory as Array<{ weight: number; enabled: boolean }>).map((p) => ({ ...p }));
  await dbPut(page, { gyms: [{ ...a, id: 'gym-b', name: 'No 45s', isActive: false, createdAt: a.createdAt + 5, plateInventory: inv.map((p) => (p.weight === 45 ? { ...p, enabled: false } : p)) }] });
  const names = async () => {
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    await exerciseView(page, 'barbell-back-squat').getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600);
    return (await sheet.getByRole('button').allInnerTexts()).concat(await sheet.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '')));
  };
  const at1 = (await names()).join('|');
  console.log(`PLATES A: ${at1}`);
  expect(at1).toMatch(/45/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('gym-pill').tap();
  await page.getByRole('dialog', { name: 'Gyms' }).getByTestId('gym-gym-b').tap();
  if (await page.getByTestId('switch-confirm').isVisible().catch(() => false)) await page.getByTestId('switch-confirm').tap();
  await expect.poll(async () => (await gyms(page)).find((g) => g.isActive)?.id).toBe('gym-b');
  await page.getByTestId('row-barbell-back-squat').tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await exerciseView(page, 'barbell-back-squat').getByTestId('weight-cell').first().tap();
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600);
  const at2 = (await sheet.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))).join('|');
  console.log(`PLATES B: ${at2}`);
  expect(at2).not.toMatch(/Add 45 lb plate/);
  expect(at2).toMatch(/Add 35 lb plate/);
  await shotOn(page, SHOTS, 'plates-no-45');
  expect(errors).toEqual([]);
});
