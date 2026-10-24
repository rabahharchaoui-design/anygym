import { expect, test, type Page } from './fixtures';

// PLAN 1.10b: the app fills the screen. The tab bar (and the workout's sticky bar) reach the
// bottom edge, the header starts exactly at the top safe area, nothing is wider than the screen.

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

const geometry = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;padding-top:env(safe-area-inset-top,0px);visibility:hidden';
    document.body.appendChild(probe);
    const safeTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    const header = document.querySelector('header');
    const nav = document.querySelector('nav[aria-label="Main"]');
    const shell = document.querySelector('[data-shell]');
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().width > vw + 0.5)
      .map((el) => `${el.tagName}.${el.className}`);
    return {
      innerHeight: window.innerHeight,
      safeTop,
      headerTop: header ? header.getBoundingClientRect().top : null,
      headerPadTop: header ? parseFloat(getComputedStyle(header).paddingTop) : null,
      navBottom: nav ? nav.getBoundingClientRect().bottom : null,
      shellBottom: shell ? shell.getBoundingClientRect().bottom : null,
      scrollW: document.documentElement.scrollWidth,
      vw,
      wide,
    };
  });

for (const [route, title] of [
  ['./', 'Today'],
  ['./#/history', 'History'],
  ['./#/plans', 'Plans'],
] as const) {
  test(`${title}: tab bar reaches the bottom edge, header sits at the safe area`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const g = await geometry(page);
    expect(g.navBottom).toBe(g.innerHeight);
    expect(g.shellBottom).toBe(g.innerHeight);
    expect(g.headerTop).toBe(0);
    expect(g.headerPadTop).toBe(g.safeTop);
    expect(g.wide).toEqual([]);
    expect(g.scrollW).toBeLessThanOrEqual(g.vw);
    expect(errors).toEqual([]);
  });
}

test('workout: the sticky Log set bar reaches the bottom edge', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  const bar = page.getByTestId('action-bar');
  await expect(bar.getByRole('button', { name: /^Log set/ })).toBeVisible();
  const { bottom, innerHeight, scrollW, vw } = await page.evaluate(() => ({
    bottom: document.querySelector('[data-testid="action-bar"]')!.getBoundingClientRect().bottom,
    innerHeight: window.innerHeight,
    scrollW: document.documentElement.scrollWidth,
    vw: document.documentElement.clientWidth,
  }));
  expect(bottom).toBe(innerHeight);
  expect(scrollW).toBeLessThanOrEqual(vw);
  expect(errors).toEqual([]);
});

test('7 taps on the Today title within 3 s open the viewport diagnostics; 6 do not', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const title = page.getByRole('heading', { level: 1, name: 'Today' });
  await expect(title).toBeVisible();
  for (let i = 0; i < 6; i++) await title.tap();
  await page.waitForTimeout(3100); // the window passes, the count starts over
  for (let i = 0; i < 6; i++) await title.tap();
  await expect(page).not.toHaveURL(/dev\/viewport/);
  await title.tap();
  await expect(page).toHaveURL(/#\/dev\/viewport$/);
  await expect(page.getByTestId('viewport-info')).toContainText('safe area top');
  // Not in any navigation: no tab is active and no link points at it.
  await expect(page.locator('a[href*="dev/viewport"]')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).locator('[aria-current="page"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('#/dev/viewport prints the measurements and copies them, with no dev flag', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/dev/viewport');
  const info = page.getByTestId('viewport-info');
  await expect(info).toContainText('innerHeight');
  await expect(info).toContainText('safe area bottom');
  await expect(info).toContainText('tab bar gap to bottom0');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.getByTestId('viewport-copy').tap();
  await expect(page.getByTestId('viewport-copy')).toHaveText(/Copied|Copy failed/);
  expect(errors).toEqual([]);
});
