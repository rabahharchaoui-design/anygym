import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, exerciseView, loggedRows, navIdle, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.2d (G, Nov 1 3:59 PM): the pair tests of the workout polish, split out of polish-2.2d.spec.ts.

const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const box = async (l: Locator) => (await l.boundingBox())!;

/** ⋯ menu open: Rest after each set → On or Off → Save (the menu closes). */
async function restOnOff(page: Page, restRow: Locator, to: 'On' | 'Off') {
  await restRow.tap();
  const sheet = page.getByRole('dialog', { name: 'Rest after each set' });
  await sheet.getByRole('radio', { name: to }).tap();
  // The line says what the choice does (round 3, P2).
  await expect(sheet.getByTestId('rest-sub')).toHaveText(to === 'Off' ? 'Off: no countdown, for back to back moves' : 'Countdown after each set');
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(sheet).toHaveCount(0);
  // Saved, and it says so (round 3, P7).
  await expect(page.getByRole('status').filter({ hasText: to === 'Off' ? 'Rest off' : /^Rest \d+ s/ })).toBeVisible();
}
test('rest timer Off on one move of a pair: no countdown after it, the partner still rests @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 · Chest and triceps/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-incline-bench-press').tap();
  const first = exerciseView(page, 'barbell-incline-bench-press');
  await expect(first).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  // ⋯ → Rest after each set → Off (one row whose height never changes, critic B4).
  await first.getByRole('button', { name: 'More for Barbell Incline Bench Press' }).tap();
  const menu = page.getByRole('dialog', { name: 'Barbell Incline Bench Press options' });
  const restRow = menu.getByTestId('rest-row');
  await expect(restRow).toContainText('90 s');
  const rowH = (await box(restRow)).height;
  await restOnOff(page, restRow, 'Off');
  await first.getByRole('button', { name: 'More for Barbell Incline Bench Press' }).tap();
  await expect(restRow).toContainText('Off: no countdown');
  expect(Math.abs((await box(restRow)).height - rowH)).toBeLessThan(0.5);
  await expect.poll(async () => (await dbAll<{ exerciseId: string; restOff?: boolean }>(page, 'exerciseSettings')).find((s) => s.exerciseId === 'barbell-incline-bench-press')?.restOff).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await first.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(first).tap();
  await expect(loggedRows(first)).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  // 3.5g: pairs go back to back, rest after the round. The Next in the pair bar (no chip) opens the partner.
  await page.getByTestId('group-next').tap();
  const partner = exerciseView(page, 'incline-plate-press');
  await expect(partner).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  // The partner's ⋯ still has its own 90 s rest.
  await partner.getByRole('button', { name: 'More for Incline Plate Press' }).tap();
  const partnerMenu = page.getByRole('dialog', { name: 'Incline Plate Press options' });
  await expect(partnerMenu.getByTestId('rest-row')).toContainText('90 s');
  await page.keyboard.press('Escape');
  await expect(partnerMenu).toHaveCount(0);

  // Back on the first move: turned on again. 3.5g: its next set is still mid-round, so no rest yet
  // and the Next in the pair bar stays; the rest comes after the round.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-barbell-incline-bench-press').tap();
  await expect(first).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  await first.getByRole('button', { name: 'More for Barbell Incline Bench Press' }).tap();
  await restOnOff(page, restRow, 'On');
  await first.getByRole('button', { name: /^Log set 2/ }).tap();
  await expect(loggedRows(first)).toHaveCount(2);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  await expect(page.getByTestId('group-next')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a pair says so before any check (round 2, P9) @matrix', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 · Chest and triceps/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-incline-bench-press').tap();
  const first = exerciseView(page, 'barbell-incline-bench-press');
  await expect(first.getByTestId('pair-line')).toHaveText('Pair · 1 of 2');
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-incline-plate-press').tap();
  await expect(exerciseView(page, 'incline-plate-press').getByTestId('pair-line')).toHaveText('Pair · 2 of 2');
});
