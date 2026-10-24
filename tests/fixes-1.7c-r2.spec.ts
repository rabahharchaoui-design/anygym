import { expect, test } from './fixtures';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, watchErrors } from './workout-helpers';

// PLAN 1.7c round 2 (tester + Codex findings): plan exercises know their load type, "Loaded
// with… Change", legacy drafts, machine edits keep their own start, Smith keeps its own history,
// the stack picker grows with "More".

const picker = (page: import('./fixtures').Page) => page.getByRole('dialog', { name: 'Pick the weight' });

test('a mapped machine never asks how it is loaded; "Loaded with" changes it in one tap', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['lying leg curl', 'Machine Lying Leg Curl']]);
  const view = exerciseView(page, 'machine-lying-leg-curl');
  await expect(view.getByTestId('weight-cell')).toHaveCount(3);
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
  await view.getByTestId('weight-cell').first().tap();
  await expect(picker(page).getByRole('radiogroup', { name: 'Pin position' })).toBeVisible();
  await picker(page).getByRole('button', { name: 'Close', exact: true }).tap();
  await view.getByRole('button', { name: 'More for Machine Lying Leg Curl' }).tap();
  const menu = page.getByRole('dialog', { name: 'Machine Lying Leg Curl options' });
  await menu.getByRole('button', { name: /Loaded with: Machine with a pin/ }).tap();
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Plates on a machine/ }).tap();
  await view.getByTestId('weight-cell').first().tap();
  await expect(picker(page).getByRole('button', { name: /Set starting weight/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a draft saved by the old set card moves into the first row after the update', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const sessionId = page.url().split('/').slice(-2)[0]!;
  await page.evaluate((sid) => {
    const load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
    localStorage.setItem('anygym-drafts', JSON.stringify({ [sid]: { 'barbell-back-squat': { id: 'legacy-1', load, plates: [45], reps: 11, rev: 4 } } }));
  }, sessionId);
  await page.reload();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('weight-cell').first()).toHaveText('135');
  await expect(view.getByTestId('reps-cell').first()).toHaveText('11');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await dbAll<{ id: string; reps: number }>(page, 'sets'))[0]).toMatchObject({ id: 'legacy-1', reps: 11 });
  const left = await page.evaluate(() => localStorage.getItem('anygym-drafts'));
  expect(left ?? '').not.toContain('"barbell-back-squat":');
  expect(errors).toEqual([]);
});

test('editing an older machine set keeps the starting weight it was logged with', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['angled', 'Angled Machine Leg Press']]);
  const view = exerciseView(page, 'angled-machine-leg-press');
  await view.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: /Set starting weight/ }).tap();
  await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'Plates only' }).tap();
  await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker(page).getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  // The machine's answer changes to a 50 lb start.
  await view.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: /Plates only · Change/ }).tap();
  const start = page.getByRole('dialog', { name: 'Starting weight' });
  for (const d of '50') await start.getByRole('button', { name: d, exact: true }).tap();
  await start.getByRole('button', { name: 'Save starting weight' }).tap();
  await picker(page).getByRole('button', { name: 'Close', exact: true }).tap();
  // The logged set still shows and saves 90 lb.
  await loggedRows(view).first().tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit.getByTestId('plate-total')).toHaveText('90lb');
  await edit.getByRole('button', { name: 'More reps' }).tap();
  await edit.getByRole('button', { name: 'Save' }).tap();
  const saved = await dbAll<{ load: { total: number; barWeight: number } }>(page, 'sets');
  expect(saved[0]!.load).toMatchObject({ total: 90, barWeight: 0 });
  expect(errors).toEqual([]);
});

test('Smith sets keep their own history: the bar is saved on every barbell set', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  await view.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker(page).getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const sets = await dbAll<{ load: { barId?: string } }>(page, 'sets');
  expect(sets[0]!.load.barId).toBe('olympic');
  expect(errors).toEqual([]);
});

test('stack picker: "More" adds 10 pins past 300 lb and a heavy pin logs', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['lying leg curl', 'Machine Lying Leg Curl']]);
  const view = exerciseView(page, 'machine-lying-leg-curl');
  await view.getByTestId('weight-cell').first().tap();
  await expect(picker(page).getByRole('radio', { name: 'Pin at 305 lb' })).toHaveCount(0);
  await picker(page).getByRole('button', { name: 'More pins' }).tap();
  await picker(page).getByRole('radio', { name: 'Pin at 350 lb' }).tap();
  await picker(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('350');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  expect((await dbAll<{ load: { total: number; stackValue: number } }>(page, 'sets'))[0]!.load).toMatchObject({ total: 350, stackValue: 350 });
  await page.reload();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('350');
  expect(errors).toEqual([]);
});


