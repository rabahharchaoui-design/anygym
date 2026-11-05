import { expect, test, type Locator, type Page } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { bar185, checkCurrent, dbAll, exerciseView, loggedRows, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

// Check before tapping: an automatic scroll during tap must not conceal a layout defect.
async function exposed(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]].every(([x, y]) => {
      const hit = document.elementFromPoint(r.left + r.width * x!, r.top + r.height * y!);
      return hit !== null && (hit === el || el.contains(hit));
    });
  })).toBe(true);
}

async function noLiftingScroll(page: Page) {
  expect(await page.getByRole('main').evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.getByRole('main').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
}

test('SE 130% text: four plan sets remain exposed beside the demo with rest running', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  // Same 130% computed font/line-height scaling as text-130-1.7e.spec.ts.
  await page.evaluate(() => {
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
      const style = getComputedStyle(el);
      return { el, size: parseFloat(style.fontSize), line: parseFloat(style.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await expect(view.getByTestId('set-todo')).toHaveCount(3);
  await noLiftingScroll(page);
  const rest = (await page.getByTestId('rest-timer').boundingBox())!;
  const rows = page.getByRole('list', { name: 'Sets', exact: true });
  const box = (await rows.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(rest.y + 0.5);
  // Hero text lets taps pass through to the demo button (pointer-events: none).
  // It must be visible on screen, but is intentionally not a hit-test target.
  for (const text of [view.getByRole('heading', { name: 'Barbell Back Squat', exact: true }), view.getByTestId('set-target')]) {
    await expect(text).toBeVisible();
    await expect(text).toBeInViewport({ ratio: 1 });
  }
  for (const control of await rows.locator('[data-testid="weight-cell"], [data-testid="reps-cell"], [data-testid="check-current"], [data-testid="check"]').all()) {
    await exposed(control);
  }
  await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await noLiftingScroll(page);
  expect(errors).toEqual([]);
});

test('offline demo Close and Back preserve a changed pending row, saved sets and the rest deadline through reload and Finish', async ({ page, context }) => {
  test.setTimeout(60_000);
  // ./fixtures traps console errors/rejections, allowing only exact failed resource URLs while offline.
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
  const photos = view.getByTestId('ex-hero').locator('img[alt$="position"]');
  await expect(photos).toHaveCount(2);
  for (const photo of await photos.all()) {
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Wait for the real runtime cache write; do not populate the cache in the test.
    // Inspect URL presence: matching a URL-only request also compares Vary headers
    // (the preview server sends Vary: Origin), unlike the original image request.
    // The viewer and reload assertions below verify actual offline image loading.
    await expect.poll(() => photo.evaluate(async (img: HTMLImageElement) => {
      const cache = await caches.open('exercise-photos');
      return (await cache.keys()).some((request) => request.url === img.currentSrc);
    })).toBe(true);
  }
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  const saved = (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-'));
  // The row shows from the database's live query; the deadline is saved as the log call returns.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('anygym-rest'))).not.toBeNull();
  const rest = await page.evaluate(() => localStorage.getItem('anygym-rest'));
  const originalReps = Number(await view.getByTestId('reps-cell').first().textContent());
  await view.getByTestId('reps-cell').first().tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await weight.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
  await weight.getByRole('button', { name: 'Done', exact: true }).tap();
  await expect(view.getByTestId('weight-cell')).toHaveText(['195', '195']);
  const route = page.url();
  await context.setOffline(true);
  try {
    for (const close of ['button', 'back'] as const) {
      await view.getByRole('button', { name: 'How to do Barbell Back Squat' }).tap();
      const viewer = page.getByTestId('demo-viewer');
      await expect(viewer).toBeVisible();
      for (const photo of await viewer.locator('img[alt$="position"]').all()) {
        await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      }
      if (close === 'button') await viewer.getByRole('button', { name: 'Close', exact: true }).tap();
      else await page.goBack();
      await expect(viewer).toHaveCount(0);
      await expect(page).toHaveURL(route);
      await expect(view.getByTestId('weight-cell')).toHaveText(['195', '195']);
      await expect(view.getByTestId('reps-cell').first()).toHaveText(String(originalReps + 2));
      expect(await page.evaluate(() => localStorage.getItem('anygym-rest'))).toBe(rest);
      expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-'))).toEqual(saved);
      await noLiftingScroll(page);
    }
    await page.reload();
    await expect(view.getByTestId('weight-cell')).toHaveText(['195', '195']);
    await expect(view.getByTestId('reps-cell').first()).toHaveText(String(originalReps + 2));
    expect(await page.evaluate(() => localStorage.getItem('anygym-rest'))).toBe(rest);
    await exposed(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(2);
    const sets = (await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
    expect(sets[0]).toEqual(saved[0]);
    expect(sets[1]).toMatchObject({ reps: originalReps + 2, load: { total: 195, unit: 'lb', barWeight: 45, perSide: [45, 25, 5] } });
    expect(new Set(sets.map((s) => s.id)).size).toBe(2);
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    await page.reload();
    await expect(page.getByTestId('finish-sets')).toHaveText('2');
    expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order)).toEqual(sets);
  } finally {
    await context.setOffline(false);
  }
});
