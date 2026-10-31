import { expect, test, type Page } from './fixtures';
import { bar185, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.0g (G, Nov 1 2:53 AM on his iPhone): in Follow the plan, checking set 1 of Barbell Incline
// Bench Press jumped straight to the next exercise. Checking a set must log it, start the rest and
// STAY on that exercise; only the last working set moves on, and an extra set after going back never.

const DEVICES = ['iPhone SE', 'iPhone 17 Pro Max'];

const ID = 'barbell-incline-bench-press';

async function openIncline(page: Page) {
  await usePlan(page);
  // Last time 4 × 10 at 185: today's rows are already filled in, so a check logs at once.
  await seedFinished(page, { [ID]: Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 · Chest and triceps/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toHaveText('Day 2 · Chest and triceps');
  await page.getByTestId(`row-${ID}`).tap();
  const view = page.getByTestId(`exercise-${ID}`);
  await expect(view.getByTestId('set-target')).toHaveText('Set 1 of 4 · 10 to 12 reps');
  return view;
}

/** Still on the incline press, well past every automatic move (the 900 ms pair hop and the 2.5 s chip). */
async function stillThere(page: Page) {
  await page.waitForTimeout(3200);
  await expect(page.getByTestId(`exercise-${ID}`)).toBeVisible();
  await expect(page.getByRole('main', { name: 'Barbell Incline Bench Press' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${ID}$`));
}

test('checking a set stays on the exercise; only the last set moves on; an extra set never does', async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!DEVICES.includes(test.info().project.name), 'iPhone SE and iPhone 17 Pro Max (PLAN 2.0g)');
  const errors = watchErrors(page);
  const view = await openIncline(page);

  // Set 1: logged, rest running, same exercise.
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await stillThere(page);
  await expect(view.getByTestId('set-target')).toHaveText('Set 2 of 4 · 10 to 12 reps');

  // Set 2: the same.
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await stillThere(page);

  // Sets 3 and 4: the last one moves on ("Nice. Next: …", then back on the list).
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(3);
  await stillThere(page);
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('next-chip')).toContainText('Nice. Next:');
  await expect(page.getByTestId(`exercise-${ID}`)).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByTestId(`row-${ID}`)).toHaveAttribute('data-state', 'done');

  // Going back and checking an extra set: logged, and it stays.
  await page.getByTestId(`row-${ID}`).tap();
  const again = page.getByTestId(`exercise-${ID}`);
  await expect(again.getByTestId('set-row')).toHaveCount(4);
  await again.getByRole('button', { name: '+ Add set' }).tap();
  await again.getByTestId('check-current').tap();
  await expect(again.getByTestId('set-row')).toHaveCount(5);
  await expect(page.getByTestId('next-chip').filter({ hasText: 'Nice' })).toHaveCount(0);
  await stillThere(page);
  expect(errors).toEqual([]);
});
