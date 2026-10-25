import { expect, test } from './fixtures';

test.describe('app shell', () => {
  test('loads, shows 4 tabs, each tab opens its screen, no console errors @matrix', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const tabs = nav.getByRole('link');
    await expect(tabs).toHaveCount(4);
    await expect(tabs).toHaveText(['Today', 'Run', 'History', 'Plans']);

    for (const [name, hash] of [
      ['Run', '#/run'],
      ['History', '#/history'],
      ['Plans', '#/plans'],
      ['Today', '#/'],
    ] as const) {
      const tab = nav.getByRole('link', { name });
      await tab.tap();
      await expect(page).toHaveURL(new RegExp(`${hash.replace('/', '\\/')}$`));
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(tab).toHaveAttribute('aria-current', 'page');
      const box = await tab.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }

    await page.getByRole('link', { name: 'Settings' }).tap();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Today' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
