// GOLDEN 5: the plate math screen in a workout: the bar, plates on each side, the exact total.
import { expect, test } from '../fixtures';
import { exerciseView, quickWith } from '../workout-helpers';

test.describe.configure({ retries: 0 });

test('golden: pick a barbell weight with plates, the total and its math are exact', async ({ page }) => {
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight', exact: true });
  await expect(picker).toBeVisible();
  const total = picker.getByTestId('plate-total');
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side', exact: true }).tap();
  await expect(total).toHaveText('135lb');
  await expect(total).toHaveAttribute('data-math', '45 bar + 2 × 45 = 135 lb');
  await expect(page.locator('[data-plate][data-side="left"]')).toHaveCount(1);
  await expect(page.locator('[data-plate][data-side="right"]')).toHaveCount(1);
  await picker.getByRole('button', { name: 'Add 25 lb plate to each side', exact: true }).tap();
  await expect(total).toHaveText('185lb');
  await expect(total).toHaveAttribute('data-math', '45 bar + 2 × (45 + 25) = 185 lb');
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(picker).toHaveCount(0);
  await expect(view.getByTestId('weight-cell').first()).toContainText('185');
});
