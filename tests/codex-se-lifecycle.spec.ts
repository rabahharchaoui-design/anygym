import { expect, test, type Locator, type Page } from './fixtures';
import { bar185, checkCurrent, dbAll, exerciseView, fitsOneScreen, loggedRows, quickWith, seedFinished, watchErrors } from './workout-helpers';
import type { WorkoutSet } from '../src/db/types';

// Explicit SE dimensions even when this file is selected under a larger iPhone project.
test.use({ viewport: { width: 375, height: 667 } });

async function readyBench(page: Page) {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  await expect(checkCurrent(view)).toBeEnabled();
  return view;
}

// Visibility alone permits an offscreen, clipped or covered button to pass. Never scroll here.
async function exposed(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.left < 0 || r.top < 0 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      const b = p.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(s.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) return false;
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit));
  })).toBe(true);
}

// Was CODEX FOUND BUG, fixed in 1.7g: the exercise heading wraps instead of a 3 line clamp.
test('SE at 130% text: long exercise title, current row, inline reps and rest remain exposed without scrolling', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['internal shoulder', 'Band Internal Shoulder Rotation (90 degrees)']]);
  const view = exerciseView(page, 'band-internal-shoulder-rotation-90-degrees');
  // This exercise is bodyweight by the shipped override; no invented load question or demo.
  await expect(view).toBeVisible();
  await page.evaluate(() => {
    // Scale each computed font once, including explicit px sizes; scaling only the root misses them.
    const sizes = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => {
      const s = getComputedStyle(el);
      return { el, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
    });
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  const title = view.getByRole('heading', { name: 'Band Internal Shoulder Rotation (90 degrees)' });
  await exposed(title);
  expect(await title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await fitsOneScreen(page);
  await exposed(view.getByTestId('set-target'));
  await exposed(view.getByTestId('weight-cell').first());
  await exposed(view.getByTestId('reps-cell').first());
  await exposed(checkCurrent(view));
  await view.getByTestId('reps-cell').first().tap();
  await exposed(view.getByRole('button', { name: 'More reps' }));
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await fitsOneScreen(page);
  await exposed(title);
  await exposed(checkCurrent(view));
  await exposed(page.getByRole('button', { name: 'Skip', exact: true }));
  expect(errors).toEqual([]);
});

test('offline SE: edit, delete, undo, reload and Finish preserve the exact set and summary', async ({ page, context }) => {
  const errors = watchErrors(page);
  const view = await readyBench(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const sessionId = page.url().split('/').at(-2)!;
  await context.setOffline(true);
  try {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const original = (await dbAll<WorkoutSet>(page, 'sets')).find((s) => s.sessionId === sessionId)!;
    await loggedRows(view).first().tap();
    const edit = page.getByRole('dialog', { name: 'Edit set' });
    await edit.getByRole('button', { name: 'More reps' }).tap();
    await edit.getByRole('button', { name: 'Save' }).tap();
    await expect(edit).toHaveCount(0);
    await loggedRows(view).first().tap();
    await edit.getByRole('button', { name: 'Delete set' }).tap();
    await expect(loggedRows(view)).toHaveCount(0);
    expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.sessionId === sessionId)).toEqual([]);
    await page.getByRole('button', { name: 'Undo', exact: true }).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const expected = { ...original, reps: original.reps! + 1 };
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.sessionId === sessionId)).toEqual([expected]);
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-sets')).toHaveText('1');
    const total = await page.getByTestId('finish-total').textContent();
    expect(total).toBe(`${(185 * expected.reps!).toLocaleString('en-US')} lb`);
    await page.reload();
    await expect(page.getByTestId('finish-total')).toHaveText(total!);
    expect((await dbAll<WorkoutSet>(page, 'sets')).filter((s) => s.sessionId === sessionId)).toEqual([expected]);
    expect((await dbAll<{ id: string; endedAt?: number }>(page, 'sessions')).find((s) => s.id === sessionId)?.endedAt).toEqual(expect.any(Number));
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
