import { expect, test, type Page } from './fixtures';

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
};
const open = async (page: Page) => {
  await page.goto('./?dev#/dev/loads');
  await expect(page.getByTestId('section-dumbbell')).toBeVisible();
};
const sec = (p: Page, id: string) => p.getByTestId(`section-${id}`);
const secs = async (p: Page) => JSON.parse((await p.getByTestId('json-timed-extra').textContent())!).seconds;

test('1.6 timer wall clock, spam, reload mid timer', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  const s = sec(page, 'timed');
  await s.scrollIntoViewIfNeeded();
  await s.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(2000);
  await s.getByRole('button', { name: 'Stop timer' }).tap();
  const v = await secs(page);
  expect(v).toBeGreaterThanOrEqual(1.7); expect(v).toBeLessThanOrEqual(2.3);
  await s.getByRole('button', { name: 'Reset' }).tap();
  for (let i = 0; i < 10; i++) {
    await s.getByRole('button', { name: /timer$/ }).tap();
    await page.waitForTimeout(350);
  }
  const clock = await s.getByTestId('timer-clock').textContent();
  expect(clock).toMatch(/^\d\d:\d\d$/);
  expect(await secs(page)).not.toBeNaN();
  expect(await secs(page)).toBeGreaterThanOrEqual(0);
  // reload mid timer
  const btn = s.getByRole('button', { name: /timer$/ });
  if ((await btn.getAttribute('aria-label')) !== 'Stop timer') await btn.tap();
  await page.reload();
  await expect(sec(page, 'timed')).toBeVisible();
  expect(errors).toEqual([]);
});

test('1.6 tap targets and wheel snap', async ({ page }) => {
  test.setTimeout(90_000); // measures every key of every pad, one by one
  const errors = watch(page);
  await open(page);
  const small: string[] = [];
  const check = async (loc: ReturnType<Page['locator']>, label: string) => {
    await page.waitForTimeout(350); // a just tapped button is still in its pressed state (scale 0.97)
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      if (b && (b.height < 47.5 || b.width < 47.5)) small.push(`${label}[${i}] ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
  };
  await check(sec(page, 'dumbbell').getByRole('option'), 'dumbbell opt');
  await check(sec(page, 'single').getByRole('option'), 'single opt');
  await check(sec(page, 'stack').getByRole('radio'), 'stack pin');
  await check(sec(page, 'stack').getByRole('button'), 'stack btn');
  await sec(page, 'stack').getByRole('button', { name: 'Add weight' }).tap();
  await check(sec(page, 'stack').getByRole('button'), 'stack btn2');
  await check(sec(page, 'bodyweight').getByRole('button'), 'bw btn');
  await sec(page, 'bodyweight').getByRole('button', { name: 'Add weight' }).tap();
  // The tapped button is still in its pressed state (scale 0.97) for a moment: let it settle.
  await page.waitForTimeout(400);
  await check(sec(page, 'bodyweight').getByRole('button'), 'bw btn2');
  await check(sec(page, 'plate-machine').getByRole('button'), 'pm btn');
  await check(sec(page, 'timed').getByRole('button'), 'timed btn');
  await check(sec(page, 'prompts').getByRole('button'), 'prompt btn');
  await sec(page, 'plate-machine').getByRole('button', { name: 'Set starting weight' }).tap();
  const sheet = page.getByRole('dialog');
  await check(sheet.getByRole('button'), 'sheet btn');
  console.log('SMALL', small.join(' | '));
  // open/close sheet 10x
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Escape');
    if (!(await expect(sheet).toHaveCount(0, { timeout: 2000 }).then(() => true, () => false))) {
      const close = sheet.getByRole('button', { name: /close|cancel|not now/i });
      if (await close.count()) await close.first().tap();
      await expect(sheet).toHaveCount(0);
    }
    await sec(page, 'plate-machine').getByRole('button', { name: 'Set starting weight' }).tap();
    await expect(sheet).toHaveCount(1);
  }
  expect(await page.getByRole('dialog').count()).toBe(1);
  expect(small).toEqual([]);
  expect(errors).toEqual([]);
});

test('1.6 wheel range and huge/zero added', async ({ page }) => {
  const errors = watch(page);
  await open(page);
  const opts = sec(page, 'dumbbell').getByRole('option');
  const names = await opts.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent));
  console.log('WHEEL', names.join(','));
  const bw = sec(page, 'bodyweight');
  await bw.scrollIntoViewIfNeeded();
  await bw.getByRole('button', { name: 'Add weight' }).tap();
  const pad = bw.getByRole('group', { name: 'Added weight' });
  for (const ch of '9999') await pad.getByRole('button', { name: ch, exact: true }).tap();
  console.log('J9999', await page.getByTestId('json-bodyweight').textContent());
  for (let i = 0; i < 6; i++) await pad.getByRole('button', { name: 'Delete' }).tap();
  console.log('J0', await page.getByTestId('json-bodyweight').textContent());
  await pad.getByRole('button', { name: '0', exact: true }).tap();
  await pad.getByRole('button', { name: '0', exact: true }).tap();
  console.log('J00', await page.getByTestId('json-bodyweight').textContent());
  expect(errors).toEqual([]);
});
