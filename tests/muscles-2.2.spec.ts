import { expect, test, type Page } from './fixtures';

// PLAN 2.2: the muscle map on its dev route (SPEC 4.4, 4.5).
const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};

test('muscle map: front and back, lime primary, 40% secondary, text labels, empty state @matrix', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./?dev#/dev/muscles');
  const map = page.getByTestId('muscle-map');
  await expect(map).toBeVisible();
  const front = map.locator('svg[data-view="front"]');
  const back = map.locator('svg[data-view="back"]');
  await expect(front).toBeVisible();
  await expect(back).toBeVisible();
  await expect(map.getByText('Front', { exact: true })).toBeVisible();
  await expect(map.getByText('Back', { exact: true })).toBeVisible();

  // Incline press: upper chest primary, front delts and triceps secondary.
  await expect(page.getByTestId('muscle-text')).toHaveText('Upper chest · Front delts, triceps');
  const chest = front.locator('[data-region="chest"]').first();
  await expect(chest).toHaveAttribute('data-role', 'primary');
  expect(await chest.evaluate((el) => getComputedStyle(el).fill)).toBe('rgb(212, 255, 58)');
  const delt = front.locator('[data-region="front-deltoids"]').first();
  await expect(delt).toHaveAttribute('data-role', 'secondary');
  expect(await delt.evaluate((el) => getComputedStyle(el).fillOpacity)).toBe('0.4');
  await expect(back.locator('[data-role="primary"]')).toHaveCount(0);
  await expect(map.getByText('Primary', { exact: true })).toBeVisible();
  await expect(map.getByText('Secondary', { exact: true })).toBeVisible();

  // Both bodies fit side by side, readable, with no sideways scroll.
  const f = (await front.boundingBox())!;
  const b = (await back.boundingBox())!;
  expect(f.width).toBeGreaterThanOrEqual(90);
  expect(b.x).toBeGreaterThanOrEqual(f.x + f.width);
  const vw = page.viewportSize()!.width;
  expect(b.x + b.width).toBeLessThanOrEqual(vw);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `reports/shots/2.2/${test.info().project.name.replace(/\s+/g, '-')}-incline.png` });

  // Rear delt work lights the back view.
  const select = page.getByLabel('Exercise');
  await select.selectOption('cat:Face_Pull');
  await expect(page.getByTestId('muscle-text')).toHaveText('Rear delts · Mid back');
  await expect(back.locator('[data-region="back-deltoids"]').first()).toHaveAttribute('data-role', 'primary');

  // Lateral raise: front delt shape, text says side delts.
  await select.selectOption('cat:Side_Lateral_Raise');
  await expect(page.getByTestId('muscle-text')).toHaveText('Side delts');
  await expect(front.locator('[data-region="front-deltoids"]').first()).toHaveAttribute('data-role', 'primary');

  // A plan exercise with match none: no map, honest empty state.
  await select.selectOption('plan:28-method-squat');
  await expect(page.getByTestId('muscle-map-empty')).toHaveText('Muscles coming soon');
  await expect(page.locator('svg[data-view]')).toHaveCount(0);

  expect(errors).toEqual([]);
});
