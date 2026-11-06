// PLAN 3.6 (SPEC 7.4, 20.1, 22): the time budget sheet on the day list. Open it from the estimate,
// pick 30, the estimate drops live with the change list, Apply for this workout only, the title's
// estimate updates, logged sets stay, Undo restores, reload keeps the trim, the once a day offer
// when the intake's minutes are under the day, SE and 320 fit, 130% text, no console errors.
// Progress: round 2 (bring back order, Today entry before Start, Apply double tap guard) done.
import { expect, test, type Page } from './fixtures';
import { checkControls, checkLayout, fullyShown, simulateSafeAreas } from './helpers/layout';
import { bar185, dbAll, dbPut, shotOn, usePlan, watchErrors } from './workout-helpers';

type Sess = { id: string; gymId: string; exerciseIds: string[]; trim?: { drop: string[]; sets: Record<string, number>; mobility?: string[] }; timeBudgetMin?: number; endedAt?: number };

const start = async (page: Page) => {
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
};

const session = async (page: Page) => (await dbAll<Sess>(page, 'sessions')).find((s) => s.endedAt === undefined)!;
const minutesOf = async (page: Page) => Number(/~(\d+) min/.exec((await page.getByTestId('time-estimate').textContent()) ?? '')?.[1]);
const sheetOf = (page: Page) => page.getByRole('dialog', { name: 'How much time today?' });
const chip = (page: Page, label: string) => sheetOf(page).getByRole('radio', { name: label, exact: true });

/** One squat set logged on the live workout (straight into storage), then the app reloads. */
async function logSquat(page: Page) {
  const s = await session(page);
  await dbPut(page, {
    sets: [{ id: 'seed-squat-1', sessionId: s.id, exerciseId: 'barbell-back-squat', order: 0, kind: 'work', uncertain: false, reps: 10, load: bar185 }],
    orderCounters: [{ sessionId: s.id, next: 1 }],
  });
  await page.reload();
  await expect(page.getByTestId('workout-title')).toBeVisible();
}

/** Text at 130% (SPEC 13.4): every computed size × 1.3, once per element. */
const text130 = (page: Page, scope: string) =>
  page.evaluate((root) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`${root}, ${root} *`));
    const sizes = els.map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  }, scope);

test('pick 30: the estimate drops live, Apply trims this workout only, logged sets stay, Undo restores, reload keeps it @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await logSquat(page);
  const planned = await minutesOf(page);
  expect(planned).toBeGreaterThan(30);
  const before = await session(page);
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveAttribute('aria-label', /1 of 4 done/);

  await page.getByTestId('time-estimate').tap();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  // Nothing picked yet (no intake answer, no earlier pick): Apply says why it is grey.
  await expect(sheet.getByRole('button', { name: 'Apply to this workout' })).toBeDisabled();
  await expect(sheet.getByText('Pick how long you have')).toBeVisible();
  await expect(sheet.getByTestId('time-fit')).toContainText(`~${planned} min`);

  await chip(page, '30').tap();
  await expect(sheet.getByTestId('time-fit')).toContainText('Fits in');
  const fit = Number(/~(\d+) min/.exec((await sheet.getByTestId('time-fit').textContent()) ?? '')?.[1]);
  expect(fit).toBeLessThanOrEqual(30);
  await expect(sheet.getByTestId('time-changes')).toContainText('Cut: ');
  await expect(sheet.getByTestId('time-changes')).toContainText('Stretches in one quick block');
  // The logged squat is never cut.
  await expect(sheet.getByTestId('time-changes')).not.toContainText('Barbell Back Squat');
  await shotOn(page, '3.6', 'sheet-30');

  // Live: another chip, another number.
  await chip(page, '45').tap();
  await expect(sheet.getByTestId('time-fit')).not.toContainText(`~${fit} min`);
  await chip(page, '30').tap();
  await expect(sheet.getByTestId('time-fit')).toContainText(`~${fit} min`);

  await sheet.getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${fit} min`);
  await expect(page.getByTestId('time-line')).toContainText('Shortened to fit 30 min today');
  const trimmed = await session(page);
  expect(trimmed.trim?.drop.length).toBeGreaterThan(0);
  expect(trimmed.timeBudgetMin).toBe(30);
  for (const id of trimmed.trim!.drop) await expect(page.getByTestId(`row-${id}`)).toHaveCount(0);
  await expect(page.getByTestId('mobility-group')).toContainText('Stretches: back to back');
  // Logged sets untouched.
  expect((await dbAll(page, 'sets')).length).toBe(1);
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveAttribute('aria-label', /1 of 4 done/);
  // The saved plan is untouched: nothing but the session (and the gym's last pick) changed.
  expect((await dbAll<{ timeBudgetMin?: number }>(page, 'gyms')).find((g) => g.timeBudgetMin !== undefined)?.timeBudgetMin).toBe(30);
  await shotOn(page, '3.6', 'list-trimmed');

  // Undo: the full day is back, in its order.
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${planned} min`);
  await expect.poll(async () => (await session(page)).exerciseIds).toEqual(before.exerciseIds);
  expect((await session(page)).trim).toBeUndefined();
  expect((await dbAll(page, 'sets')).length).toBe(1);
  await expect(page.getByTestId('time-line')).toHaveCount(0);

  // Again, then reload: the trim stays, and the sheet opens on 30 with nothing new to apply.
  await page.getByTestId('time-estimate').tap();
  await chip(page, '30').tap();
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${fit} min`);
  await page.reload();
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${fit} min`);
  await expect(page.getByTestId('time-line')).toContainText('Shortened to fit 30 min today');
  await page.getByTestId('time-line').getByRole('button', { name: 'Change' }).tap();
  await expect(chip(page, '30')).toHaveAttribute('aria-checked', 'true');
  await expect(sheetOf(page).getByRole('button', { name: 'Apply to this workout' })).toBeDisabled();
  await expect(sheetOf(page).getByText('This workout is already set to this')).toBeVisible();

  // 75+: back to the day as planned.
  await chip(page, '75+').tap();
  await expect(sheetOf(page).getByTestId('time-changes')).toContainText('The whole day, as planned.');
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${planned} min`);
  await expect.poll(async () => (await session(page)).exerciseIds).toEqual(before.exerciseIds);
  expect((await dbAll(page, 'sets')).length).toBe(1);
  expect(errors).toEqual([]);
});

test('intake minutes under the day: one quiet offer a day, never a trim on its own', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  const profiles = await dbAll<{ id: string; createdAt: number }>(page, 'profile');
  const profile = profiles[0] ?? { id: 'me', defaultUnit: 'lb', createdAt: Date.now() };
  await dbPut(page, { profile: [{ ...profile, intake: { minutes: 30 } }] });
  await page.reload();
  await start(page);
  const planned = await minutesOf(page);
  const line = page.getByTestId('time-line');
  await expect(line).toContainText('Longer than your 30 min');
  // Never trimmed on its own.
  expect((await session(page)).trim).toBeUndefined();
  await shotOn(page, '3.6', 'offer');

  await line.getByRole('button', { name: 'Make it fit' }).tap();
  // The intake's 30 is picked already.
  await expect(chip(page, '30')).toHaveAttribute('aria-checked', 'true');
  await expect(sheetOf(page).getByTestId('time-changes')).toContainText('Cut: ');
  await page.keyboard.press('Escape');
  await expect(sheetOf(page)).toHaveCount(0);
  // Closing changes nothing; the offer is answered for today.
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${planned} min`);
  expect((await session(page)).trim).toBeUndefined();
  await expect(line).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await expect(page.getByTestId('time-line')).toHaveCount(0);

  // Tomorrow (the stored day is not today), and Not today closes it.
  await page.evaluate(() => localStorage.setItem('anygym-time-offer', '2000-01-01'));
  await page.reload();
  await expect(page.getByTestId('time-line')).toContainText('Longer than your 30 min');
  await page.getByRole('button', { name: 'Not today' }).tap();
  await expect(page.getByTestId('time-line')).toHaveCount(0);
  expect((await session(page)).trim).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the sheet and the trimmed list fit SE and the 320 floor, at normal and 130% text @matrix', async ({ page }) => {
  // Four rounds, each waiting out a 5 s Undo toast before the list is measured.
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await simulateSafeAreas(page);
  await usePlan(page);
  await start(page);
  const sizes = [page.viewportSize()!, { width: 320, height: 568 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const big of [false, true]) {
      await page.reload();
      await expect(page.getByTestId('workout-title')).toBeVisible();
      if (big) await text130(page, 'main');
      await page.getByTestId('time-estimate').tap();
      const sheet = sheetOf(page);
      await expect(sheet).toBeVisible();
      await chip(page, '20').tap();
      await expect(sheet.getByTestId('time-changes')).toContainText('Cut: ');
      if (big) await text130(page, '[role="dialog"]');
      await checkLayout(page, { scope: '[role="dialog"]' });
      await checkControls(page, '[role="dialog"]');
      for (const r of await sheet.getByRole('radio').all()) expect(await fullyShown(r)).toBe(true);
      const apply = sheet.getByRole('button', { name: 'Apply to this workout' });
      await apply.scrollIntoViewIfNeeded();
      expect(await fullyShown(apply)).toBe(true);
      if (!big) await shotOn(page, '3.6', size.width === 320 ? 'sheet-320' : 'sheet-20');
      else await shotOn(page, '3.6', size.width === 320 ? 'sheet-320-130' : 'sheet-130');
      await apply.tap();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId('time-line')).toBeVisible();
      // The Undo toast sits over the list for 5 s by design; the list is measured once it goes.
      await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0, { timeout: 8000 });
      await checkLayout(page);
      await checkControls(page, 'main header');
      expect(await fullyShown(page.getByTestId('time-estimate'))).toBe(true);
      expect(await fullyShown(page.getByTestId('time-line').getByRole('button', { name: 'Change' }))).toBe(true);
      if (!big) await shotOn(page, '3.6', size.width === 320 ? 'list-320' : 'list-20');
      // Back to the plan for the next round.
      await page.getByTestId('time-estimate').tap();
      await chip(page, '75+').tap();
      await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
      await expect(page.getByTestId('time-line')).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test('before Start (SPEC 7.4): the day card estimate opens the sheet, the pick trims the workout Start makes @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  const time = page.getByTestId('day-card-time');
  const planned = Number(/~(\d+) min/.exec((await time.textContent()) ?? '')?.[1]);
  await expect(page.getByTestId('day-card-title')).toHaveText(`Day 1 · Legs (hamstring focus) · ~${planned} min`);
  await time.tap();
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await chip(page, '30').tap();
  const fit = Number(/~(\d+) min/.exec((await sheet.getByTestId('time-fit').textContent()) ?? '')?.[1]);
  expect(fit).toBeLessThanOrEqual(30);
  await shotOn(page, '3.6', 'today-sheet');
  await sheet.getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(time).toHaveText(`~${fit} min`);
  await expect(page.getByTestId('day-card-fits')).toHaveText('Shortened to fit 30 min');
  // Nothing exists yet: no workout was made by picking.
  expect((await dbAll<Sess>(page, 'sessions')).filter((s) => s.endedAt === undefined)).toHaveLength(0);
  await shotOn(page, '3.6', 'today-picked');
  // Undo puts the plan's estimate back; pick again.
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(time).toHaveText(`~${planned} min`);
  await expect(page.getByTestId('day-card-fits')).toHaveCount(0);
  await time.tap();
  await expect(chip(page, '30')).toHaveAttribute('aria-checked', 'true'); // the gym's last pick
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).tap();
  await expect(time).toHaveText(`~${fit} min`);

  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await expect(page.getByTestId('time-estimate')).toHaveText(`~${fit} min`);
  await expect(page.getByTestId('time-line')).toContainText('Shortened to fit 30 min today');
  const s = await session(page);
  expect(s.timeBudgetMin).toBe(30);
  expect(s.trim?.drop.length).toBeGreaterThan(0);
  for (const id of s.trim!.drop) expect(s.exerciseIds).not.toContain(id);
  expect(errors).toEqual([]);
});

test('a double tap on Apply applies once and never opens the row under the closing sheet', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('time-estimate').tap();
  await chip(page, '30').tap();
  const apply = sheetOf(page).getByRole('button', { name: 'Apply to this workout' });
  await apply.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
  await expect(sheetOf(page)).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.getByTestId('time-estimate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to the list' })).toHaveCount(0);
  const s = await session(page);
  expect(new Set(s.exerciseIds).size).toBe(s.exerciseIds.length);
  expect(s.timeBudgetMin).toBe(30);
  expect(errors).toEqual([]);
});

test('a real double tap on Apply: the second tap lands nowhere', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await start(page);
  await page.getByTestId('time-estimate').tap();
  await chip(page, '30').tap();
  await sheetOf(page).getByRole('button', { name: 'Apply to this workout' }).dblclick();
  await expect(sheetOf(page)).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: 'Back to the list' })).toHaveCount(0);
  await expect(page.getByTestId('time-estimate')).toBeVisible();
  expect(errors).toEqual([]);
});
