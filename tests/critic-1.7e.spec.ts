import { expect, test, type Page } from './fixtures';
import { bar185, dbAll, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7e, ux-critic round (reports/critic/session-1): the fixes that lift every screen to 8+.

const seedSquat = (page: Page) => seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
type PlanState = { nextDayIndex: number; doneDays: number[]; weekIndex: number };

async function startSquat(page: Page) {
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
}

test('Finish → Today: "Workout saved · Undo" reopens the workout and puts the plan back exactly', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  const before = (await dbAll<PlanState>(page, 'planState'))[0]!;
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  // Not every exercise was done: the finish screen says so, and lists the best set.
  await expect(page.getByTestId('finish-title')).toHaveText(/^Workout saved · \d+ sets?$/);
  await expect(page.getByTestId('finish-progress')).toHaveText(/^0 of \d+ exercises finished( · \d+ started)?$/);
  // PLAN 2.0a: no radios; below 60% the day stays up next, said in one quiet line.
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByTestId('finish-next')).toHaveText('Next up: Day 1 · Legs (hamstring focus)');
  await expect(page.getByTestId('finish-exercise')).toHaveText([/^Barbell Back Squat1 of 4 sets\d+ × \d+ lb$/]);
  await expect(page.getByTestId('finish-duration')).toHaveText('<1 min');
  await page.getByRole('button', { name: 'Done' }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved · 1 set' });
  await expect(toast).toBeVisible();
  // Kept (the default): the day stays up next, with its partial ring.
  const after = (await dbAll<PlanState & { partial?: Record<string, number> }>(page, 'planState'))[0]!;
  expect(after.nextDayIndex).toBe(before.nextDayIndex);
  expect(after.partial?.[before.nextDayIndex]).toBeGreaterThan(0);
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page).toHaveURL(/#\/workout\/[^/]+$/);
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  const restored = (await dbAll<PlanState>(page, 'planState'))[0]!;
  expect({ n: restored.nextDayIndex, d: restored.doneDays, w: restored.weekIndex }).toEqual({ n: before.nextDayIndex, d: before.doneDays, w: before.weekIndex });
  const sessions = await dbAll<{ endedAt?: number; imported: boolean }>(page, 'sessions');
  expect(sessions.filter((s) => s.endedAt === undefined && !s.imported)).toHaveLength(1);
  // The set is still there.
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the Undo toast stays 5 s, then goes', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved'); // a quick workout: no day to keep
  await page.getByRole('button', { name: 'Done' }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Workout saved' });
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
  await page.waitForTimeout(3600);
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(toast).toHaveCount(0, { timeout: 3000 });
  expect(errors).toEqual([]);
});

test('minimize the workout: back to the tabs, a resume bar on every tab, one tap back to the list', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  const bar = page.getByTestId('resume-bar');
  // Today has its own in progress card; the bar shows on the other tabs.
  await expect(bar).toHaveCount(0);
  await page.getByRole('link', { name: 'History' }).tap();
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/Day 1 · \d+:\d\d/);
  await expect(bar).toContainText('Resume');
  for (const tab of ['History', 'Plans', 'Run']) {
    await page.getByRole('link', { name: tab }).tap();
    await expect(bar).toBeVisible();
    // It floats above the tab bar, never on it.
    const r = await bar.boundingBox();
    const nav = await page.getByRole('navigation', { name: 'Main' }).locator('div').first().boundingBox();
    expect(r!.y + r!.height).toBeLessThanOrEqual(nav!.y + 1);
    expect(r!.height).toBeGreaterThanOrEqual(48);
  }
  await bar.tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  // Finished: no bar.
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByText(/Nothing logged/)).toBeVisible();
  await expect(page.getByTestId('resume-bar')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('pushed screens hide the tab bar; the plan viewer docks its one action at the bottom', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  const nav = page.getByRole('navigation', { name: 'Main', includeHidden: true });
  await expect(nav).not.toHaveAttribute('data-hidden', /.*/);
  await page.getByTestId('plan-five-day-split').tap();
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await expect(nav).toHaveAttribute('data-hidden', 'true');
  await expect(page.getByRole('link', { name: 'Today' })).toHaveCount(0); // hidden from taps and readers
  const dock = page.getByTestId('action-bar');
  const box = (await dock.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(await page.evaluate(() => innerHeight));
  await page.getByRole('link', { name: 'Back to Plans' }).tap();
  await expect(nav).not.toHaveAttribute('data-hidden', /.*/);
  expect(errors).toEqual([]);
});

test('Settings at 40 px scroll: the large title is gone (nothing under the bar), the compact title shows; at the top the reverse', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/settings');
  await expect(page.getByTestId('app-version')).toBeVisible();
  const scroller = page.locator('[data-scroller]');
  const read = () =>
    page.evaluate(() => {
      const bar = document.querySelector('header')!;
      const big = document.querySelector('h1')!;
      const b = bar.getBoundingClientRect();
      const t = big.getBoundingClientRect();
      return {
        title: parseFloat(getComputedStyle(big).opacity),
        underBar: t.top < b.bottom,
        aboveBar: t.bottom <= b.bottom,
        compact: parseFloat(getComputedStyle(bar.querySelector('[class*="compact"]')!).opacity),
      };
    });
  await expect.poll(async () => (await read()).compact).toBeLessThan(0.05);
  expect((await read()).title).toBe(1);
  await scroller.evaluate((el) => el.scrollTo({ top: 40 }));
  // No part of the large title visible under the bar: faded out completely (or entirely above it).
  await expect.poll(async () => { const m = await read(); return m.title === 0 || m.aboveBar; }).toBe(true);
  await expect.poll(async () => (await read()).compact).toBeGreaterThan(0.95);
  await scroller.evaluate((el) => el.scrollTo({ top: 15 }));
  await expect.poll(async () => (await read()).title).toBeGreaterThan(0.3);
  await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
  await expect.poll(async () => (await read()).compact).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('Smith first use: the bar question sits on top of the weight sheet; a chip answers it, then plates add up', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['smith', 'Smith Machine Upright Row']]);
  const view = page.getByTestId('exercise-smith-machine-upright-row');
  await expect(view.getByTestId('weight-cell').first()).toHaveText('Pick');
  await expect(view.getByTestId('check-current')).toBeDisabled();
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  const q = sheet.getByTestId('bar-question');
  await expect(q).toBeVisible();
  await expect(q.getByRole('heading', { name: 'What does this bar weigh?' })).toBeVisible();
  for (const w of [15, 20, 25, 35, 45]) await expect(q.getByRole('button', { name: `Bar weighs ${w} lb` })).toBeVisible();
  await expect(q.getByRole('button', { name: 'Count plates only' })).toBeVisible();
  await expect(q.getByRole('button', { name: 'Other…' })).toBeVisible();
  await expect(q.getByRole('button', { name: 'What is Smith machine?' })).toBeVisible();
  // On top: above the number and the bar.
  const qBox = (await q.boundingBox())!;
  const totalBox = (await sheet.getByTestId('plate-total').boundingBox())!;
  expect(qBox.y).toBeLessThan(totalBox.y);
  await expect(sheet.getByTestId('plate-total')).toHaveText('—lb');
  await expect(sheet.getByRole('button', { name: 'Set the bar weight first' })).toBeDisabled();
  // Until the bar is answered: no "tap plates" hint, and the plate buttons are in view, not under Done.
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await expect(sheet.locator('[data-hint="plates"]')).toHaveCount(0);
  for (const name of ['Add 45 lb plate to each side', 'Add 2.5 lb plate to each side']) {
    const plate = sheet.getByRole('button', { name });
    // Short phones (SE, the 320 floor): the sheet's body scrolls, so the plates are one scroll away.
    if (page.viewportSize()!.height < 700) await plate.scrollIntoViewIfNeeded();
    const free = await plate.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && (hit === el || el.contains(hit)); });
    expect(free, name).toBe(true);
  }
  await q.getByRole('button', { name: 'Bar weighs 25 lb' }).tap();
  await expect(q).toHaveCount(0);
  await expect(sheet.getByTestId('plate-total')).toHaveText('25lb');
  await sheet.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await expect(sheet.getByTestId('plate-total')).toHaveText('45lb');
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(view.getByTestId('check-current')).toHaveAccessibleName(/45 lb$/);
  const gym = (await dbAll<{ bars: Record<string, number | null> }>(page, 'gyms'))[0]!;
  expect(gym.bars.smith).toBe(25);
  expect(errors).toEqual([]);
});

test('weight sheet: every plate in one row, nothing behind Done', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  await page.getByTestId('exercise-barbell-back-squat').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(500);
  const plates = sheet.getByRole('group', { name: 'Plates' }).getByRole('button');
  const tops = await plates.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  for (const w of await plates.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))) expect(w).toBeGreaterThanOrEqual(48);
  // Scrolled to the end, the last controls sit above Done.
  await sheet.evaluate((el) => el.querySelector('[class*="scrollBody"]')?.scrollTo({ top: 9999 }));
  const done = (await sheet.getByRole('button', { name: 'Done', exact: true }).boundingBox())!;
  const clear = (await sheet.getByRole('button', { name: 'Clear' }).boundingBox())!;
  expect(clear.y + clear.height).toBeLessThanOrEqual(done.y + 1);
  expect(errors).toEqual([]);
});

test('timed hold: the Hold cell is the timer; it counts down and checks itself at 0', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-static-quadricep-stretch').tap();
  const view = page.getByTestId('exercise-static-quadricep-stretch');
  const cell = view.getByRole('button', { name: 'Start timer' });
  // Before the start: a tap to start, and the 45 s the ✓ would log.
  await expect(cell).toHaveText('45 sTap to start');
  await expect(view.getByTestId('check-current')).toHaveAccessibleName('Log set 1: 45 s');
  // No separate timer card or second lime button.
  await expect(view.getByRole('button', { name: /Start again|Reset/ })).toHaveCount(0);
  await expect(view.getByTestId('timer-clock')).toHaveCount(1);
  await page.clock.install();
  await cell.tap();
  await page.clock.runFor(3200);
  // Running: the time so far against the target.
  // Running: the seconds so far big, "of 45 s" under them; never cut off.
  await expect(view.getByRole('button', { name: 'Stop timer' })).toHaveText('3 sof 45 s');
  const clipped = await view.getByTestId('hold-cell').evaluate((cell) => [cell, ...Array.from(cell.querySelectorAll<HTMLElement>('span'))].some((e) => e.scrollWidth > e.clientWidth + 1));
  expect(clipped).toBe(false);
  // Stopped: exactly the seconds the ✓ logs, the target under it.
  await view.getByRole('button', { name: 'Stop timer' }).tap();
  await expect(view.getByRole('button', { name: 'Start timer' })).toHaveText('3 starget 45 s');
  await expect(view.getByTestId('check-current')).toHaveAccessibleName('Log set 1: 3 s');
  await page.clock.runFor(600); // a real pause between taps (the double tap guard is 350 ms)
  await view.getByRole('button', { name: 'Start timer' }).tap();
  await page.clock.runFor(43000);
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  const sets = await dbAll<{ seconds?: number; exerciseId: string }>(page, 'sets');
  expect(sets.find((x) => x.exerciseId === 'static-quadricep-stretch')!.seconds).toBe(45);
  expect(errors).toEqual([]);
});

test('sheet drag: a short pull springs back, past a third of the height it closes', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Change day' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  const box = (await sheet.boundingBox())!;
  // A slow pull: small steps with real time between them, then a rest before letting go (no flick).
  const drag = async (dy: number, steps: number) => {
    const x = box.x + box.width / 2;
    const y = box.y + 6; // on the grabber, the drag handle
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, y + (dy * i) / steps);
      await page.waitForTimeout(25);
    }
    await page.mouse.move(x, y + dy);
    await page.waitForTimeout(200);
    await page.mouse.move(x, y + dy);
    await page.mouse.up();
  };
  await drag(box.height * 0.2, 12);
  await page.waitForTimeout(700);
  await expect(sheet).toBeVisible();
  expect(Math.abs((await sheet.boundingBox())!.y - box.y)).toBeLessThan(2);
  await drag(box.height * 0.5, 12);
  await expect(sheet).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('⋯ menu has no dead rows; the picker keeps its height while typing and leaves warm ups out of Recent', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  await page.getByTestId('exercise-barbell-back-squat').getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  const menu = page.getByRole('dialog', { name: 'Barbell Back Squat options' });
  await expect(menu.getByRole('button', { name: /Rest time/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Replace|Make a pair/ })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: /Coming/ })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const picker = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(picker).toHaveAttribute('data-state', 'open');
  const h1 = (await picker.boundingBox())!.height;
  await picker.getByRole('searchbox', { name: 'Search exercises' }).fill('zzzz');
  await expect(picker.getByText(/Nothing matches/)).toBeVisible();
  const h2 = (await picker.boundingBox())!.height;
  expect(Math.abs(h2 - h1)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('first time with weights: "Pick" cells and one first time line above the table', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('weight-cell')).toHaveText(['Pick', '–', '–']);
  const note = view.getByTestId('set-guide');
  await expect(note).toHaveText('First time: pick a weight you could lift 2 more reps with');
  await expect(note).toHaveCount(1);
  // Gate 2: above the table (a coach mark may float over the header, never over this line).
  const row = (await view.getByTestId('set-todo').first().boundingBox())!;
  const n = (await note.boundingBox())!;
  expect(n.y + n.height).toBeLessThanOrEqual(row.y);
  expect(row.y - (n.y + n.height)).toBeLessThan(60);
  expect(errors).toEqual([]);
});

test('finish with exercises left: Move on to Day 2, Day 1 keeps a partial pip, no tick; Today shows one in progress card', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  // While it runs, Today has one card: the day, in progress, with Resume; no resume bar there.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByRole('button', { name: 'Minimize workout' }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText('Day 1 · Legs (hamstring focus)');
  await expect(page.getByTestId('day-card-progress')).toHaveText('In progress · 1 set');
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(1);
  // The day cannot change while it runs: no Change day, and the pips are not buttons.
  await expect(page.getByRole('button', { name: 'Change day' })).toHaveCount(0);
  await expect(page.getByTestId('week-day-2').getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('resume-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Quick workout/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume' }).tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText(/^Workout saved · \d+ sets?$/);
  await expect(page.getByTestId('finish-progress')).toHaveText(/^0 of \d+ exercises finished( · \d+ started)?$/);
  // PLAN 2.0a: 1 set keeps Day 1; Change picks Day 2 instead.
  await page.getByTestId('finish-change').tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /^Day 2 · / }).tap();
  await expect(page.getByTestId('finish-next')).toHaveText(/^Next up: Day 2 · /);
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 2 · /);
  await expect(page.getByTestId('week-day-1')).toHaveAttribute('data-state', 'partial');
  await expect(page.getByTestId('week-day-1').getByRole('button')).toHaveAccessibleName(/part done\. Pick this day$/);
  await expect(page.getByTestId('week-day-2')).toHaveAttribute('data-state', 'next');
  // Pips are progress marks, not buttons: no outline, small.
  const pip = await page.getByTestId('week-day-3').evaluate((li) => { const p = li.querySelector<HTMLElement>('[class*="pip_"]')!; const s = getComputedStyle(p); return { w: p.getBoundingClientRect().width, border: s.borderTopWidth }; });
  expect(pip.w).toBeLessThanOrEqual(16);
  expect(pip.border).toBe('0px');
  expect(errors).toEqual([]);
});

test('Settings: Units switch the gym between lb and kg; the gym name is a plain label on Today', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/settings');
  const lb = page.getByRole('radio', { name: 'lb' });
  const kg = page.getByRole('radio', { name: 'kg' });
  await expect(lb).toBeChecked();
  await kg.tap();
  await expect(kg).toBeChecked();
  await expect.poll(async () => (await dbAll<{ unit: string; bars: { olympic: number } }>(page, 'gyms'))[0]!.unit).toBe('kg');
  expect((await dbAll<{ bars: { olympic: number } }>(page, 'gyms'))[0]!.bars.olympic).toBe(20);
  await lb.tap();
  await expect.poll(async () => (await dbAll<{ unit: string }>(page, 'gyms'))[0]!.unit).toBe('lb');
  await page.goto('./');
  const pill = page.getByText('My Gym', { exact: true });
  await expect(pill).toBeVisible();
  const look = await pill.evaluate((el) => { const p = el.parentElement!; const s = getComputedStyle(p); return { bg: s.backgroundColor, tag: p.tagName }; });
  expect(look.tag).not.toBe('BUTTON');
  expect(look.bg).toBe('rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});

test('weight sheet: "Change bar" sits on the math line above the drawing, visible and not covered', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  await page.getByTestId('exercise-barbell-back-squat').getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  const bar = sheet.getByRole('button', { name: 'Change bar, Olympic 45 lb' });
  await expect(bar).toHaveText('Change bar');
  await expect(bar).toBeInViewport();
  const covered = await bar.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(hit === el || el.contains(hit)); });
  expect(covered).toBe(false);
  const svg = (await sheet.locator('svg').first().boundingBox())!;
  expect((await bar.boundingBox())!.y).toBeLessThan(svg.y);
  await bar.tap();
  await expect(page.getByRole('dialog', { name: 'Which bar?' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('weight sheet: a swipe down with changed plates keeps them, like Done', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  const box = (await sheet.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + 6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x, box.y + 6 + (box.height * 0.6 * i) / 12);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  expect(errors).toEqual([]);
});

test('"Nice. Next" is a button straight into the next exercise', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat'], ['leg press', 'Leg Press']]);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done', exact: true }).tap();
  for (let i = 0; i < 3; i++) {
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  const chip = page.getByTestId('next-chip').getByRole('button', { name: /Nice\. Next: Leg Press/ });
  await expect(chip).toBeVisible();
  await chip.tap();
  await expect(page.getByTestId('exercise-leg-press')).toBeVisible();
  expect(errors).toEqual([]);
});

test('week pips open Change day with that day picked (no workout running)', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  const pip = page.getByTestId('week-day-3').getByRole('button', { name: /Day 3 · .+\. Pick this day$/ });
  const box = (await pip.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  await pip.tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-picked]')).toContainText('Day 3 ·');
  await sheet.locator('[data-picked]').tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 3 · /);
  // Labels share one baseline whatever the mark.
  const tops = await page.locator('[data-testid^="week-day-"] [class*="pipLabel"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(errors).toEqual([]);
});

for (const smith of [false, true]) {
  test(`weight sheet${smith ? ' (Smith first use)' : ''}: Type it and Clear are in view, never under the Done bar`, async ({ page }) => {
    const errors = watchErrors(page);
    await quickWith(page, [smith ? ['smith', 'Smith Machine Upright Row'] : ['back squat', 'Barbell Back Squat']]);
    await page.locator('[data-testid^="exercise-"]').getByTestId('weight-cell').first().tap();
    const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(sheet).toHaveAttribute('data-state', 'open');
    await sheet.getByRole('button', { name: /Add 45 lb plate/ }).tap();
    for (const name of smith ? ['Clear'] : ['Type it', 'Clear']) {
      const link = sheet.getByRole('button', { name, exact: true });
      const ok = await link.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && (hit === el || el.contains(hit)); });
      expect(ok, name).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('finish rows: an exercise with sets left reads "1 of 4 sets" and does not count as done', async ({ page }) => {
  const errors = watchErrors(page);
  await startSquat(page);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-title')).toHaveText(/^Workout saved · \d+ sets?$/);
  await expect(page.getByTestId('finish-progress')).toHaveText(/^0 of \d+ exercises finished( · \d+ started)?$/);
  await expect(page.getByTestId('finish-sets-left')).toHaveText('1 of 4 sets');
  // PLAN 2.0a: no radio choices; Change is small text with a 48 pt hit area.
  await expect(page.getByRole('radio')).toHaveCount(0);
  const change = page.getByTestId('finish-change');
  await expect.poll(async () => { const b = (await change.boundingBox())!; return Math.min(b.width, b.height); }).toBeGreaterThanOrEqual(48);
  expect(errors).toEqual([]);
});
