import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';
import { usePlan } from './workout-helpers';

// M4: the real plan, its actions and the empty state at phone widths. The helper runs this spec.
test('Today uses flat Monolith rows and keeps the plan actions', async ({ page }, info) => {
  await usePlan(page);
  const title = page.getByRole('heading', { name: 'Today', exact: true });
  await expect(title).toBeVisible();
  const day = page.getByRole('region', { name: "Today's plan day" });
  await expect(day.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Change day' })).toBeVisible();
  const look = await day.evaluate((el) => { const s = getComputedStyle(el); return { background: s.backgroundColor, shadow: s.boxShadow, border: s.borderTopWidth }; });
  expect(look).toEqual({ background: 'rgba(0, 0, 0, 0)', shadow: 'none', border: '0px' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  for (const button of await day.getByRole('button').all()) {
    const box = await button.boundingBox();
    if (box) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
  }
  mkdirSync('reports/monolith/m4', { recursive: true });
  await page.screenshot({ path: `reports/monolith/m4/today-${info.project.name.replace(/\W+/g, '-')}.png`, animations: 'disabled' });
  await day.getByRole('button', { name: 'Change day' }).tap();
  await expect(page.getByRole('dialog', { name: 'Change day' })).toBeVisible();
});

test('Today empty state offers plans and a quick workout', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Pick a plan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
  await expect(page.getByTestId('quick-card')).toBeVisible();
});
