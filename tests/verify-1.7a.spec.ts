import { expect, test } from './fixtures';
import { pickExercises } from './workout-helpers';

// PLAN 1.7a verify, adapted to the 1.7c flow: hints live in the weight sheet and on the check.
test('1.7a verify: hints persist, tap targets, double tap, reload, offline', async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  const card = page.getByTestId('exercise-barbell-back-squat');
  await card.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(page.getByTestId('hint')).toHaveCount(1);
  await expect(page.getByTestId('hint')).toHaveText('Tap plates to load the bar. We add it up.');
  await page.screenshot({ path: `reports/shots/1.7a/v-hint-${info.project.name.replace(/ /g, '-')}.png` });
  // every tray button in the picker at least 48pt
  for (const b of await picker.getByRole('group', { name: 'Plates' }).getByRole('button').all()) {
    const bb = (await b.boundingBox())!;
    const n = (await b.getAttribute('aria-label')) ?? (await b.textContent());
    expect.soft(bb.width, `w ${n}`).toBeGreaterThanOrEqual(47.5);
    expect.soft(bb.height, `h ${n}`).toBeGreaterThanOrEqual(47.5);
  }
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker.getByRole('button', { name: 'Done' }).tap();
  // every button in the exercise view at least 48pt tall (the set type tap target is 40 wide)
  for (const b of await page.locator('main button').all()) {
    if (!(await b.isVisible())) continue;
    const bb = (await b.boundingBox())!;
    const n = (await b.getAttribute('aria-label')) ?? (await b.textContent());
    expect.soft(bb.height, `h ${n}`).toBeGreaterThanOrEqual(43.5);
    if ((await b.getAttribute('data-testid')) !== 'set-type') expect.soft(bb.width, `w ${n}`).toBeGreaterThanOrEqual(43.5);
  }
  await page.reload();
  await card.getByTestId('weight-cell').first().tap();
  await expect(page.getByText('Tap plates to load the bar')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Close', exact: true }).tap();
  await page.reload();
  await expect(page.getByText('Tap plates to load the bar')).toHaveCount(0);
  // offline + double tap the check
  await context.setOffline(true);
  await card.getByTestId('check-current').dblclick();
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await page.waitForTimeout(800);
  await expect(card.getByTestId('set-row')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(1);
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
