/*
 * PLAN 2.2d progress notes (remove this block when the item is done):
 * - done: (1) dead space, (2) swipe delete and Remove set, (3) rest Off and the Plan saved toast,
 *   (4) memo rows, lazy extras, audio warm up, perf check, (5) shared hero name, nav spring.
 * - left: run the regression specs, videos in reports/videos/2.2d, screenshots in reports/shots/2.2d.
 */
import { expect, test, type Locator, type Page } from './fixtures';
import { checkCurrent, dbAll, exerciseView, loggedRows, navIdle, pickExercises, setTableInFirstScreen, usePlan, watchErrors } from './workout-helpers';

// PLAN 2.2d (G, Nov 1 3:59 PM): workout screen polish from his iPhone.

const weightSheet = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });
const toast = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });

async function openPlanExercise(page: Page, id: string) {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId(`row-${id}`).tap();
  const view = exerciseView(page, id);
  await expect(view).toBeVisible();
  await page.waitForTimeout(400); // past the arrival guard
  await navIdle(page);
  return view;
}

/** Quick workout with Barbell Back Squat, 185 lb on every row, `logged` sets checked, rest skipped. */
async function squatWith(page: Page, logged: number) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell')).toHaveText(['185', '185', '185']);
  for (let i = 0; i < logged; i++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
    await page.waitForTimeout(350);
  }
  if (logged > 0) {
    await page.getByRole('button', { name: 'Skip' }).tap();
    await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  }
  return view;
}

/** A finger (a mouse drag here: pointer events) moving a row left by dx. */
async function swipe(page: Page, row: Locator, dx: number) {
  const b = (await row.boundingBox())!;
  const y = b.y + b.height / 2;
  const x0 = b.x + b.width - 24;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (dx * i) / 10, y);
  await page.mouse.up();
}

const box = async (l: Locator) => (await l.boundingBox())!;
/** How far a row's face is moved sideways (its transform's x), 0 when it is home. */
const shiftOf = (l: Locator) =>
  l.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return !t || t === 'none' ? 0 : new DOMMatrix(t).m41;
  });

test('no dead space: + Add set one row gap under the last row, the muscle card right after @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openPlanExercise(page, 'barbell-back-squat');
  // The 2.2b first screen rule still holds: the name, every row and every ✓ unscrolled.
  await setTableInFirstScreen(page);
  const rows = page.getByRole('list', { name: 'Sets' });
  const gap = await rows.evaluate((el) => parseFloat(getComputedStyle(el).rowGap));
  expect(gap).toBeGreaterThan(0);
  const last = await box(view.getByTestId('set-todo').last());
  const add = await box(view.getByTestId('add-set'));
  // "+ Add set" sits at the normal row gap under the last row (no black band).
  expect(Math.abs(add.y - (last.y + last.height) - gap)).toBeLessThanOrEqual(1);
  // The muscle card follows the table area within one row gap.
  const area = await box(view.getByTestId('table-area'));
  const card = await box(view.getByTestId('muscle-card'));
  expect(card.y - (area.y + area.height)).toBeGreaterThanOrEqual(0);
  expect(card.y - (area.y + area.height)).toBeLessThanOrEqual(gap + 1);
  // Nothing between "+ Add set" and the card but the quiet first time line.
  const guide = view.getByTestId('set-guide');
  const between = (await guide.count()) ? (await box(guide)).height + gap + 2 : 0;
  expect(card.y - (add.y + add.height)).toBeLessThanOrEqual(gap + between + 1);
  // The end of the page: no room kept for a rest bar that is not there.
  const tail = await view.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    const kids = [...el.children].filter((c) => (c as HTMLElement).offsetHeight > 0 && getComputedStyle(c).position === 'static');
    const end = Math.max(...kids.map((c) => c.getBoundingClientRect().bottom));
    return el.getBoundingClientRect().bottom - end;
  });
  expect(tail).toBeLessThanOrEqual(32);
  expect(errors).toEqual([]);
});

test('swipe left on a logged set: Delete, Undo brings back the same set (id and order) @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squatWith(page, 2);
  await expect(view.getByTestId('set-todo')).toHaveCount(1);
  const before = (await dbAll<{ id: string; order: number }>(page, 'sets')).sort((a, b) => a.order - b.order);
  expect(before).toHaveLength(2);

  // A short swipe snaps open at about 80 pt, a tap elsewhere closes it.
  const row = loggedRows(view).nth(0);
  await swipe(page, row, -110);
  const del = row.getByTestId('swipe-delete');
  await expect(del).toBeVisible();
  const face = row.locator('[data-state="logged"]');
  await expect.poll(() => shiftOf(face)).toBeLessThan(-70);
  // A tap elsewhere (the column header, which does nothing itself) closes it.
  const head = await box(view.locator('[data-head]'));
  await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2);
  await expect.poll(() => shiftOf(face)).toBe(0);
  await expect(del).toBeHidden();
  // Nothing was deleted, the screen did not move on.
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(view).toBeVisible();

  // Open again and tap Delete: the set goes, the toast offers Undo; its row goes too.
  await swipe(page, row, -110);
  // The red part showing at the right (the row covers the rest of it).
  const d = await box(row.getByTestId('swipe-delete'));
  await row.getByTestId('swipe-delete').click({ position: { x: d.width - 40, y: d.height / 2 } });
  await expect(toast(page, 'Set deleted')).toBeVisible();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(view.getByTestId('set-todo')).toHaveCount(1);
  await expect.poll(async () => (await dbAll(page, 'sets')).length).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  await expect(view.getByTestId('set-todo')).toHaveCount(1);
  const after = (await dbAll<{ id: string; order: number }>(page, 'sets')).sort((a, b) => a.order - b.order);
  expect(after).toEqual(before);

  // A full swipe deletes on release, and Undo again restores exactly.
  await swipe(page, loggedRows(view).nth(1), -Math.round(page.viewportSize()!.width * 0.75));
  await expect(toast(page, 'Set deleted')).toBeVisible();
  await expect(loggedRows(view)).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(2);
  expect((await dbAll<{ id: string; order: number }>(page, 'sets')).sort((a, b) => a.order - b.order)).toEqual(before);
  await expect(page.getByTestId('live-stats')).toHaveText('2 sets · Total lifted 2,960 lb');
  expect(errors).toEqual([]);
});

test('long press a row: Remove set; a row still to do just goes, with Undo @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await squatWith(page, 1);
  await expect(view.getByTestId('set-todo')).toHaveCount(2);
  // Long press (hold without moving) on the last row still to do.
  const target = view.getByTestId('set-todo').last().getByTestId('set-type');
  const b = await box(target);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  const menu = page.getByRole('dialog', { name: 'Set type' });
  await expect(menu).toBeVisible();
  await menu.getByTestId('remove-set').tap();
  await expect(menu).toHaveCount(0);
  await expect(view.getByTestId('set-todo')).toHaveCount(1);
  await expect(toast(page, 'Set removed')).toBeVisible();
  // Nothing logged was touched.
  expect(await dbAll(page, 'sets')).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(2);
  expect(await dbAll(page, 'sets')).toHaveLength(1);

  // The same menu from a tap on the set number of a logged set: removed with Undo.
  await loggedRows(view).first().getByTestId('set-type').tap();
  await menu.getByTestId('remove-set').tap();
  await expect(toast(page, 'Set deleted')).toBeVisible();
  await expect(loggedRows(view)).toHaveCount(0);
  await expect(view.getByTestId('set-todo')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(view.getByTestId('set-todo')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('rest timer Off on one move of a pair: no countdown after it, the partner still rests @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 · Chest and triceps/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-incline-bench-press').tap();
  const first = exerciseView(page, 'barbell-incline-bench-press');
  await expect(first).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  // ⋯ → Rest timer Off.
  await first.getByRole('button', { name: 'More for Barbell Incline Bench Press' }).tap();
  const menu = page.getByRole('dialog', { name: 'Barbell Incline Bench Press options' });
  const sw = menu.getByRole('switch', { name: /Rest timer/ });
  await expect(sw).toBeChecked();
  await menu.getByTestId('rest-switch').locator('label').tap();
  await expect(sw).not.toBeChecked();
  await expect(menu).toContainText('Off. No countdown after a set');
  await expect.poll(async () => (await dbAll<{ exerciseId: string; restOff?: boolean }>(page, 'exerciseSettings')).find((s) => s.exerciseId === 'barbell-incline-bench-press')?.restOff).toBe(true);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await first.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  await checkCurrent(first).tap();
  await expect(loggedRows(first)).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  // The partner's ⋯ still has its own 90 s rest.
  await page.getByTestId('next-chip').getByRole('button', { name: /Incline Plate Press/ }).tap();
  const partner = exerciseView(page, 'incline-plate-press');
  await expect(partner).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  await partner.getByRole('button', { name: 'More for Incline Plate Press' }).tap();
  const partnerMenu = page.getByRole('dialog', { name: 'Incline Plate Press options' });
  await expect(partnerMenu.getByRole('switch', { name: /Rest timer/ })).toBeChecked();
  await expect(partnerMenu).toContainText('90 s after each set');
  await page.keyboard.press('Escape');
  await expect(partnerMenu).toHaveCount(0);

  // Back on the first move: turned on again, its next set rests 90 s.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await page.getByTestId('row-barbell-incline-bench-press').tap();
  await expect(first).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  await first.getByRole('button', { name: 'More for Barbell Incline Bench Press' }).tap();
  await menu.getByTestId('rest-switch').locator('label').tap();
  await expect(menu.getByRole('switch', { name: /Rest timer/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await checkCurrent(first).tap();
  await expect(loggedRows(first)).toHaveCount(2);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await expect(page.getByTestId('rest-clock')).toHaveText(/^1:(30|29|28)$/);
  // While the rest bar counts, the end of the page scrolls clear of it.
  const restTop = (await box(page.getByTestId('rest-timer'))).y;
  const end = await first.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    const kids = [...el.children].filter((c) => (c as HTMLElement).offsetHeight > 0 && getComputedStyle(c).position === 'static');
    return Math.max(...kids.map((c) => c.getBoundingClientRect().bottom));
  });
  expect(end).toBeLessThanOrEqual(restTop);
  expect(errors).toEqual([]);
});

test('Use this plan says Plan saved, with Undo @matrix', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'See plans' }).tap();
  await page.getByTestId('plan-five-day-split').tap();
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await expect(toast(page, 'Plan saved')).toBeVisible();
  expect(await dbAll(page, 'planState')).toHaveLength(1);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect.poll(async () => (await dbAll(page, 'planState')).length).toBe(0);
  await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
});

/*
 * Speed (PLAN 2.2d point 4). How it is measured:
 * - Chromium projects (Pixel 7, Galaxy compact, Small Android) run at 4x CPU throttling through CDP
 *   (Emulation.setCPUThrottlingRate), a mid range phone. WebKit has no CDP: the iPhone projects
 *   measure the same way at full speed.
 * - In the page, a capture listener notes performance.now() at the ✓'s pointerdown. A
 *   MutationObserver on the exercise view sees the row turn checked (data-sending while its write
 *   runs, or the logged row); two requestAnimationFrame callbacks later that frame has been painted. pointerdown to painted must be under 100 ms.
 * - Frames: a requestAnimationFrame loop records the gap between frames while the check animates
 *   and while a sheet opens; on Chromium no gap may pass 34 ms (at most one missed frame). WebKit's
 *   headless rAF ticks irregularly, so there the gaps are only logged.
 * - Layout shift: Chromium's layout-shift entries during the check must add up to 0.
 */
test('speed: a ✓ paints within 100 ms, no layout shift, smooth check and sheet @matrix', async ({ page, browserName }) => {
  const chromium = browserName === 'chromium';
  await page.goto('./');
  const view = await squatWith(page, 0);
  await expect(checkCurrent(view)).toBeEnabled();
  await page.waitForTimeout(800); // the muscles and tips mounted, the audio context warmed while idle
  if (chromium) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (w.__cls as number) += e.value;
      }).observe({ type: 'layout-shift' });
    } catch {
      /* WebKit: no layout-shift entries */
    }
  });
  const frames = {
    start: () =>
      page.evaluate(() => {
        const w = window as unknown as { __gaps: number[]; __run: number };
        w.__gaps = [];
        const run = (w.__run = (w.__run ?? 0) + 1);
        let last = 0;
        const loop = (t: number) => {
          if (w.__run !== run) return;
          if (last) w.__gaps.push(t - last);
          last = t;
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }),
    stop: () =>
      page.evaluate(() => {
        const w = window as unknown as { __gaps: number[]; __run: number };
        w.__run++;
        return Math.max(0, ...w.__gaps);
      }),
  };

  // The ✓ tap to its painted state.
  await page.evaluate(() => {
    const w = window as unknown as { __tap: { down: number; painted: number } };
    w.__tap = { down: 0, painted: 0 };
    document.addEventListener('pointerdown', () => (w.__tap.down = performance.now()), { capture: true, once: true });
    const main = document.querySelector('main')!;
    const before = main.querySelectorAll('[data-testid="set-row"]').length;
    // The ✓ state change: the row shows checked (sending, PLAN 2.2d) or the logged row is there.
    const mo = new MutationObserver(() => {
      if (!main.querySelector('[data-sending]') && main.querySelectorAll('[data-testid="set-row"]').length <= before) return;
      mo.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => (w.__tap.painted = performance.now())));
    });
    mo.observe(main, { subtree: true, childList: true, attributes: true });
  });
  await frames.start();
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __tap: { painted: number } }).__tap.painted)).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const checkGap = await frames.stop();
  const ms = await page.evaluate(() => {
    const t = (window as unknown as { __tap: { down: number; painted: number } }).__tap;
    return t.painted - t.down;
  });
  console.log(`${test.info().project.name}: ✓ painted in ${Math.round(ms)} ms, longest frame ${Math.round(checkGap)} ms`);
  expect(ms).toBeGreaterThan(0);
  expect(ms).toBeLessThan(100);
  if (chromium) {
    expect(checkGap).toBeLessThanOrEqual(34);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
  }

  // Opening a sheet.
  await page.getByRole('button', { name: 'Skip' }).tap();
  await page.waitForTimeout(300);
  await frames.start();
  await view.getByTestId('weight-cell').first().tap();
  await expect(weightSheet(page)).toBeVisible();
  await page.waitForTimeout(400);
  const sheetGap = await frames.stop();
  console.log(`${test.info().project.name}: sheet longest frame ${Math.round(sheetGap)} ms`);
  if (chromium) expect(sheetGap).toBeLessThanOrEqual(34);
});

test('transitions: the list tile and the hero share one name, sheets follow the finger @matrix', async ({ page }) => {
  const view = await openPlanExercise(page, 'barbell-back-squat');
  // The hero (or the compact tile on short screens) is the shared element the list tile grows into.
  const named = view.locator('[style*="view-transition-name"]');
  await expect(named).toHaveCount(1);
  expect(await named.evaluate((el) => (el as HTMLElement).style.viewTransitionName)).toBe('ex-hero');
  // Back: the tile of the exercise just left carries the name, so the hero shrinks into it.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const tile = page.getByTestId('row-barbell-back-squat').getByTestId('thumb');
  await expect.poll(() => tile.evaluate((el) => (el as HTMLElement).style.viewTransitionName)).toBe('ex-hero');
  await navIdle(page);

  // A sheet follows the finger down and closes past the threshold.
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(view).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  await view.getByTestId('weight-cell').first().tap();
  const sheet = weightSheet(page);
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(400);
  // The grabber (named Close): its lower part is on the sheet.
  const g = await box(sheet.getByRole('button', { name: 'Close' }));
  const x = g.x + g.width / 2;
  const y = g.y + g.height - 6;
  const top0 = (await box(sheet)).y;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y + i * 15);
  // Mid drag: the sheet moved with the finger.
  expect((await box(sheet)).y).toBeGreaterThan(top0 + 40);
  for (let i = 7; i <= 20; i++) await page.mouse.move(x, y + i * 25);
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
});

test('reduced motion: crossfades instead of movement @matrix', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const view = await squatWith(page, 1);
  // The checked row fades in (no fill from the left, no pop).
  const face = loggedRows(view).first().locator('[data-state="logged"]');
  expect(await face.evaluate((el) => getComputedStyle(el, '::before').animationName)).toMatch(/fade/);
  expect(await face.locator('[class*="checkDone"]').evaluate((el) => getComputedStyle(el).animationName)).toMatch(/fade/);
  // The swipe still follows the finger (direct), but snaps without a slide.
  await swipe(page, loggedRows(view).first(), -110);
  await expect(loggedRows(view).first().getByTestId('swipe-delete')).toBeVisible();
  expect(await face.evaluate((el) => (el as HTMLElement).style.transition)).toBe('none');
  // The muscles card arrives without movement (opacity only).
  const card = view.getByTestId('muscle-card');
  const anim = await card.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toMatch(/arrive|none/);
});
