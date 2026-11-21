import { expect, test } from './fixtures';

test.describe('app shell', () => {
  test('loads, shows 5 tabs, each tab opens its screen, no console errors @matrix', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const tabs = nav.getByRole('link');
    await expect(tabs).toHaveCount(5);
    await expect(tabs).toHaveText(['Today', 'Plan', 'Run', 'History', 'You']);

    for (const [name, hash, heading] of [
      ['Run', '#/run', 'Run'],
      ['History', '#/history', 'History'],
      ['Plan', '#/plans', 'Plans'],
      ['Today', '#/', 'Today'],
    ] as const) {
      const tab = nav.getByRole('link', { name, exact: true });
      await tab.tap();
      await expect(page).toHaveURL(new RegExp(`${hash.replace('/', '\\/')}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      const box = await tab.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }

    await page.getByTestId('tab-you').tap();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
    await page.getByTestId('tab-today').tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
