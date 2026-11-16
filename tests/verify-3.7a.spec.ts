import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, exerciseView, watchErrors } from './workout-helpers';

// PLAN 3.7a (gate critic 1, 3, 5): the weight screens never show a number they are not sure of,
// never ask a question whose answers cannot be true, and keep every plate button above Done.

const loadQuestion = (page: Page) => page.getByRole('dialog', { name: 'How do you load this?' });

/** A workout already running with these exercises (catalog ids), opened on its list. */
async function workoutWith(page: Page, ids: string[]) {
  await page.goto('./');
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const id = `w37a-${Date.now()}`;
  await dbPut(page, { sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 60_000, imported: false, exerciseIds: ids }] });
  await page.goto(`./#/workout/${id}`);
  await expect(page.getByTestId(`row-${ids[0]}`)).toBeVisible();
}

test.describe('3.7a (3) load kinds from the equipment @matrix', () => {
  test('Machine Bench Press asks only the two machine answers, the stack first', async ({ page }) => {
    const errors = watchErrors(page);
    await workoutWith(page, ['Machine_Bench_Press', 'Preacher_Curl']);
    await page.getByTestId('row-Machine_Bench_Press').tap();
    const q = loadQuestion(page);
    await expect(q).toHaveAttribute('data-state', 'open');
    const choices = (await q.locator('button[aria-pressed]').allInnerTexts()).map((t) => (t.split('\n')[0] ?? '').trim());
    expect(choices).toEqual(['Machine with a pin', 'Plates on a machine']);
    for (const no of ['Plates on a bar', 'Dumbbells', 'One weight', 'Bodyweight', 'Timed']) await expect(q.getByText(no, { exact: true })).toHaveCount(0);
    await q.getByText('Machine with a pin', { exact: true }).tap();
    await expect(q).toHaveCount(0);
    await expect(exerciseView(page, 'Machine_Bench_Press').getByTestId('weight-cell').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('one possible kind: a barbell Preacher Curl opens without the question', async ({ page }) => {
    const errors = watchErrors(page);
    await workoutWith(page, ['Preacher_Curl', 'Machine_Bench_Press']);
    await page.getByTestId('row-Preacher_Curl').tap();
    await expect(exerciseView(page, 'Preacher_Curl').getByTestId('weight-cell').first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(loadQuestion(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
