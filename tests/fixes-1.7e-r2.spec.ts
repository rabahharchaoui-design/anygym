import { expect, test, type Page } from './fixtures';
import { bar185, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// PLAN 1.7e round 2 (tester and Codex review reports/codex/1.7e.md): sheets and Back, the push and
// pop fallback without View Transitions, the rest bar and info sheets at 130% text on the SE.

const seedSquat = (page: Page) => seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });

async function startSquat(page: Page) {
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
}

/** iOS text size 130%: the root size and every px sized text scaled by 1.3 (as the 1.7g tester does). */
async function text130(page: Page) {
  await page.evaluate(() => {
    const root = document.documentElement;
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    root.style.fontSize = '100%';
    const a = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    root.style.fontSize = '130%';
    els.forEach((e, i) => {
      const b = parseFloat(getComputedStyle(e).fontSize);
      if (Math.abs(b - a[i]!) < 0.01) e.style.fontSize = `${b * 1.3}px`;
    });
  });
  await page.waitForTimeout(200);
}

test('Back closes only the top sheet of a nested stack; a sheet closed by hand never costs a Back press', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['leg press', 'Leg Press']]);
  const url = page.url();
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(weight).toBeVisible();
  await weight.getByRole('button', { name: 'Set starting weight' }).tap();
  const start = page.getByRole('dialog', { name: 'Starting weight' });
  await expect(start).toBeVisible();
  await start.getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
  const info = page.getByRole('dialog', { name: 'Plate loaded machine' });
  await expect(info).toBeVisible();

  await page.goBack();
  await expect(info).toHaveCount(0);
  await expect(start).toBeVisible();
  await expect(weight).toBeAttached();
  expect(page.url()).toBe(url);

  await page.goBack();
  await expect(start).toHaveCount(0);
  await expect(weight).toBeVisible();
  expect(page.url()).toBe(url);

  // Closed by hand: the route stays, and its entry is used up.
  await weight.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(weight).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
  await expect(page.getByTestId('exercise-leg-press')).toBeVisible();

  // No sheet open: Back navigates as before (out of the exercise, one press).
  await page.goBack();
  await expect(page).not.toHaveURL(url);
  await expect(page.getByTestId('exercise-leg-press')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Back from a screen with no sheet navigates; a sheet opened there and closed by hand changes nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('link', { name: 'Plans' }).tap();
  await expect(page).toHaveURL(/#\/plans$/);
  await page.getByRole('link', { name: 'Today' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await page.getByRole('button', { name: 'Change day' }).tap();
  const sheet = page.getByRole('dialog', { name: 'Change day' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/plans$/);
  expect(errors).toEqual([]);
});

test.describe('without View Transitions (older iOS)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error force the fallback path
      delete Document.prototype.startViewTransition;
      // @ts-expect-error force the fallback path
      document.startViewTransition = undefined;
    });
  });

  /** Samples the workout views for a moment after `act`: how many layers, and the largest x offset seen. */
  async function sample(page: Page, act: () => Promise<void>) {
    await page.evaluate(() => {
      const w = window as unknown as { __nav: { layers: number; dx: number; minOpacity: number } };
      w.__nav = { layers: 0, dx: 0, minOpacity: 1 };
      const t0 = performance.now();
      const step = () => {
        const views = Array.from(document.querySelectorAll<HTMLElement>('[data-motion-view]'));
        w.__nav.layers = Math.max(w.__nav.layers, views.length);
        for (const v of views) {
          const m = new DOMMatrix(getComputedStyle(v).transform);
          w.__nav.dx = Math.max(w.__nav.dx, Math.abs(m.m41));
          w.__nav.minOpacity = Math.min(w.__nav.minOpacity, parseFloat(getComputedStyle(v).opacity));
        }
        if (performance.now() - t0 < 900) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    await act();
    await page.waitForTimeout(1000);
    return page.evaluate(() => (window as unknown as { __nav: { layers: number; dx: number; minOpacity: number } }).__nav);
  }

  test('push and pop still slide with Motion, the leaving view inert, then one view is left', async ({ page }) => {
    const errors = watchErrors(page);
    await startSquat(page);
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('undefined');
    const push = await sample(page, () => page.getByTestId('row-barbell-back-squat').tap());
    expect(push.layers).toBe(2);
    expect(push.dx).toBeGreaterThan(20);
    await expect(page.locator('[data-motion-view]')).toHaveCount(1);
    await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('check-current')).toBeVisible();

    const pop = await sample(page, () => page.getByRole('button', { name: 'Back to the list' }).tap());
    expect(pop.layers).toBe(2);
    expect(pop.dx).toBeGreaterThan(20);
    await expect(page.locator('[data-motion-view]')).toHaveCount(1);
    await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
    // the flow still works on the fallback: log a set
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('crossfades instead of sliding', async ({ page }) => {
      const errors = watchErrors(page);
      await startSquat(page);
      const push = await sample(page, () => page.getByTestId('row-barbell-back-squat').tap());
      expect(push.dx).toBeLessThan(1);
      expect(push.minOpacity).toBeLessThan(1);
      await expect(page.locator('[data-motion-view]')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  });
});

test.describe('130% text on the SE', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('the rest clock never runs into −15, and every rest button keeps 48pt', async ({ page }) => {
    const errors = watchErrors(page);
    await startSquat(page);
    await page.getByTestId('row-barbell-back-squat').tap();
    await page.getByTestId('exercise-barbell-back-squat').getByTestId('check-current').tap();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await page.waitForTimeout(500);
    await text130(page);
    const m = await page.getByTestId('rest-timer').evaluate((dock) => {
      const clock = dock.querySelector<HTMLElement>('[data-testid="rest-clock"]')!;
      // the drawn digits (the face), not the hidden value
      const face = clock.querySelector<HTMLElement>('[aria-hidden="true"]') ?? clock;
      const buttons = Array.from(dock.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
      return {
        clockRight: face.getBoundingClientRect().right,
        clockBox: clock.getBoundingClientRect().right,
        minus: buttons[0]!.left,
        sizes: buttons.map((b) => [b.width, b.height]),
        dockRight: dock.getBoundingClientRect().right,
        last: buttons[buttons.length - 1]!.right,
      };
    });
    expect(m.clockRight).toBeLessThanOrEqual(m.minus);
    expect(m.clockBox).toBeLessThanOrEqual(m.minus);
    for (const [w, h] of m.sizes) {
      expect(w).toBeGreaterThanOrEqual(48);
      expect(h).toBeGreaterThanOrEqual(48);
    }
    expect(m.last).toBeLessThanOrEqual(m.dockRight);
    expect(errors).toEqual([]);
  });

  test('an info sheet keeps its grabber (Close) on screen and scrolls its body', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      const set = () => document.documentElement && (document.documentElement.style.fontSize = '130%');
      set();
      document.addEventListener('DOMContentLoaded', set);
    });
    await quickWith(page, [['leg press', 'Leg Press']]);
    await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
    await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Set starting weight' }).tap();
    await page.getByRole('dialog', { name: 'Starting weight' }).getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
    const info = page.getByRole('dialog', { name: 'Plate loaded machine' });
    await expect(info).toBeVisible();
    await page.waitForTimeout(500);
    await text130(page);
    const close = info.getByRole('button', { name: 'Close', exact: true });
    const box = (await close.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    const sheetTop = await info.evaluate((el) => el.getBoundingClientRect().top);
    expect(sheetTop).toBeGreaterThanOrEqual(0);
    // "Got it" reachable by scrolling the body
    await info.getByRole('button', { name: 'Got it' }).scrollIntoViewIfNeeded();
    await info.getByRole('button', { name: 'Got it' }).tap();
    await expect(info).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
