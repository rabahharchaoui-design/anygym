import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function addExercise(page: Page, query: string, name: string) {
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}

const logButton = (page: Page) => page.getByTestId('action-bar').getByRole('button').first();

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
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
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
    await expect(card.getByTestId('set-row').first()).toContainText('11 × 145 lb');
    const edited = await savedSets(page);
    expect(edited[0]).toMatchObject({ id: original[0]!.id, reps: 11, load: { total: 145, unit: 'lb', barWeight: 45, perSide: [45, 5] } });
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

// Geometry alone misses a control covered by the rest dock or clipped by a scroll container.
async function fullyExposed(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeInViewport({ ratio: 1 });
  expect(await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [0.15, 0.5, 0.85].every((fraction) => {
      const hit = document.elementFromPoint(r.left + r.width * fraction, r.top + r.height / 2);
      return hit !== null && (el === hit || el.contains(hit));
    });
  }), 'element must be exposed at left, center and right').toBe(true);
}

test('375×667: current set, history, plate controls and reps stay exposed with other exercises and rest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  const card = page.getByTestId('exercise-barbell-back-squat');
  await card.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await addExercise(page, 'dumbbell bench', 'Dumbbell Bench Press');
  await addExercise(page, 'plank', 'Plank');
  await addExercise(page, 'back squat', 'Barbell Back Squat');
  await expect(card.getByTestId('set-guide')).toContainText('135');
  await expect(card.getByTestId('set-next')).toContainText('135');
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.reload(); // persisted current exercise, history, logged chip and active rest together
  await expect(card.getByTestId('set-target')).toHaveText('Set 2');
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(450); // layout springs settle; no scrolling during the checks

  const main = page.getByRole('main');
  expect(await main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  for (const el of [
    card.getByRole('heading', { name: 'Barbell Back Squat' }),
    card.getByTestId('set-guide'), card.getByTestId('set-next'),
    card.getByTestId('plate-total'), card.getByTestId('plate-math'),
    card.getByTestId('stepper-reps'), card.getByTestId('set-row'),
    card.getByRole('button', { name: 'More reps' }), card.getByRole('button', { name: 'Fewer reps' }),
    page.getByRole('button', { name: 'Skip', exact: true }),
    page.getByRole('button', { name: 'Add 15 seconds' }), logButton(page),
    ...await card.getByRole('group', { name: 'Plates' }).getByRole('button').all(),
  ]) await fullyExposed(el);
  for (const id of ['set-guide', 'set-next', 'plate-math']) {
    expect(await card.getByTestId(id).evaluate((el) => el.scrollWidth - el.clientWidth), `${id} must not truncate`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('changing machine step cannot log the old pin when it no longer exists', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await addExercise(page, 'leg press', 'Leg Press');
  await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Machine with a pin/ }).tap();
  const card = page.getByTestId('exercise-leg-press');
  await card.getByRole('radio', { name: 'Pin at 15 lb', exact: true }).tap();
  await expect(logButton(page)).toHaveText('Log set · 10 × 15 lb');
  await card.getByRole('button', { name: 'Steps of 5 · Change' }).tap();
  const step = page.getByRole('dialog', { name: 'Weight steps' });
  await step.getByRole('button', { name: 'Goes up by 10 lb', exact: true }).tap();
  await expect(step).toHaveCount(0);
  await expect(card.getByRole('radio', { name: 'Pin at 15 lb', exact: true })).toHaveCount(0);
  await expect(card.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(logButton(page)).toBeDisabled();
  expect(await savedSets(page)).toEqual([]);
  await card.getByRole('radio', { name: 'Pin at 20 lb', exact: true }).tap();
  await expect(logButton(page)).toHaveText('Log set · 10 × 20 lb');
  await logButton(page).tap();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  expect((await savedSets(page))[0]!.load).toEqual({ kind: 'stack', unit: 'lb', total: 20, stackValue: 20 });
  expect(errors).toEqual([]);
});
