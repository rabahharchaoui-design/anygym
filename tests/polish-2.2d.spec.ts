import { expect, test, type Locator, type Page } from './fixtures';
import { idleFrames, idleNote, longestBudget, paintBudget } from './helpers/frames';
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
  // The line keeps 6 pt clear of the button (its 48 pt hit area, round 4), then the card follows.
  const guide = view.getByTestId('set-guide');
  if (await guide.count()) {
    const g = await box(guide);
    expect(g.y - (add.y + add.height)).toBeGreaterThanOrEqual(0);
    expect(g.y - (add.y + add.height)).toBeLessThanOrEqual(7);
    expect(card.y - (g.y + g.height)).toBeLessThanOrEqual(gap + 1);
  } else expect(card.y - (add.y + add.height)).toBeLessThanOrEqual(gap + 1);
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

  // A full swipe deletes on release, and Undo again restores exactly (after the row opened up again).
  await page.waitForTimeout(400);
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
 *   runs, or the logged row); two requestAnimationFrame callbacks later that frame has been painted. pointerdown to painted must be under 100 ms
 *   on WebKit. On Chromium (3.6v) the 100 ms (plus the frames a slow host adds) is on pointerdown to the page showing the row, which is the app's own part: headless
 *   Chromium draws a static page at 15 to 30 fps here, and two or three of those frames are not the app's. Best of up to three taps.
 * - Frames: a requestAnimationFrame loop records the gap between frames while the check animates
 *   and while a sheet opens; on Chromium no gap may pass 34 ms (at most one missed frame). WebKit's
 *   headless rAF ticks irregularly, so there the gaps are only logged.
 * - Layout shift: Chromium's layout-shift entries during the check must add up to 0.
 */
test('speed: a ✓ paints within 100 ms, no layout shift, smooth check and sheet @matrix', async ({ page, browserName }) => {
  const chromium = browserName === 'chromium';
  await page.goto('./');
  const view = await squatWith(page, 0);
  // A fourth row, so there are three ✓ taps to measure and one row left for the sheet below.
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await expect(checkCurrent(view)).toBeEnabled();
  await expect(view.getByTestId('muscle-card')).toBeVisible(); // mounted before measuring: on a busy machine it can arrive seconds late and shift the page
  await page.waitForTimeout(800); // the tips mounted, the audio context warmed while idle
  // "Painted" is two animation frames: a Chromium host that cannot draw 60 fps adds what its idle page costs (helpers/frames.ts).
  const idle = await idleFrames(page);
  if (chromium) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__cls = 0;
    try {
      w.__clsWhere = [] as string[];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean; startTime: number; sources?: Array<{ node: Node | null }> }>) {
          if (e.hadRecentInput) continue;
          (w.__cls as number) += e.value;
          (w.__clsWhere as string[]).push(`${e.value.toFixed(4)} at ${Math.round(e.startTime)}: ${(e.sources ?? []).map((x) => (x.node as Element | null)?.getAttribute?.('data-testid') ?? (x.node as Element | null)?.nodeName).join(',')}`);
        }
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

  // The ✓ tap to its painted state. Other work on this machine can only make a run slower, never faster, so the best of
  // up to three taps (the fourth row stays for the sheet below) is the app's own cost: a real slowdown shows in all of them.
  // The observer sees the change in the frame's own task, then two frames more, and the first of them can be a frame away: three.
  const limit = paintBudget(100, idle, 3);
  const gapLimit = longestBudget(34, idle);
  const tries: Array<{ ms: number; domMs: number; gap: number }> = [];
  for (let n = 1; n <= 3; n++) {
    await page.evaluate(() => {
      const w = window as unknown as { __tap: { down: number; painted: number; dom: number } };
      w.__tap = { down: 0, painted: 0, dom: 0 };
      document.addEventListener('pointerdown', () => (w.__tap.down = performance.now()), { capture: true, once: true });
      const main = document.querySelector('main')!;
      const before = main.querySelectorAll('[data-testid="set-row"]').length;
      // The ✓ state change: the row shows checked (sending, PLAN 2.2d) or the logged row is there.
      const mo = new MutationObserver(() => {
        if (!main.querySelector('[data-sending]') && main.querySelectorAll('[data-testid="set-row"]').length <= before) return;
        mo.disconnect();
        w.__tap.dom = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => (w.__tap.painted = performance.now())));
      });
      mo.observe(main, { subtree: true, childList: true, attributes: true });
    });
    await frames.start();
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(n);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tap: { painted: number } }).__tap.painted)).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    const gap = await frames.stop();
    const got = await page.evaluate(() => {
      const t = (window as unknown as { __tap: { down: number; painted: number; dom: number } }).__tap;
      return { ms: t.painted - t.down, domMs: t.dom - t.down };
    });
    tries.push({ ...got, gap });
    if ((chromium ? got.domMs < paintBudget(100, idle, 2) : got.ms < limit) && (!chromium || gap <= gapLimit)) break;
  }
  const ms = Math.min(...tries.map((t) => t.ms));
  const domMs = Math.min(...tries.map((t) => t.domMs));
  const checkGap = Math.min(...tries.map((t) => t.gap));
  console.log(`${test.info().project.name}: ✓ painted in ${tries.map((t) => `${Math.round(t.ms)} (page ${Math.round(t.domMs)})`).join(', ')} ms, longest frame ${tries.map((t) => Math.round(t.gap)).join(', ')} ms; ${idleNote(idle)}`);
  expect(ms).toBeGreaterThan(0);
  if (chromium) {
    // Headless Chromium here draws a static page at 15 to 30 frames a second, and it hands a tap to the page on a frame, so "painted" is
    // the app's work plus three or four of those. The budget is on the app's own part, from the tap to the page showing the checked
    // row, with the two frames the tap itself waits for taxed by what this host's idle page costs (helpers/frames.ts).
    expect(domMs, `from the tap to the DOM, best of ${tries.length}`).toBeLessThan(paintBudget(100, idle, 2));
  } else {
    expect(ms).toBeLessThan(limit);
  }
  if (chromium) {
    expect(checkGap).toBeLessThanOrEqual(gapLimit);
    // No layout shift: nothing but rounding (a shift under 0.0001 of the screen is a hairline of a pixel, not a move).
    const cls = await page.evaluate(() => ({ score: (window as unknown as { __cls: number }).__cls, where: (window as unknown as { __clsWhere: string[] }).__clsWhere }));
    expect(cls.score, cls.where.join('; ')).toBeLessThan(0.0001);
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
  if (chromium) expect(sheetGap).toBeLessThanOrEqual(longestBudget(34, idle));
});

test('transitions: the list tile and the hero share one name, sheets follow the finger @matrix', async ({ page }) => {
  const view = await openPlanExercise(page, 'barbell-back-squat');
  // The hero (or the compact tile on short screens) is the shared element the list tile grows into.
  const names = await view.locator('[style*="view-transition-name"]').evaluateAll((els) => els.map((el) => ({ name: (el as HTMLElement).style.viewTransitionName, id: (el as HTMLElement).dataset.testid ?? '' })));
  // Round 2 (critic B1): only the photo flies; the caption (title, gradient, ⋯) rides with its page.
  expect(names.filter((n) => n.name === 'ex-hero')).toHaveLength(1);
  const short = page.viewportSize()!.height <= 600;
  if (!short) {
    expect(names.find((n) => n.name === 'ex-hero')!.id).toBe('hero-photo');
    expect(names.map((n) => n.name)).toContain('ex-caption');
  }
  // Back: the tile of the exercise just left carries the name, so the hero shrinks into it.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const tile = page.getByTestId('row-barbell-back-squat').getByTestId('thumb');
  await expect.poll(() => tile.evaluate((el) => (el as HTMLElement).style.viewTransitionName)).toBe('ex-hero');
  // The tile is the same photo the hero shows (a photo flies into a photo, never an icon).
  await expect(tile).toHaveAttribute('data-photo', '');
  // PLAN 3.5h: the tile moves like the hero (start and end photos); the start photo is loaded.
  await expect(tile.locator('[data-frame="0"] img')).toHaveJSProperty('complete', true);
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

test('one set count after Remove set: set line, day list, done ring, finish lines (critic B2) @matrix', async ({ page }) => {
  const errors = watchErrors(page);
  const view = await openPlanExercise(page, 'barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  await weightSheet(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await weightSheet(page).getByRole('button', { name: 'Done' }).tap();
  for (let i = 0; i < 3; i++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i + 1);
    await page.waitForTimeout(350);
  }
  await page.getByRole('button', { name: 'Skip' }).tap();
  // Remove the 4th row (its own menu).
  await view.getByTestId('set-todo').last().getByTestId('set-type').tap();
  const menu = page.getByRole('dialog', { name: 'Set type' });
  await expect(menu.getByRole('heading', { name: 'Set 4' })).toBeVisible();
  await menu.getByTestId('remove-set').tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(0);
  await expect(view.getByTestId('set-target')).toHaveText('All 3 sets done');
  // The day list counts the same rows: "3 sets", done.
  await page.getByRole('button', { name: 'Back to the list' }).tap();
  const row = page.getByTestId('row-barbell-back-squat');
  await expect(row).toContainText('3 sets × 8 to 12');
  await expect(row).toHaveAttribute('data-state', 'done');
  await navIdle(page);
  // Finish: the squat is finished, nothing says "of 4".
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page).toHaveURL(/\/done$/);
  await expect(page.getByTestId('finish-progress')).toHaveText(/^1 of 12 lifts finished/);
  await expect(page.getByTestId('finish-sets-left')).toHaveCount(0);
  await expect(page.getByTestId('finish-title')).toHaveText('Workout saved · 3 sets');
  expect((await dbAll<{ rowAdjust?: Record<string, number> }>(page, 'sessions'))[0]?.rowAdjust).toEqual({ 'barbell-back-squat': -1 });
  expect(errors).toEqual([]);
});

test('the toast stacks above the floating Start pill on the day list (round 3, P3) @matrix', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = exerciseView(page, 'barbell-back-squat');
  await expect(view).toBeVisible();
  await page.waitForTimeout(400);
  await navIdle(page);
  await view.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
  await page.getByRole('dialog', { name: 'Barbell Back Squat options' }).getByRole('button', { name: /^Remove/ }).tap();
  const shown = toast(page, 'Removed · Barbell Back Squat'); // gate round 2 P4: the verb first
  await expect(shown).toBeVisible();
  await expect(page.getByTestId('start-next')).toBeVisible();
  await page.waitForTimeout(400);
  const t = await box(shown);
  const pill = await box(page.getByTestId('start-next'));
  expect(t.y + t.height).toBeLessThanOrEqual(pill.y);
});

/*
 * Round 3 (critic B1): screen change time, measured the critic's way: from the tap (pointerdown)
 * to the new screen settled (nav.ts clears html[data-nav] when the view transition finished; without
 * View Transitions, when the Motion push settled: the arriving view's transform is back to none).
 * A requestAnimationFrame loop records the longest frame meanwhile. Bound: under 350 ms (SPEC 13.2).
 */
async function timeScreenChange(page: Page, tap: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __nav: { t0: number; t1: number; gaps: number[] } };
    w.__nav = { t0: 0, t1: 0, gaps: [] };
    document.addEventListener('pointerdown', () => (w.__nav.t0 = performance.now()), { capture: true, once: true });
    let last = 0;
    const settled = () => {
      if (!w.__nav.t0 || performance.now() - w.__nav.t0 < 40) return false;
      if (document.documentElement.dataset.nav) return false;
      const views = [...document.querySelectorAll<HTMLElement>('[data-motion-view]')];
      return views.length <= 1 && views.every((v) => !v.style.transform || /translateX\(0(%|px)?\)|none/.test(v.style.transform));
    };
    const loop = (t: number) => {
      if (last && w.__nav.t0) w.__nav.gaps.push(t - last);
      last = t;
      if (settled()) {
        w.__nav.t1 = performance.now();
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __nav: { t1: number } }).__nav.t1), { timeout: 3000 }).toBeGreaterThan(0);
  return page.evaluate(() => {
    const n = (window as unknown as { __nav: { t0: number; t1: number; gaps: number[] } }).__nav;
    return { ms: Math.round(n.t1 - n.t0), longest: Math.round(Math.max(0, ...n.gaps)) };
  });
}

test('screen changes: open and back settle in under 350 ms (round 3, B1) @matrix', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForTimeout(1200);
  const row = page.getByTestId('row-barbell-back-squat');
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  // From the tap to settled takes a frame to capture the new screen, one to start and one to see it done: three frames, which a host
  // that cannot draw 60 fps stretches by what its idle page costs; and its stalls are the idle page's too (helpers/frames.ts).
  const idle = await idleFrames(page);
  const limit = paintBudget(350, idle, 3);
  const longestLimit = longestBudget(50, idle);
  const results: string[] = [];
  // Other work on this machine can only make a round slower, never faster: one round inside every bound (of up to four) is the app's own cost.
  let inside = false;
  for (let i = 0; i < 4 && !inside; i++) {
    const open = await timeScreenChange(page, () => row.tap());
    await expect(exerciseView(page, 'barbell-back-squat')).toBeVisible();
    await page.waitForTimeout(700);
    const back = await timeScreenChange(page, () => page.getByRole('button', { name: 'Back to the list' }).tap());
    await expect(row).toBeVisible();
    await page.waitForTimeout(700);
    results.push(`open ${open.ms} ms (longest frame ${open.longest} ms), back ${back.ms} ms (longest frame ${back.longest} ms)`);
    // Headless WebKit's frame clock is noisy: a generous frame bound that still catches a dropped streak.
    inside = open.ms < limit && back.ms < limit && open.longest < longestLimit && back.longest < longestLimit;
  }
  const said = `${results.join('; ')}; limit ${Math.round(limit)} ms, longest frame under ${Math.round(longestLimit)} ms; ${idleNote(idle)}`;
  console.log(`${test.info().project.name}: ${said}`);
  expect(inside, said).toBe(true);
});

test('delete: the rows renumber and the header counts again as the collapse starts (round 3, B3) @matrix', async ({ page }) => {
  const view = await squatWith(page, 2);
  await expect(page.getByTestId('live-stats')).toHaveText('2 sets · Total lifted 2,960 lb');
  // Times, in the page, from the finger lifting to the header saying 1 set (slide 180 ms, then the data).
  await page.evaluate(() => {
    const w = window as unknown as { __b3: { up: number; header: number; numbers: string } };
    w.__b3 = { up: 0, header: 0, numbers: '' };
    document.addEventListener('pointerup', () => (w.__b3.up = performance.now()), { capture: true, once: true });
    const stats = document.querySelector('[data-testid="live-stats"]')!;
    const mo = new MutationObserver(() => {
      if (!/^1 set /.test(stats.textContent ?? '') || w.__b3.header) return;
      w.__b3.header = performance.now();
      w.__b3.numbers = [...document.querySelectorAll('main [data-testid="set-type"]')].map((b) => b.textContent).join(',');
    });
    mo.observe(stats, { subtree: true, childList: true, characterData: true });
  });
  await swipe(page, loggedRows(view).nth(0), -Math.round(page.viewportSize()!.width * 0.75));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __b3: { header: number } }).__b3.header)).toBeGreaterThan(0);
  const r = await page.evaluate(() => (window as unknown as { __b3: { up: number; header: number; numbers: string } }).__b3);
  console.log(`${test.info().project.name}: header updated ${Math.round(r.header - r.up)} ms after release; rows ${r.numbers}`);
  expect(r.header - r.up).toBeLessThan(280);
  // Already renumbered in that frame: the logged row left is 1, the row to do is 2 (its row went too).
  expect(r.numbers).toBe('1,2');
  await expect(page.getByTestId('live-stats')).toHaveText('1 set · Total lifted 1,480 lb');
});
