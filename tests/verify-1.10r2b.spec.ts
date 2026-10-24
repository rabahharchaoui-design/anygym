import { expect, test } from '@playwright/test';
test('r2 day2', async ({ page }, info) => {
  test.skip(info.project.name !== 'iPhone 15 Pro');
  await page.goto('./#/plans/ohrabah-split');
  await page.getByRole('button', { name: /Use this plan/ }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.locator('[data-testid^="exercise-"]').first().waitFor();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.mouse.click(200,60).catch(()=>{}); await page.waitForTimeout(500);
  console.log('dialogs', await page.getByRole('dialog').count());
  const trunc = await page.locator('[data-testid^="exercise-"]').evaluateAll((els) => els.filter((e) => [...e.querySelectorAll('*')].some((x) => (x as HTMLElement).scrollWidth > (x as HTMLElement).clientWidth + 1 && getComputedStyle(x).textOverflow === 'ellipsis')).length);
  console.log('ellipsis', trunc, (await page.getByRole('main').innerText()).includes('…'));
  await page.screenshot({ path: 'reports/shots/1.10/r2-workout-day2-top.png' });
  await page.evaluate(() => document.querySelectorAll('[data-testid="pair-group"]')[0]?.scrollIntoView()); await page.waitForTimeout(300);
  await page.screenshot({ path: 'reports/shots/1.10/r2-workout-day2-mid.png' });
});
