import { expect, test, type Page, guardContext } from './fixtures';

const dump = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const g = req.result.transaction('gyms').objectStore('gyms').getAll();
          g.onsuccess = () => { resolve(g.result); req.result.close(); };
          g.onerror = () => reject(g.error);
        };
      }),
  );

test('1.3 verify: one gym after fast reloads and concurrent tabs', async ({ page }, info) => {
  const errors: string[] = [];
  const watch = (p: Page) => {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(e.message));
  };
  watch(page);
  await page.goto('./');
  const title = page.getByRole('heading', { level: 1, name: 'Today' });
  const before = await title.boundingBox();
  await expect(page.getByText('My Gym', { exact: true })).toBeVisible();
  expect(await title.boundingBox()).toEqual(before);
  await page.screenshot({ path: `reports/shots/1.3/today-${info.project.name.replace(/ /g, '-')}.png` });
  if (info.project.name === 'iPhone 15 Pro') await page.screenshot({ path: 'reports/shots/1.3/today.png' });
  for (let i = 0; i < 3; i++) await page.reload({ waitUntil: 'commit' });
  await expect(page.getByText('My Gym', { exact: true })).toBeVisible();
  let gyms = await dump(page);
  expect(gyms).toHaveLength(1);
  expect(gyms[0]).toMatchObject({ name: 'My Gym', type: 'full', unit: 'lb', isActive: true });

  // fresh context = fresh storage; open 4 pages at once
  const ctx2 = await guardContext(await page.context().browser()!.newContext(info.project.use as any));
  const pages = await Promise.all([1, 2, 3, 4].map(() => ctx2.newPage()));
  pages.forEach(watch);
  await Promise.all(pages.map((p) => p.goto(new URL('./', info.project.use.baseURL ?? 'http://localhost:4173/anygym/').href)));
  for (const p of pages) await expect(p.getByText('My Gym', { exact: true })).toBeVisible();
  gyms = await dump(pages[0]!);
  expect(gyms).toHaveLength(1);
  await ctx2.close();
  expect(errors).toEqual([]);
});
