import { expect, test, type Locator, type Page } from './fixtures';
import { dbAll } from './workout-helpers';
import { addIdbSeams, delayReadsAfterNextWrite } from './helpers/idb';

// PLAN 1.12: the once seen flake where a double tap on ✓ under full suite load logged 2 sets.
// The ✓ guard is race proof now (logQueue.claim: one submission per row, never time based). This
// proves it with 20 double taps per profile, 5 for each gap (0, 40, 120, 300 ms), in two styles:
//   - "same node": both clicks go to the very same ✓ element from inside the page, the second one
//     after `gap` ms. That element is reused by React for a stale render of the row (the write
//     landed and the drafts moved up before the live query delivered the set): the exact window
//     of the flake.
//   - "same spot": two real touch taps on the same screen point, like a thumb.
// Every double tap must add exactly one set. No retries: a flake here is a failure.
// The last test widens the flake's window on purpose (helpers/idb.ts holds the live query's
// re-read for 900 ms after the write) and taps again 500 ms later, past any time based guard:
// only a guard that is not time based keeps it at one set.

test.describe.configure({ retries: 0 });

const GAPS = [0, 40, 120, 300] as const;
const ROUNDS = 5;

async function quickSquat(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker.getByRole('button', { name: 'Done' }).tap();
  await expect(picker).toHaveCount(0);
  return view;
}

const setCount = async (page: Page) => (await dbAll(page, 'sets')).length;

/** Two clicks on the same ✓ element from inside the page, `gap` ms apart (0 = the same task). */
async function sameNode(check: Locator, gap: number) {
  await check.evaluate(
    (el, gap) =>
      new Promise<void>((resolve) => {
        (el as HTMLButtonElement).click();
        if (gap === 0) {
          (el as HTMLButtonElement).click();
          resolve();
        } else
          setTimeout(() => {
            (el as HTMLButtonElement).click();
            resolve();
          }, gap);
      }),
    gap,
  );
}

/** Two touch taps on the same point of the screen, `gap` ms apart. */
async function sameSpot(page: Page, check: Locator, gap: number) {
  const box = (await check.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  if (gap) await page.waitForTimeout(gap);
  await page.touchscreen.tap(x, y);
}

for (const gap of GAPS) {
  test(`double tap ✓ with a ${gap} ms gap, ${ROUNDS} times: exactly one set each @matrix`, async ({ page, context }) => {
    test.setTimeout(90_000);
    const view = await quickSquat(page);
    if (gap === 0) {
      // The flake's own setting: offline, after a reload in the middle of the workout.
      await context.setOffline(true);
      await page.reload();
      await expect(view).toBeVisible();
    }
    for (let i = 0; i < ROUNDS; i++) {
      const check = view.getByTestId('check-current');
      if (!(await check.count())) {
        await view.getByRole('button', { name: '+ Add set' }).tap();
      }
      await expect(check).toBeEnabled();
      const before = await setCount(page);
      if (i % 2 === 0) await sameNode(check, gap);
      else await sameSpot(page, check, gap);
      await expect(view.getByTestId('set-row')).toHaveCount(before + 1);
      // Long enough for a stray second write to land and show.
      await page.waitForTimeout(350);
      expect(await setCount(page)).toBe(before + 1);
      await expect(view.getByTestId('set-row')).toHaveCount(before + 1);
    }
    const sets = await dbAll<{ id: string; order: number; load: { total: number } }>(page, 'sets');
    expect(sets).toHaveLength(ROUNDS);
    expect(new Set(sets.map((s) => s.id)).size).toBe(ROUNDS);
    expect(sets.every((s) => s.load.total === 135)).toBe(true);
    expect(new Set(sets.map((s) => s.order)).size).toBe(ROUNDS);
    await context.setOffline(false);
  });
}

test(`a second ✓ in the stale window after the write landed (900 ms), 500 ms later, ${ROUNDS} times: one set each @matrix`, async ({ page }) => {
  test.setTimeout(90_000);
  await addIdbSeams(page);
  const view = await quickSquat(page);
  for (let i = 0; i < ROUNDS; i++) {
    const check = view.getByTestId('check-current');
    if (!(await check.count())) await view.getByRole('button', { name: '+ Add set' }).tap();
    await expect(check).toBeEnabled();
    const before = await setCount(page);
    await delayReadsAfterNextWrite(page, 900);
    await sameNode(check, 500);
    await expect(view.getByTestId('set-row')).toHaveCount(before + 1);
    await page.waitForTimeout(400);
    expect(await setCount(page)).toBe(before + 1);
    await expect(view.getByTestId('set-row')).toHaveCount(before + 1);
  }
  expect(await setCount(page)).toBe(ROUNDS);
});
