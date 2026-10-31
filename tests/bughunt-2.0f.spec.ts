import { expect, test, type Page } from './fixtures';

// PLAN 2.0f group 8: the landscape guard sits above an open sheet (Codex 1031 1657 #6).

async function quick(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
}

test('landscape guard covers an open picker and is the top element', async ({ page }) => {
  await quick(page);
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await expect(page.getByTestId('workout-title').or(sheet).first()).toBeVisible();
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  await expect(sheet).toBeVisible();
  const guard = page.getByTestId('landscape-guard');
  await expect(guard).toBeHidden();
  const portrait = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(guard).toBeVisible();
  const top = await page.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return el?.closest('[data-testid="landscape-guard"]') !== null;
  });
  expect(top).toBe(true);
  expect(await page.evaluate(() => document.getElementById('root')?.hasAttribute('inert'))).toBe(true);
  await page.setViewportSize(portrait);
  await expect(guard).toBeHidden();
  await expect(sheet).toBeVisible();
});
