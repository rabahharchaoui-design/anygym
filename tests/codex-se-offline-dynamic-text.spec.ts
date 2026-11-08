import { expect, test, type Locator } from './fixtures';
import type { WorkoutSet } from '../src/db/types';
import { checkCurrent, dbAll, exerciseView, loggedRows, quickWith, setTableInFirstScreen } from './workout-helpers';

test.use({ viewport: { width: 375, height: 667 } });
test.beforeEach(({ browserName }) => {
  test.skip(browserName !== 'webkit', 'iPhone SE WebKit coverage');
});

async function thumbControl(control: Locator) {
  // Check BEFORE tapping: Playwright must not scroll an inaccessible control into view.
  await expect(control).toBeInViewport({ ratio: 1 });
  await expect.poll(() => control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.height < 48) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  })).toBe(true);
}

async function enlarged(control: Locator) {
  await expect.poll(() => control.evaluate((el) => {
    const baseline = Number(el.getAttribute('data-codex-base-font'));
    return baseline > 0 && Math.abs(parseFloat(getComputedStyle(el).fontSize) - baseline * 1.3) < 0.1;
  })).toBe(true);
}

// SPEC 13.3/13.5, completed PLAN 1.7c and 2.2b. The older 130% test enlarges
// only the initial DOM. Keep scaling active for the subsequently mounted stepper
// and rest timer too, and measure the real button rather than its visible child.
// fixtures supplies the existing console/error/unhandled-rejection trap.
test('offline SE at 130%: newly mounted reps and rest controls fit without scrolling and retain the logged set', async ({ page, context }) => {
  test.setTimeout(60_000);
  await quickWith(page, [['internal shoulder', 'Band Internal Shoulder Rotation (90 degrees)']]);
  const view = exerciseView(page, 'band-internal-shoulder-rotation-90-degrees');
  await expect(view).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(view).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await page.evaluate(() => {
      const original = new Map<HTMLElement, { font: string; line: string }>();
      const scale = () => {
        const elements = Array.from(document.querySelectorAll<HTMLElement>('body *'));
        // Restore baseline first, so inherited sizes and repeated mounts never compound 1.3×.
        for (const [el, style] of original) {
          el.style.fontSize = style.font;
          el.style.lineHeight = style.line;
        }
        for (const el of elements) {
          if (!original.has(el)) original.set(el, { font: el.style.fontSize, line: el.style.lineHeight });
        }
        const sizes = elements.map((el) => {
          const s = getComputedStyle(el);
          return { el, font: parseFloat(s.fontSize), line: parseFloat(s.lineHeight) };
        });
        for (const { el, font, line } of sizes) {
          el.setAttribute('data-codex-base-font', String(font));
          el.style.fontSize = `${font * 1.3}px`;
          if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
        }
        for (const el of original.keys()) if (!el.isConnected) original.delete(el);
      };
      scale();
      // Font/style writes do not trigger this observer. Text updates and newly
      // mounted sheets, steppers, timers and toast buttons do.
      new MutationObserver(scale).observe(document.body, { childList: true, subtree: true });
    });
    await setTableInFirstScreen(page);
    const title = view.getByRole('heading', { name: 'Band Internal Shoulder Rotation (90 degrees)' });
    await enlarged(title);
    expect(await title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const reps = Number(await view.getByTestId('reps-cell').first().innerText());
    await thumbControl(view.getByTestId('reps-cell').first());
    await view.getByTestId('reps-cell').first().tap();
    const more = view.getByRole('button', { name: 'More reps', exact: true });
    const done = view.getByRole('button', { name: 'Done', exact: true });
    for (const control of [more, done]) {
      await enlarged(control);
      await thumbControl(control);
    }
    await more.tap();
    await done.tap();
    await expect(view.getByTestId('reps-cell').first()).toHaveText(String(reps + 1));
    await setTableInFirstScreen(page);
    await thumbControl(checkCurrent(view));
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(1);
    const skip = page.getByRole('button', { name: 'Skip', exact: true });
    await enlarged(skip);
    await thumbControl(skip);
    await setTableInFirstScreen(page);
    await thumbControl(checkCurrent(view));
    const saved = await dbAll<WorkoutSet>(page, 'sets');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ reps: reps + 1, load: { kind: 'bodyweight', unit: 'lb', total: 0 } });
    await page.reload();
    await expect(loggedRows(view)).toHaveCount(1);
    expect(await dbAll<WorkoutSet>(page, 'sets')).toEqual(saved);
    await setTableInFirstScreen(page);
  } finally {
    await context.setOffline(false);
  }
});
