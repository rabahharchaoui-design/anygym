import { expect, test, type Page } from './fixtures';
import { bar185, checkCurrent, dbAll, dbPut, exerciseView, fillReps, loggedRows, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Session 1 merge gate fixes (ux-critic): set type sheet, dumbbell wheel empty state, picker search
// and duplicates, finish screen words, coach marks on what they explain, the day list Start pill,
// "Current" load type, Settings without the tab bar, the backup reason, History numbering.

const DAY = 86_400_000;

const center = (b: { x: number; width: number }) => b.x + b.width / 2;

test('dumbbell wheel, first open with no weight: nothing lit, "Scroll to your dumbbell", Done waits; a scroll commits at once @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['dumbbell bench', 'Dumbbell Bench Press']]);
  const view = exerciseView(page, 'dumbbell-bench-press');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  const wheel = sheet.getByRole('listbox', { name: 'Weight of one dumbbell' });
  await expect(wheel).toBeVisible();
  await page.waitForTimeout(500); // the sheet's spring settles
  await expect(wheel.locator('[data-centered="true"]')).toHaveCount(0);
  await expect(wheel.locator('[aria-selected="true"]')).toHaveCount(0);
  await expect(sheet.getByTestId('wheel-prompt')).toHaveText('Scroll to your dumbbell');
  await expect(sheet.getByTestId('wheel-prompt')).not.toHaveAttribute('data-hidden', /.*/);
  await expect(sheet.getByRole('button', { name: 'Done' })).toBeDisabled();
  // One instruction only: no bubble, no frame around any number until a pick; plain subtitle.
  await expect(sheet.locator('[data-hint="wheel"]')).toHaveCount(0);
  await expect(sheet.getByText('This set and the ones below', { exact: true })).toBeVisible();
  const frame = await sheet.locator('[data-empty]').first().evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(frame).toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
  const promptBox = (await sheet.getByTestId('wheel-prompt').boundingBox())!;

  // A scroll picks the weight in the notch right away (1.7i rule).
  await wheel.evaluate((el) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    el.scrollLeft = 68 * 3;
  });
  await expect(wheel.locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(wheel.locator('[data-centered="true"]')).toHaveCount(1);
  await expect(sheet.getByRole('button', { name: 'Done' })).toBeEnabled();
  await expect(sheet.getByTestId('wheel-prompt')).toHaveAttribute('data-hidden', 'true');
  // Its space stays: nothing below moves.
  expect((await sheet.getByTestId('wheel-prompt').boundingBox())!.y).toBeCloseTo(promptBox.y, 0);
  const picked = await wheel.locator('[aria-selected="true"]').getAttribute('aria-label');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText(picked!.replace(/ lb$/, ''));
  expect(errors).toEqual([]);
});

test('picker: typing lets go of the chip and searches everything; "plank" under Shoulders offers Search everything @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  // Default list: Popular (big compounds first), then All; never A to Z first.
  await expect(sheet.getByRole('region').first()).toHaveAccessibleName('Popular');
  await expect(sheet.getByRole('region', { name: 'Popular' }).getByRole('button').first()).toHaveAccessibleName('Barbell Back Squat');
  await expect(sheet.getByRole('region', { name: 'All' })).toBeVisible();

  const chip = sheet.getByRole('group', { name: 'Body part' }).getByRole('button', { name: 'Shoulders' });
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' });
  await chip.tap();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await search.fill('plank');
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(sheet.getByRole('button', { name: 'Elbow Plank', exact: true })).toBeVisible();

  // A chip tapped after typing narrows the search: nothing in Shoulders, said plainly, one way out.
  await chip.tap();
  await expect(sheet.getByTestId('picker-none')).toHaveText('Nothing in Shoulders matches “plank”.Search everything');
  await sheet.getByRole('button', { name: 'Search everything' }).tap();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(sheet.getByRole('button', { name: 'Elbow Plank', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Spider Plank', exact: true })).toBeVisible();
  // The bare "Plank" is the same exercise: shown once, as the more specific name.
  await expect(sheet.getByRole('button', { name: 'Plank', exact: true })).toHaveCount(0);

  // A chip stays while the search still matches inside it.
  const core = sheet.getByRole('group', { name: 'Body part' }).getByRole('button', { name: 'Core' });
  await search.fill('');
  await core.tap();
  await search.fill('plank');
  await expect(core).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: 'Elbow Plank', exact: true })).toBeVisible();
  // Fully in view with a 16 pt inset.
  const [row, chipBox] = [(await sheet.getByRole('group', { name: 'Body part' }).boundingBox())!, (await core.boundingBox())!];
  await expect.poll(async () => (await core.boundingBox())!.x + (await core.boundingBox())!.width).toBeLessThanOrEqual(row.x + row.width - 14); // 16 pt, less subpixel rounding of scrollLeft
  expect(chipBox.width).toBeGreaterThan(0);
  await core.tap();

  // Same words in another order: one entry, found with either order.
  await search.fill('bent over barbell row');
  await expect(sheet.getByRole('region', { name: 'Results' }).getByRole('button')).toHaveText(['Barbell Bent Over Row']);
  // A bare machine name that does not prove the same machine stays its own entry (SPEC 0, 6).
  await search.fill('leg curl');
  await expect(sheet.getByRole('button', { name: 'Leg Curl', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Machine Lying Leg Curl', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('set type sheet: four plain choices with ⓘ, the row shows a word chip, stored kinds unchanged', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }, { reps: 10, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const type = view.getByTestId('set-todo').first().getByTestId('set-type');
  await expect(type).toHaveText('1');
  await type.tap();
  const sheet = page.getByRole('dialog', { name: 'Set type' });
  await expect(sheet.getByRole('heading', { name: 'Set type' })).toBeVisible();
  await expect(sheet.getByRole('radio')).toHaveText([
    'NormalA regular set. It counts toward beating last time.',
    'Warm upLighter, to get ready. It never counts toward progress.',
    'Drop setLower the weight and keep going straight away.',
    "All outUntil you can't do another rep.",
  ]);
  // The ⓘ explains, in a stacked sheet.
  await sheet.getByRole('button', { name: 'What is All out?' }).tap();
  const info = page.getByRole('dialog', { name: 'All out' });
  await expect(info).toBeVisible();
  await info.getByRole('button', { name: 'Got it' }).tap();
  await expect(info).toHaveCount(0);
  await sheet.getByTestId('set-type-warmup').tap();
  await expect(sheet).toHaveCount(0);
  await expect(type.getByTestId('set-type-chip')).toHaveText('Warm up');
  // A warm up drops the prefilled working target: weight Pick, reps empty, ✓ waits.
  const row = view.getByTestId('set-todo').first();
  await expect(row.getByTestId('weight-cell')).toHaveText('Pick');
  await expect(row.getByTestId('reps-cell')).not.toHaveText(/[1-9]/);
  await expect(checkCurrent(view)).toBeDisabled();
  // The other rows keep their targets.
  await expect(view.getByTestId('set-todo').nth(1).getByTestId('weight-cell')).toHaveText('185');
  // Filled by hand (here: 135 lb, 5 reps).
  await row.getByTestId('weight-cell').tap();
  const w = page.getByRole('dialog', { name: 'Pick the weight' });
  await w.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await w.getByRole('button', { name: 'Done' }).tap();
  await row.getByTestId('reps-cell').tap();
  for (let i = 0; i < 5; i++) await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect.poll(async () => (await dbAll<{ id: string; kind: string }>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).map((s) => s.kind)).toEqual(['warmup']);
  // Warm ups never count toward Total lifted (SPEC 21.1).
  await expect(page.getByTestId('live-stats')).toHaveText('1 set');
  // A logged set changes through the same sheet.
  await loggedRows(view).first().getByTestId('set-type').tap();
  await expect(sheet.getByRole('radio', { name: /^Warm up/ })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByTestId('set-type-drop').tap();
  await expect.poll(async () => (await dbAll<{ id: string; kind: string }>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).map((s) => s.kind)).toEqual(['drop']);
  await expect(loggedRows(view).first().getByTestId('set-type-chip')).toHaveText('Drop set');
  // A drop set is quiet (secondary text), never the old blue.
  const [drop, quiet] = await view.evaluate((el) => [
    getComputedStyle(el.querySelector('[data-testid="set-row"] [data-testid="set-type"]')!).color,
    getComputedStyle(el.querySelector('[data-head]')!).color,
  ]);
  expect(drop).toBe(quiet);
  expect(errors).toEqual([]);
});

/** Day 1 with squat history, list open. */
async function dayList(page: Page) {
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
}

test('day list: no hint bubble, one line "Start · <name>" pill in the thumb zone, the current row above it, "My Gym · ~N min" @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await dayList(page);
  await expect(page.locator('[data-hint="dayList"]')).toHaveCount(0);
  await expect(page.getByTestId('workout-meta')).toHaveText(/^\S.*\s·\s~\d+ min$/);
  for (const name of ['Open Spotify', 'Open Apple Music']) {
    const b = (await page.getByRole('link', { name }).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(47.5);
    await expect(page.getByRole('link', { name }).locator('svg')).toHaveCount(1);
  }
  const next = page.locator('[data-state="next"]');
  const pill = page.getByTestId('start-next');
  const nextName = (await next.getAttribute('aria-label'))!.split(',')[0]!;
  await expect(pill).toHaveText(`Start · ${nextName}`);
  await expect(pill).toHaveAccessibleName(`Start ${nextName}`);
  const pb = (await pill.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(pb.y + pb.height).toBeGreaterThan(vh * 0.7); // the thumb zone
  expect(pb.height).toBeLessThanOrEqual(56); // one line
  const nb = (await next.boundingBox())!;
  expect(nb.y + nb.height).toBeLessThanOrEqual(pb.y);
  await pill.tap();
  await expect(page).toHaveURL(/#\/workout\/[\w-]+\/[\w-]+$/);
  await expect(page.getByRole('button', { name: 'Back to the list' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('day list at 360 wide: the pill stays one line with an ellipsis; the row up next opens above it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await dayList(page);
  const pill = page.getByTestId('start-next');
  const label = pill.locator('span').last();
  expect(await label.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('nowrap');
  expect(await label.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  expect((await pill.boundingBox())!.height).toBeLessThanOrEqual(56);
  const next = (await page.locator('[data-state="next"]').boundingBox())!;
  expect(next.y + next.height).toBeLessThanOrEqual((await pill.boundingBox())!.y);
  expect(errors).toEqual([]);
});

test('coach mark floats over the column header with its arrow on the first row\'s check, never over row text', async ({ page }) => {
  const errors = watchErrors(page);
  await dayList(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  const hint = page.locator('[data-hint="setCard"]');
  await expect(hint).toHaveText('Tap the check when you finish a set');
  await page.waitForTimeout(400);
  const check = (await checkCurrent(view).boundingBox())!;
  const b = (await hint.boundingBox())!;
  const head = (await view.locator('[data-head]').boundingBox())!;
  const firstRow = view.getByTestId('set-todo').first();
  // Over the header band, the bubble ends at the first row's top; its arrow (26 px in) on the check.
  expect(b.y).toBeGreaterThanOrEqual(head.y - 4);
  expect(b.y + b.height).toBeLessThanOrEqual(check.y + 4);
  expect(Math.abs(b.x + b.width - 26 - center(check))).toBeLessThanOrEqual(8);
  for (const cell of [firstRow.getByTestId('weight-cell'), firstRow.getByTestId('reps-cell')]) {
    const c = (await cell.boundingBox())!;
    expect(b.y + b.height).toBeLessThanOrEqual(c.y + 6);
  }
  await expect(view.getByTestId('set-next')).toBeVisible();
  const guide = (await view.getByTestId('set-last').boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(guide.y + guide.height - 2);
  await checkCurrent(view).tap();
  await expect(hint).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('first time: the helper sits above the table, not under a row', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const guide = (await view.getByTestId('set-guide').boundingBox())!;
  const head = (await view.locator('[data-head]').boundingBox())!;
  expect(guide.y + guide.height).toBeLessThanOrEqual(head.y + 1);
  expect(errors).toEqual([]);
});

test('finish with exercises left: "Workout saved · N sets", progress quiet, plain Next time choices with a helper @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await dayList(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved · 1 set');
  // Never "1 set" against "0 of 16 done": plain, exact.
  await expect(page.getByTestId('finish-progress')).toHaveText(/^0 of \d+ exercises finished · 1 started$/);
  // The first exercise row is in full view above the pinned choices and Done.
  const firstRow = (await page.getByTestId('finish-exercise').first().boundingBox())!;
  const footerTop = (await page.getByRole('radio', { name: 'Next time: repeat Day 1' }).boundingBox())!.y;
  expect(firstRow.y + firstRow.height).toBeLessThanOrEqual(footerTop);
  const left = page.getByTestId('finish-sets-left').first();
  await expect(left).toHaveText('1 of 4 sets');
  const [leftColor, quiet] = await left.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(document.querySelector('[data-testid="finish-progress"]')!).color]);
  expect(leftColor).toBe(quiet);
  const repeat = page.getByRole('radio', { name: 'Next time: repeat Day 1' });
  const move = page.getByRole('radio', { name: 'Next time: move on to Day 2' });
  await expect(repeat).toBeChecked();
  await expect(page.getByTestId('finish-choice-helper')).toHaveText('Today will show Day 1 again.');
  await move.tap();
  await expect(move).toBeChecked();
  await expect(page.getByTestId('finish-choice-helper')).toHaveText('Today will show Day 2 next.');
  expect(errors).toEqual([]);
});

test('exercise view: one "Beat last time" target line, no duplicate Last time summary; LAST TIME column stays', async ({ page }) => {
  const errors = watchErrors(page);
  await dayList(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-next')).toHaveText('Beat last time: 11 reps at 185 lb');
  await expect(view.getByText(/^Last time \d/)).toHaveCount(0);
  await expect(view.getByRole('button', { name: /^Last time 10 × 185\. Copy into set 1/ })).toBeVisible();
  // When it was stays visible, compact (SPEC 6): nothing extra when every set has a row.
  await expect(view.getByTestId('set-last')).toHaveText(/^Last time \([A-Z][a-z]{2}\): 4 × 10 at 185 lb$/);
  expect(errors).toEqual([]);
});

test('last time had more sets than today\'s rows: the extra ones show in the compact line', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': [...Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })), { reps: 8, load: bar185 }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  // Every set of last time, exact, in the one line (the fifth has no row today).
  await expect(view.getByTestId('set-last')).toHaveText(/^Last time \([A-Z][a-z]{2}\): 10 × 185 · 10 × 185 · 10 × 185 · 10 × 185 · 8 × 185 lb$/);
  expect(errors).toEqual([]);
});

test('"How do you load this?" marks the current choice', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await page.getByRole('dialog', { name: 'Barbell Back Squat options' }).getByRole('button', { name: /^Loaded with/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'How do you load this?' });
  await expect(sheet.getByTestId('load-type-current')).toHaveCount(1);
  await expect(sheet.getByTestId('load-type-current')).toHaveText('Current');
  await expect(sheet.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(sheet.locator('button[aria-pressed="true"]')).toContainText('Current');
  expect(errors).toEqual([]);
});

test('Settings hides the tab bar like every pushed screen; plain "us" in the report copy', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('nav[aria-label="Main"]')).toHaveAttribute('data-hidden', 'true');
  await expect(page.getByText('Tell us what went wrong. Add a screenshot if it helps.')).toBeVisible();
  await expect(page.getByText(/the builder/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to Today' }).tap();
  await expect(page.locator('nav[aria-label="Main"]')).not.toHaveAttribute('data-hidden', /.*/);
  expect(errors).toEqual([]);
});

test('backup reminder says why, counted by the ids the last backup held: 3 imported after it count', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
  });
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string }>(page, 'gyms'))[0]!;
  const now = Date.now();
  const sessions = Array.from({ length: 6 }, (_, i) => ({ id: `old-${i}`, gymId: gym.id, startedAt: now - (10 - i) * DAY, endedAt: now - (10 - i) * DAY + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat'] }));
  const sets = sessions.map((s, i) => ({ id: `set-${i}`, sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 8, load: bar185, uncertain: false }));
  await dbPut(page, { sessions, sets });
  await page.reload();
  await expect(page.getByTestId('reminder-reason')).toHaveText('6 workouts are only on this phone. No backup yet.');

  // A real backup stores which workouts it holds (ids only).
  await page.goto('./#/settings');
  await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
  await expect(page.getByText('Backup saved')).toBeVisible();
  await expect.poll(async () => ((await dbAll<{ backedUpSessionIds?: string[] }>(page, 'profile'))[0]?.backedUpSessionIds ?? []).sort()).toEqual(sessions.map((s) => s.id).sort());

  // Three workouts imported after that backup (import order, no dates): they are only here.
  const imported = [1, 2, 3].map((n) => ({ id: `imp-${n}`, gymId: gym.id, startedAt: n, importSeq: n, imported: true, exerciseIds: ['deadlift'] }));
  const profile = (await dbAll<Record<string, unknown>>(page, 'profile'))[0]!;
  await dbPut(page, { sessions: imported, profile: [{ ...profile, lastBackupAt: now - 15 * DAY }] });
  await page.goto('./');
  await expect(page.getByTestId('reminder-reason')).toHaveText('3 workouts are only on this phone. Last backup 15 days ago.');
  expect(errors).toEqual([]);
});

test('History numbers imported workouts of one exercise and shows their note; detail shows time and total lifted', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string }>(page, 'gyms'))[0]!;
  const imp = (n: number, note?: string) => ({ id: `imp-${n}`, gymId: gym.id, startedAt: n, importSeq: n, imported: true, exerciseIds: ['barbell-back-squat'], ...(note ? { note } : {}) });
  const now = Date.now();
  const live = { id: 'live', gymId: gym.id, startedAt: now - 2 * DAY, endedAt: now - 2 * DAY + 52 * 60_000, imported: false, exerciseIds: ['barbell-back-squat'] };
  const set = (id: string, sessionId: string) => ({ id, sessionId, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', reps: 10, load: bar185, uncertain: false });
  await dbPut(page, { sessions: [imp(1, 'Felt heavy'), imp(2), live], sets: [set('a', 'imp-1'), set('b', 'imp-2'), set('c', 'live')] });
  await page.goto('./#/history');
  const rows = page.getByTestId('history-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Workout 1 of 2' })).toContainText('Felt heavy');
  await expect(rows.filter({ hasText: 'Workout 2 of 2' })).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Imported · no dates' })).toBeVisible();
  await page.getByRole('list', { name: 'Finished workouts' }).getByTestId('history-row').tap();
  await expect(page.getByTestId('history-meta')).toHaveText(/ · 1 set · 52 min · 1,850 lb lifted$/);
  // An imported one exercise workout: the title names it, the card does not repeat it.
  await page.goto('./#/history');
  await page.getByTestId('history-row').filter({ hasText: 'Workout 2 of 2' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Barbell Back Squat' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Barbell Back Squat' })).toHaveCount(0);
  // Dumbbells: the total says both hands.
  const db = { id: 'db', gymId: gym.id, startedAt: now - DAY, endedAt: now - DAY + 30 * 60_000, imported: false, exerciseIds: ['dumbbell-bench-press'] };
  await dbPut(page, { sessions: [db], sets: [{ id: 'd1', sessionId: 'db', exerciseId: 'dumbbell-bench-press', order: 0, kind: 'work', reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 }, uncertain: false }] });
  await page.goto('./#/history/db');
  await expect(page.getByTestId('history-meta')).toHaveText(/ lb lifted \(both hands\)$/);
  expect(errors).toEqual([]);
});

test('after Done, Today fades in whole; the toast sits just above the tab bar, opaque, over no button @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await dayList(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  await checkCurrent(exerciseView(page, 'barbell-back-squat')).tap();
  await expect(loggedRows(exerciseView(page, 'barbell-back-squat'))).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await expect(toast).toBeVisible();
  await page.waitForTimeout(900); // the page scrolls its cards clear of the toast
  const t = (await toast.boundingBox())!;
  const bar = (await page.locator('nav[aria-label="Main"]').boundingBox())!;
  expect(bar.y - (t.y + t.height)).toBeGreaterThanOrEqual(4);
  expect(bar.y - (t.y + t.height)).toBeLessThanOrEqual(16);
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const l of [page.getByRole('button', { name: 'Change day' }), page.getByRole('button', { name: 'Start', exact: true }), page.getByTestId('quick-card')]) {
    if (!(await l.count())) continue;
    expect(overlaps(t, (await l.boundingBox())!), await l.innerText()).toBe(false);
  }
  const alpha = await toast.evaluate((el) => {
    const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/)![1]!.split(',').map(Number);
    return m.length === 4 ? m[3]! : 1;
  });
  expect(alpha).toBeGreaterThanOrEqual(0.9);
  expect(errors).toEqual([]);
});

test('a warm up weight is for that warm up only; working rows stay 185 and log 185; warm ups read W, working sets 1 to n', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [10, 10, 10].map((reps) => ({ reps, load: bar185 })) });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const rows = view.getByTestId('set-todo');
  await rows.first().getByTestId('set-type').tap();
  await page.getByRole('dialog', { name: 'Set type' }).getByTestId('set-type-warmup').tap();
  await expect(view.getByTestId('set-type').locator('span:first-child')).toHaveText(['W', '1', '2']);
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
  // The warm up used no working row: three working rows of 185 are still to do.
  await expect(view.getByTestId('set-target')).toContainText('Set 1 of 3');
  await expect(view.getByTestId('weight-cell')).toHaveText(['185', '185', '185']);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  const sets = (await dbAll<{ id: string; kind: string; order: number; load: { total: number } }>(page, 'sets')).filter((x) => !x.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
  expect(sets.map((x) => [x.kind, x.load.total])).toEqual([['warmup', 145], ['work', 185]]);
  await expect(view.getByTestId('set-type').locator('span:first-child')).toHaveText(['W', '1', '2', '3']);
  expect(errors).toEqual([]);
});

test('the Start pill says Continue with the set once one is logged; surfaces are opaque; the list keeps the rest bar\'s room', async ({ page }) => {
  const errors = watchErrors(page);
  await dayList(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  await checkCurrent(exerciseView(page, 'barbell-back-squat')).tap();
  await expect(loggedRows(exerciseView(page, 'barbell-back-squat'))).toHaveCount(1);
  const rest = page.getByTestId('rest-timer');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByTestId('start-next')).toHaveText('Continue · Barbell Back Squat · set 2 of 4');
  const glass = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--glass-bg-strong'));
  const nums = glass.match(/[\d.]+/g)!.map(Number);
  expect(nums[nums.length - 1]).toBeGreaterThanOrEqual(0.9);
  if (await rest.count()) {
    expect(await rest.evaluate((el) => (getComputedStyle(el) as unknown as Record<string, string>).webkitBackdropFilter || getComputedStyle(el).backdropFilter)).toContain('blur');
  }
  const pad = await page.locator('main[data-pill]').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(pad).toBeGreaterThanOrEqual(64);
  // During the rest the pill rides above the rest bar.
  if (await rest.count()) {
    const p = (await page.getByTestId('start-next').boundingBox())!;
    const r = (await rest.boundingBox())!;
    expect(p.y + p.height).toBeLessThanOrEqual(r.y + 1);
  }
  expect(errors).toEqual([]);
});

test('the dumbbell hint sits below the wheel pointing up, over no text', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'dumbbell-bench-press': [{ reps: 10, load: { kind: 'dumbbell_each', unit: 'lb', total: 60 } }] });
  await quickWith(page, [['dumbbell bench', 'Dumbbell Bench Press']]);
  await exerciseView(page, 'dumbbell-bench-press').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  const hint = sheet.locator('[data-hint="wheel"]');
  await expect(hint).toHaveText('Spin to pick your dumbbells');
  await expect(hint).toHaveAttribute('data-point', 'up');
  await page.waitForTimeout(500);
  const h = (await hint.boundingBox())!;
  const wheel = (await sheet.getByRole('listbox').boundingBox())!;
  expect(h.y).toBeGreaterThanOrEqual(wheel.y + wheel.height - 1);
  const done = (await sheet.getByRole('button', { name: 'Done' }).boundingBox())!;
  expect(h.y + h.height).toBeLessThanOrEqual(done.y);
  const helper = (await sheet.getByText('You hold one in each hand').boundingBox())!;
  expect(helper.y + helper.height).toBeLessThanOrEqual(wheel.y);
  expect(errors).toEqual([]);
});
