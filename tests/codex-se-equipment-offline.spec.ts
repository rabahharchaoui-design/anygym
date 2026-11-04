import { expect, test, type Locator, type Page } from './fixtures';
import type { Gym, WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// fixtures installs the console/pageerror/unhandled-rejection trap automatically,
// including its exact-resource exception for deliberately offline requests.
async function exposed(control: Locator) {
  // WebKit rounds fractional tray widths: a fully exposed plate can report 0.999401.
  // Allow that subpixel difference; the hit checks below still reject covered controls.
  await expect(control).toBeInViewport({ ratio: 0.999 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]].every(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return hit !== null && (hit === el || el.contains(hit));
    });
  })).toBe(true);
}

async function tableExposed(page: Page, view: Locator) {
  await setTableInFirstScreen(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  for (const control of await view.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"]').all()) {
    await exposed(control);
  }
  await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
}

test('SE: women’s bar picker and four-row table stay exposed when changing weight during rest', async ({ page }) => {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByRole('button', { name: '+ Add set', exact: true }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  // The setup tap on Add set auto-scrolls main on SE. Start the first-screen
  // checks at the top, then leave scrolling untouched throughout logging/rest.
  await view.evaluate((el) => el.scrollTo({ top: 0, behavior: 'instant' }));
  await setTableInFirstScreen(page);
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
  await picker.getByRole('button', { name: 'Add 10 lb plate to each side', exact: true }).tap();
  await picker.getByTestId('bar-link').tap();
  const bars = page.getByRole('dialog', { name: 'Which bar?' });
  await bars.getByRole('button', { name: /^Women's bar/ }).tap();
  await expect(bars).toHaveCount(0);
  await expect(picker.getByTestId('plate-total')).toHaveText('55lb');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(view.getByTestId('weight-cell')).toHaveText(['55', '55', '55', '55']);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await tableExposed(page, view);

  await view.getByTestId('weight-cell').first().tap();
  await expect(picker.getByTestId('plate-total')).toHaveText('55lb');
  // Check before taps: Playwright's auto-scroll must not hide a cramped sheet.
  for (const control of [picker.getByTestId('bar-link'),
    ...await picker.getByRole('group', { name: 'Plates', exact: true }).getByRole('button').all(),
    picker.getByRole('button', { name: 'Done', exact: true })]) await exposed(control);
  await picker.getByRole('button', { name: 'Add 5 lb plate to each side', exact: true }).tap();
  await expect(picker.getByTestId('plate-total')).toHaveText('65lb');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await tableExposed(page, view);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  const saved = (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);
  expect(saved.map((s) => s.load)).toMatchObject([
    { kind: 'barbell', unit: 'lb', total: 55, barWeight: 35, barId: 'womens', perSide: [10] },
    { kind: 'barbell', unit: 'lb', total: 65, barWeight: 35, barId: 'womens', perSide: [10, 5] },
  ]);
  await page.reload();
  await expect(loggedRows(view)).toHaveCount(2);
  expect((await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(saved);
});

test('offline SE: kg machine start and both horns survive edit, delete Undo, Finish and reload without gym collars', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<Gym>(page, 'gyms')).find((g) => g.isActive)!;
  // Use Settings' real kg defaults; seed only equipment answers, never computed loads.
  await page.goto('./#/settings');
  await page.getByRole('radio', { name: 'kg', exact: true }).tap();
  await expect.poll(async () => (await dbAll<Gym>(page, 'gyms')).find((g) => g.id === gym.id)?.unit).toBe('kg');
  const kg = (await dbAll<Gym>(page, 'gyms')).find((g) => g.id === gym.id)!;
  await dbPut(page, { gyms: [{ ...kg, collars: 'competition', equipmentWeights: {
    ...kg.equipmentWeights, 'leg-press': { kind: 'starting_resistance', value: 25 },
  } }] });
  await quickWith(page, [['leg press', 'Leg Press']]);
  const view = exerciseView(page, 'leg-press');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await view.getByTestId('weight-cell').first().tap();
    const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
    await picker.getByRole('button', { name: 'Add 20 kg plate to each side', exact: true }).tap();
    await picker.getByRole('button', { name: 'Add 1.25 kg plate to each side', exact: true }).tap();
    await expect(picker.getByTestId('plate-total')).toHaveText('67.5kg'); // 25 + 2 × 21.25; no 5 kg collars.
    await exposed(picker.getByRole('button', { name: 'Done', exact: true }));
    await picker.getByRole('button', { name: 'Done', exact: true }).tap();
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    await tableExposed(page, view);
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set', exact: true });
    await expect(edit.getByTestId('plate-total')).toHaveText('67.5kg');
    await edit.getByRole('button', { name: 'More reps', exact: true }).tap();
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    const edited = await dbAll<WorkoutSet>(page, 'sets');
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ reps: 9, load: { kind: 'plate_machine', unit: 'kg', total: 67.5,
      barWeight: 25, perSide: [20, 1.25], collars: 0 } });
    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    await page.getByRole('status').filter({ hasText: 'Set deleted' }).getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(edited);
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    await expect(page.getByTestId('finish-total')).toHaveText('607.5 kg');
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(edited);
  } finally {
    await context.setOffline(false);
  }
});
