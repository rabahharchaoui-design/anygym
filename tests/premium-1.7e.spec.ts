import { expect, test, type Page } from './fixtures';
import { bar185, dbAll, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7e (SPEC 23): iOS push and pop, tab crossfades, the interactive edge swipe back, the
// large title bar, the sheet card stack, and the Settings screen.

/** Records the kind of every view transition the app starts. */
async function recordTransitions(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __vt: string[] };
    w.__vt = [];
    const doc = document as Document & { startViewTransition?: (cb: () => unknown) => unknown };
    const orig = doc.startViewTransition?.bind(document);
    if (!orig) return;
    doc.startViewTransition = (cb: () => unknown) => {
      w.__vt.push(document.documentElement.dataset.nav ?? '?');
      return orig(cb);
    };
  });
}
const kinds = (page: Page) => page.evaluate(() => (window as unknown as { __vt: string[] }).__vt);

/** A left edge swipe with the mouse (pointer events), `dx` px over `ms`. */
async function edgeSwipe(page: Page, dx: number, ms: number, y = 400) {
  const steps = Math.max(2, Math.round(ms / 16));
  await page.mouse.move(6, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(6 + (dx * i) / steps, y);
    await page.waitForTimeout(ms / steps);
  }
  await page.mouse.up();
}

test('push, pop and tab transitions; the tab pill moves to the picked tab', async ({ page }) => {
  const errors = watchErrors(page);
  await recordTransitions(page);
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Plans' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Plans' })).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('plan-five-day-split').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Classic 5 Day Split' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Plans' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
  await nav.getByRole('link', { name: 'Today' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  expect(await kinds(page)).toEqual(['tab', 'push', 'pop', 'tab']);
  // One pill, inside the active tab.
  const pills = nav.locator('[data-active] > span').first();
  await expect(pills).toBeVisible();
  expect(await nav.locator('a:not([data-active]) [class*="pill"]').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('large title: the glass bar turns on and the compact title shows once the title scrolls away', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans/five-day-split');
  const bar = page.locator('header').first();
  await expect(bar).toHaveAttribute('data-compact', 'false');
  await page.locator('[data-scroller]').evaluate((el) => el.scrollTo({ top: 600 }));
  await expect(bar).toHaveAttribute('data-compact', 'true');
  await expect(bar).toHaveAttribute('data-scrolled', 'true');
  await page.locator('[data-scroller]').evaluate((el) => el.scrollTo({ top: 0 }));
  await expect(bar).toHaveAttribute('data-compact', 'false');
  expect(errors).toEqual([]);
});

test('edge swipe back: a fast flick finishes, a short slow drag cancels', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./#/plans');
  await page.getByTestId('plan-five-day-split').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Classic 5 Day Split' })).toBeVisible();
  await page.waitForTimeout(400);
  // Short and slow: springs back, still on the plan.
  await edgeSwipe(page, 50, 500);
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/#\/plans\/five-day-split$/);
  await expect(page.locator('main')).toHaveCount(1);
  expect(await page.locator('main').evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
  // A quick flick: back to Plans.
  await edgeSwipe(page, 160, 100);
  await expect(page).toHaveURL(/#\/plans$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Plans' })).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('edge swipe back from the exercise view to the day list; a tap on the edge still reaches what is under it', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('check-current')).toBeEnabled();
  // The demo tile starts under the edge strip: a plain tap there still opens it.
  const tile = view.getByRole('button', { name: 'How to do Barbell Back Squat' });
  const box = (await tile.boundingBox())!;
  expect(box.x).toBeLessThan(20);
  await page.waitForTimeout(400); // past the arrival guard (double tap protection)
  await page.mouse.click(box.x + 2, box.y + box.height / 2);
  const how = page.getByRole('dialog', { name: 'How to' });
  await expect(how).toBeVisible();
  await how.getByRole('button', { name: 'Close', exact: true }).first().tap();
  await expect(how).toHaveCount(0);
  await page.waitForTimeout(300);
  await edgeSwipe(page, 220, 120, 300);
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await expect(view).toHaveCount(0);
  await expect(page.getByRole('main')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('sheet card stack: the app behind scales back while a sheet is open, nested sheets step back', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Change day' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' });
  await expect(sheet).toBeVisible();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('root')!).scale)).toBe('0.94');
  await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.sheets ?? null)).toBeNull();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('root')!).scale)).toBe('none');
  expect(errors).toEqual([]);
});

test('Settings: Haptics and Colored plates switches save, version shows', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('link', { name: 'Settings' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('app-version')).toHaveText(/^Version \d+\.\d+\.\d+$/);
  const haptics = page.getByRole('switch', { name: /Haptics/ });
  await expect(haptics).toBeChecked();
  await page.getByText('Haptics', { exact: true }).tap();
  await expect(haptics).not.toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem('anygym.haptics'))).toBe('off');
  const plates = page.getByRole('switch', { name: /Colored plates/ });
  await expect(plates).toBeEnabled();
  await expect(plates).not.toBeChecked();
  await page.getByText('Colored plates', { exact: true }).tap();
  await expect(plates).toBeChecked();
  await expect.poll(async () => (await dbAll<{ isActive: boolean; plateColors: string }>(page, 'gyms')).find((g) => g.isActive)?.plateColors).toBe('color');
  await page.reload();
  await expect(page.getByRole('switch', { name: /Haptics/ })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: /Colored plates/ })).toBeChecked();
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('navigation and sheets still work, the app behind is not scaled', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await page.getByRole('button', { name: 'Change day' }).tap();
    await expect(page.getByRole('dialog', { name: 'Change day' })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('root')!).scale)).toBe('none');
    await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2/ }).tap();
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
