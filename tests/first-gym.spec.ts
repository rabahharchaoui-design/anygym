import { expect, test, type Page } from './fixtures';

async function gymCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const c = req.result.transaction('gyms').objectStore('gyms').count();
          c.onsuccess = () => {
            resolve(c.result);
            req.result.close();
          };
          c.onerror = () => reject(c.error);
        };
      }),
  );
}

test('first launch creates My Gym once and shows it in the Today header without shifting', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('./');
  const title = page.getByRole('heading', { level: 1, name: 'Today' });
  await expect(title).toBeVisible();
  const before = await title.boundingBox();

  await expect(page.getByText('My Gym', { exact: true })).toBeVisible();
  expect(await title.boundingBox()).toEqual(before);
  expect(await gymCount(page)).toBe(1);

  await page.reload();
  await expect(page.getByText('My Gym', { exact: true })).toBeVisible();
  expect(await gymCount(page)).toBe(1);

  expect(errors).toEqual([]);
});
