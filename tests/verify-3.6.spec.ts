// Independent verification of PLAN 3.6 (SPEC 7.4, 20.1, 22). Tap path in this build:
// Today → See plans → Classic 5 Day Split → Use this plan → Start (Today day card) → on the day list
// tap the "~90 min" button in the header (under the title) → "How much time today?" sheet.
// Screenshots go to reports/shots/3.6/verify/.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { checkControls, checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { bar185, dbAll, dbPut, shotOn, usePlan, watchErrors } from './workout-helpers';

type Trim = { drop: string[]; sets: Record<string, number>; mobility?: string[] };
type Sess = { id: string; gymId: string; exerciseIds: string[]; trim?: Trim; timeBudgetMin?: number; endedAt?: number; startedAt: number };
type Gym = { id: string; name: string; isActive: boolean; timeBudgetMin?: number };

const D = '3.6/verify';
const start = async (page: Page) => {
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
};
const active = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined)!;
const sheetOf = (page: Page) => page.getByRole('dialog', { name: 'How much time today?' });
const chip = (page: Page, label: string) => sheetOf(page).getByRole('radio', { name: label, exact: true });
const minutes = async (page: Page) => Number(/~(\d+) min/.exec((await page.getByTestId('time-estimate').textContent()) ?? '')?.[1]);
const fitNum = async (page: Page) => Number(/~(\d+) min/.exec((await sheetOf(page).getByTestId('time-fit').textContent()) ?? '')?.[1]);

async function logSquat(page: Page, n: number) {
  const s = await active(page);
  await dbPut(page, {
    sets: Array.from({ length: n }, (_, i) => ({ id: `v-squat-${i}`, sessionId: s.id, exerciseId: 'barbell-back-squat', order: i, kind: 'work', uncertain: false, reps: 10, load: bar185 })),
    orderCounters: [{ sessionId: s.id, next: n }],
  });
  await page.reload();
  await expect(page.getByTestId('workout-title')).toBeVisible();
}

async function finishWithSet(page: Page, tag: string) {
  const s = await active(page);
  const all = await dbAll(page, 'sets');
  await dbPut(page, { sets: [{ id: `v-${tag}-${all.length}`, sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', uncertain: false, reps: 10, load: bar185 }], orderCounters: [{ sessionId: s.id, next: 1 }] });
  await page.reload();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
}

test('Day 1: header 90 min is a button, chips, live 30, Apply, Undo exact, reload, 75+, double tap, targets @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await start(page);
  // Check 1: 16 items by hand = 5410 s = 90 min (computed in src/lib/__tests__/verify-3.6.test.ts from the JSON).
  expect(await minutes(page)).toBe(90);
  await logSquat(page, 2);
  const planned = await minutes(page);
  const before = await active(page);
  const header = page.getByTestId('time-estimate');
  expect(await header.evaluate((el) => el.tagName)).toBe('BUTTON');
  const hb = (await header.boundingBox())!;
  test.info().annotations.push({ type: 'header-button', description: `${Math.round(hb.width)}x${Math.round(hb.height)}` });
  await header.tap();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('How much time today?').first()).toBeVisible();
  const labels = await sheet.getByRole('radio').allInnerTexts();
  expect(labels.map((l) => l.trim())).toEqual(['20', '30', '45', '60', '75+']);
  await page.waitForTimeout(700); // sheet spring settled
  for (const r of await sheet.getByRole('radio').all()) {
    const b = (await r.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(48);
    expect(b.width).toBeGreaterThanOrEqual(48);
  }
  await chip(page, '30').tap();
  const f30 = await fitNum(page);
  await expect(sheet.getByTestId('time-changes')).toContainText('Cut: ');
  await chip(page, '60').tap();
  const f60 = await fitNum(page);
  expect(f60).toBeGreaterThan(f30);
  await chip(page, '30').tap();
  await shotOn(page, D, 'sheet-30');
  const changes = await sheet.getByTestId('time-changes').innerText();
  const apply = sheet.getByRole('button', { name: 'Apply to this workout' });
  expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // Double tap Apply: one trim, no duplicate rows. FINDING: the 2nd tap lands on the list row under the closing sheet.
  await apply.dblclick().catch(() => undefined);
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(1200);
  if ((await header.count()) === 0) {
    test.info().annotations.push({ type: 'FINDING', description: 'double tap on Apply opened the exercise view of the row under the sheet' });
    await page.getByRole('button', { name: 'Back to the list' }).tap();
  }
  await expect(header).toHaveText(`~${f30} min`);
  const trimmed = await active(page);
  expect(new Set(trimmed.exerciseIds).size).toBe(trimmed.exerciseIds.length);
  expect(trimmed.timeBudgetMin).toBe(30);
  // The cut rows are gone from the list; every cut name is in the change list.
  for (const id of trimmed.trim!.drop) await expect(page.getByTestId(`row-${id}`)).toHaveCount(0);
  expect(trimmed.trim!.drop.length).toBeGreaterThan(0);
  expect(changes).toContain('Stretches in one quick block');
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveAttribute('aria-label', /2 of 4 done/);
  expect((await dbAll(page, 'sets')).length).toBe(2);
  const gymA = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  expect(gymA.timeBudgetMin).toBe(30);
  await shotOn(page, D, 'list-trimmed');

  // Undo restores the session exactly.
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(header).toHaveText(`~${planned} min`);
  await expect.poll(async () => JSON.stringify(await active(page))).toBe(JSON.stringify(before));
  expect(((await dbAll<Gym>(page, 'gyms')).find((g) => g.id === gymA.id) ?? {}).timeBudgetMin).toBeUndefined();
  expect((await dbAll(page, 'sets')).length).toBe(2);

  // Trim again, reload keeps it, 75+ restores the full day.
  await header.tap();
  await chip(page, '30').tap();
  await sheet.getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(header).toHaveText(`~${f30} min`);
  await page.reload();
  await expect(header).toHaveText(`~${f30} min`);
  for (const id of trimmed.trim!.drop) await expect(page.getByTestId(`row-${id}`)).toHaveCount(0);
  await header.tap();
  await expect(chip(page, '30')).toHaveAttribute('aria-checked', 'true');
  await chip(page, '75+').tap();
  await sheet.getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(header).toHaveText(`~${planned} min`);
  await expect.poll(async () => (await active(page)).exerciseIds).toEqual(before.exerciseIds);
  expect((await active(page)).trim).toBeUndefined();
  expect((await dbAll(page, 'sets')).length).toBe(2);
  expect(errors).toEqual([]);
});

test('reduced motion and 130% text: sheet and list fit, no console errors @matrix', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await simulateSafeAreas(page);
  await usePlan(page);
  await start(page);
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main, main *, [role="dialog"], [role="dialog"] *'))) {
      const s = getComputedStyle(el);
      el.style.fontSize = `${parseFloat(s.fontSize) * 1.3}px`;
      if (Number.isFinite(parseFloat(s.lineHeight))) el.style.lineHeight = `${parseFloat(s.lineHeight) * 1.3}px`;
    }
  });
  await page.getByTestId('time-estimate').tap();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await chip(page, '20').tap();
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [role="dialog"] *'))) {
      const s = getComputedStyle(el);
      el.style.fontSize = `${parseFloat(s.fontSize) * 1.3}px`;
    }
  });
  await checkLayout(page, { scope: '[role="dialog"]' });
  await checkControls(page, '[role="dialog"]');
  for (const r of await sheet.getByRole('radio').all()) expect(await fullyShown(r)).toBe(true);
  const apply = sheet.getByRole('button', { name: 'Apply to this workout' });
  await apply.scrollIntoViewIfNeeded();
  expect(await fullyShown(apply)).toBe(true);
  await shotOn(page, D, 'sheet-20-130-reduced');
  await apply.tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('time-line')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the quiet offer: below the day, once, closes, never trims by itself; close button is 48 pt @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  const p = (await dbAll<{ id: string; createdAt: number }>(page, 'profile'))[0] ?? { id: 'me', defaultUnit: 'lb', createdAt: Date.now() };
  await dbPut(page, { profile: [{ ...p, intake: { minutes: 30 } }] });
  await page.reload();
  await start(page);
  const line = page.getByTestId('time-line');
  await expect(line).toContainText('Longer than your 30 min');
  await expect(line.getByRole('button', { name: 'Make it fit' })).toBeVisible();
  const close = line.getByRole('button', { name: 'Not today' });
  const cb = (await close.boundingBox())!;
  test.info().annotations.push({ type: 'close-btn', description: `${Math.round(cb.width)}x${Math.round(cb.height)}` });
  expect(cb.height).toBeGreaterThanOrEqual(44);
  expect((await active(page)).trim).toBeUndefined();
  await shotOn(page, D, 'offer');
  await close.tap();
  await expect(line).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await expect(page.getByTestId('time-line')).toHaveCount(0);
  expect((await active(page)).trim).toBeUndefined();
  expect(errors).toEqual([]);
});

test('a budget the rules cannot reach says Shortest it goes, honestly @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('time-estimate').tap();
  await chip(page, '20').tap();
  const text = (await sheetOf(page).getByTestId('time-fit').textContent()) ?? '';
  const n = Number(/~(\d+) min/.exec(text)?.[1]);
  test.info().annotations.push({ type: 'day1-at-20', description: text });
  if (n > 20) expect(text).toMatch(/^Shortest it goes: ~\d+ min/);
  else expect(text).toMatch(/^Fits in ~/);
  await shotOn(page, D, 'sheet-20');
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${n} min`);
  expect(errors).toEqual([]);
});

test('per gym memory, Finish uses the trimmed day, backup and restore keep the trim and the gym pick @matrix', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: () => false, configurable: true });
  });
  await usePlan(page);
  await start(page);
  await page.getByTestId('time-estimate').tap();
  await chip(page, '30').tap();
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  const s = await active(page);
  const cutLifts = s.trim!.drop.length;
  // Log one set of the squat (never cut), then finish.
  await dbPut(page, { sets: [{ id: 'v-fin-1', sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', uncertain: false, reps: 10, load: bar185 }], orderCounters: [{ sessionId: s.id, next: 1 }] });
  await page.reload();
  const rowsLeft = await page.locator('[data-testid^="row-"]').count();
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-title')).toBeVisible();
  const prog = (await page.getByTestId('finish-progress').textContent()) ?? '';
  const total = Number(/of (\d+) lifts/.exec(prog)?.[1]);
  info.annotations.push({ type: 'finish-progress', description: `${prog} | cut lifts ${cutLifts} | rows ${rowsLeft}` });
  expect(total).toBe(12 - cutLifts);
  const why = (await page.getByTestId('finish-next-why').textContent().catch(() => '')) ?? '';
  info.annotations.push({ type: 'finish-why', description: why });
  const planned = Number(/of (\d+) sets/.exec(why)?.[1]);
  if (planned) expect(planned).toBeLessThan(37);
  await shotOn(page, D, 'finish');
  await page.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);

  // Backup carries Session.trim and Gym.timeBudgetMin.
  await page.goto('./#/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  const fs = file.tables.sessions.find((x: Sess) => x.id === s.id);
  expect(fs.trim).toEqual(s.trim);
  expect(fs.timeBudgetMin).toBe(30);
  expect(file.tables.gyms.some((g: Gym) => g.timeBudgetMin === 30)).toBe(true);
  const sessBefore = (await dbAll<Sess>(page, 'sessions')).sort((a, b) => a.startedAt - b.startedAt);
  const gymsBefore = await dbAll<Gym>(page, 'gyms');
  // Wipe and restore with Replace.
  await page.evaluate(() => new Promise<void>((res, rej) => { const r = indexedDB.deleteDatabase('anygym'); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }));
  await page.goto('./#/history');
  await page.reload();
  await expect(page.getByText('No workouts yet')).toBeVisible();
  await page.goto('./#/settings');
  await page.getByTestId('restore-file').setInputFiles((await download.path())!);
  await page.getByTestId('restore-replace').tap();
  await page.getByTestId('restore-replace').tap();
  await expect(page.getByText(/Restored \d+ workout/)).toBeVisible();
  const sessAfter = (await dbAll<Sess>(page, 'sessions')).sort((a, b) => a.startedAt - b.startedAt);
  expect(sessAfter.find((x) => x.id === s.id)!.trim).toEqual(s.trim);
  expect(sessAfter).toEqual(sessBefore);
  const gymsAfter = await dbAll<Gym>(page, 'gyms');
  expect(gymsAfter.find((g) => g.timeBudgetMin === 30)).toBeTruthy();
  expect(gymsAfter.length).toBe(gymsBefore.length);
  expect(errors).toEqual([]);
});

test('the last pick is remembered per gym (3.9 pill) @matrix', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await usePlan(page);
  const gymA = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  await start(page);
  await page.getByTestId('time-estimate').tap();
  await chip(page, '30').tap();
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await finishWithSet(page, 'a');
  // Switch to a new hotel gym with the pill, pick 45 there.
  await page.getByTestId('gym-pill').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Gyms' });
  await sheet.getByTestId('new-gym-row').tap();
  await page.getByTestId('preset-hotel').tap();
  await page.getByTestId('add-gym').tap();
  await expect(page.getByTestId('gym-pill').first()).toContainText('Hotel');
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)?.name).toMatch(/Hotel/);
  // KNOWN BUG (3.9, not 3.6): without this reload Start uses the memoized first-load gym (db/bootstrap startDb) and the workout lands at the OLD gym.
  await page.reload();
  await expect(page.getByTestId('gym-pill').first()).toContainText('Hotel');
  await start(page);
  test.info().annotations.push({ type: 'session-gym', description: String((await active(page)).gymId.slice(0, 4)) });
  await page.getByTestId('time-estimate').tap();
  test.info().annotations.push({ type: 'gyms-at-hotel', description: JSON.stringify((await dbAll<Gym>(page, 'gyms')).map((g) => [g.id.slice(0, 4), g.name, g.isActive, g.timeBudgetMin])) + ' session ' + JSON.stringify(await active(page)) + ' checked=' + (await sheetOf(page).getByRole('radio', { checked: true }).allInnerTexts()).join() });
  // The hotel has no pick of its own: nothing carried over from the other gym.
  await expect(sheetOf(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await chip(page, '45').tap();
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await finishWithSet(page, 'b');
  const gyms = await dbAll<Gym>(page, 'gyms');
  expect(gyms.find((g) => g.id === gymA.id)!.timeBudgetMin).toBe(30);
  expect(gyms.find((g) => g.id !== gymA.id)!.timeBudgetMin).toBe(45);
  // Back to gym A: its sheet opens on 30.
  await page.getByTestId('gym-pill').first().tap();
  await page.getByRole('dialog', { name: 'Gyms' }).getByTestId(`gym-${gymA.id}`).tap();
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)?.id).toBe(gymA.id);
  await page.reload();
  await start(page);
  await page.getByTestId('time-estimate').tap();
  await expect(chip(page, '30')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});
