import { expect, test, type Locator, type Page } from './fixtures';

// Uses the configured WebKit iPhone projects. Do not run alongside the port owner's suite.
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const dbAll = <T>(page: Page, store: string): Promise<T[]> => page.evaluate(
  (name) => new Promise<T[]>((resolve, reject) => {
    const req = indexedDB.open('anygym');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const connection = req.result;
      const tx = connection.transaction(name, 'readonly');
      const read = tx.objectStore(name).getAll();
      tx.oncomplete = () => { connection.close(); resolve(read.result as T[]); };
      tx.onabort = () => { connection.close(); reject(tx.error); };
    };
  }), store,
);

type SavedSet = { id: string; order: number; reps: number; load: { kind: string; unit: string; total: number; barWeight?: number; perSide?: number[] } };
const savedSets = async (page: Page) => (await dbAll<SavedSet>(page, 'sets')).sort((a, b) => a.order - b.order);

// PLAN 1.7c: the picker opens by itself on an empty quick workout; adding one opens its exercise view.
async function addExercise(page: Page, query: string, name: string) {
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  // An empty quick workout opens the picker by itself, a moment after the list renders.
  await sheet.waitFor({ timeout: 1500 }).catch(() => {});
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
}

/** PLAN 1.7c: weights are picked in the "Pick the weight" sheet from the current row's weight cell. */
const picker = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight', exact: true });
async function openPicker(page: Page, card: Locator) {
  await card.getByTestId('weight-cell').first().tap();
  await expect(picker(page)).toBeVisible();
}
async function pickerDone(page: Page) {
  await picker(page).getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(picker(page)).toHaveCount(0);
}

// PLAN 1.7c: the set card's Log set is now the current row's check in the set table.
const logButton = (page: Page) => page.getByTestId('check-current');

test('offline edits, undo and Finish persist exact sets after offline reload', async ({ page, context }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  // Explicitly wait for precaching and a controlling worker before removing the network.
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await openPicker(page, card);
  await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await pickerDone(page);
  await context.setOffline(true);
  try {
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await page.waitForTimeout(400); // outside the intentional double-tap guard
    await logButton(page).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    const original = await savedSets(page);

    await card.getByTestId('set-row').first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set' });
    await edit.getByRole('button', { name: 'More reps' }).tap();
    await edit.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
    await edit.getByRole('button', { name: 'Save', exact: true }).tap();
    await expect(edit).toHaveCount(0);
    await expect(card.getByTestId('set-row').first().getByRole('button', { name: /9 × 145 lb/ })).toBeVisible();
    const edited = await savedSets(page);
    expect(edited[0]).toMatchObject({ id: original[0]!.id, reps: 9, load: { total: 145, unit: 'lb', barWeight: 45, perSide: [45, 5] } });
    expect(edited[1]).toEqual(original[1]);

    await card.getByTestId('set-row').first().tap();
    await edit.getByRole('button', { name: 'Delete set' }).tap();
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(2);
    expect(await savedSets(page)).toEqual(edited);

    // Finish during the Undo window must commit this second deletion before counting.
    await card.getByTestId('set-row').nth(1).tap();
    await edit.getByRole('button', { name: 'Delete set' }).tap();
    await expect(card.getByTestId('set-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await page.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(page.getByRole('status').filter({ hasText: 'Workout saved · 1 set' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    expect(await savedSets(page)).toEqual([edited[0]]);
    const sessions = await dbAll<{ endedAt?: number }>(page, 'sessions');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.endedAt).toEqual(expect.any(Number));
  } finally {
    await context.setOffline(false);
    expect(errors).toEqual([]);
  }
});

// CODEX FOUND BUG, fixed in 1.10c
test('changing machine step cannot log the old pin when it no longer exists', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await addExercise(page, 'leg press', 'Leg Press');
  // PLAN 1.7c round 2: Leg Press is mapped (plate machine); switch it to a pin stack from the ⋯ menu.
  await page.getByTestId('exercise-leg-press').getByRole('button', { name: 'More for Leg Press' }).tap();
  await page.getByRole('dialog', { name: 'Leg Press options' }).getByRole('button', { name: /Loaded with/ }).tap();
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Machine with a pin/ }).tap();
  const card = page.getByTestId('exercise-leg-press');
  await openPicker(page, card);
  await picker(page).getByRole('radio', { name: 'Pin at 15 lb', exact: true }).tap();
  await pickerDone(page);
  await expect(logButton(page)).toHaveAccessibleName('Log set 1: 8 × 15 lb');
  await openPicker(page, card);
  await picker(page).getByRole('button', { name: 'Steps of 5 · Change' }).tap();
  const step = page.getByRole('dialog', { name: 'Weight steps' });
  await step.getByRole('button', { name: 'Goes up by 10 lb', exact: true }).tap();
  await expect(step).toHaveCount(0);
  await expect(picker(page).getByRole('radio', { name: 'Pin at 15 lb', exact: true })).toHaveCount(0);
  await expect(picker(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await picker(page).getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(picker(page)).toHaveCount(0);
  await expect(logButton(page)).toBeDisabled();
  expect(await savedSets(page)).toEqual([]);
  await openPicker(page, card);
  await picker(page).getByRole('radio', { name: 'Pin at 20 lb', exact: true }).tap();
  await pickerDone(page);
  await expect(logButton(page)).toHaveAccessibleName('Log set 1: 8 × 20 lb');
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]!.load).toEqual({ kind: 'stack', unit: 'lb', total: 20, stackValue: 20 });
  expect(errors).toEqual([]);
});
