// PLAN 2.2e: the premium foundation (motion, shared components, the live PR badge and the finish
// lead line) and its speed budget on WebKit; round 2 covers the critic's B1 to B6 and the Codex review.
import { expect, test, type Locator, type Page } from './fixtures';
import { bar185, checkCurrent, exerciseView, fillReps, loggedRows, navIdle, pickExercises, seedFinished, usePlan, watchErrors } from './workout-helpers';

const SHOTS = 'reports/shots/2.2e';
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name.replace(/ /g, '-')}-${name}.png` });
};
const box = async (l: Locator) => (await l.boundingBox())!;

/**
 * Nothing moved: each box equals its earlier value within half a pixel, once the press feedback has
 * eased back (Chromium reports the 160 ms release scale in sub pixels for a moment).
 */
const near = (a: unknown, b: unknown): boolean => JSON.stringify(a, (_k, v) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v)) === JSON.stringify(b, (_k, v) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v));
async function unmoved<T>(read: () => Promise<T>, expected: T) {
  await expect.poll(async () => near(await read(), expected), { timeout: 2000 }).toBe(true);
}

/**
 * Frame budgets are proven on WebKit (PLAN 2.2e point 4: the iPhone projects). The Chromium Android
 * emulations and their CPU noise only log their numbers (the 2.2d spec holds Chromium to its own,
 * throttled budget).
 */
const isWebKit = () => test.info().project.use.browserName === 'webkit';

/** Records the gaps between animation frames until stopped; returns the longest gap in ms. */
const frames = (page: Page) => ({
  start: () =>
    page.evaluate(() => {
      const w = window as unknown as { __fg: { gaps: number[]; run: boolean } };
      w.__fg = { gaps: [], run: true };
      let last = 0;
      const loop = (t: number) => {
        if (!w.__fg.run) return;
        if (last) w.__fg.gaps.push(t - last);
        last = t;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }),
  stop: () =>
    page.evaluate(() => {
      const w = window as unknown as { __fg: { gaps: number[]; run: boolean } };
      w.__fg.run = false;
      return Math.round(Math.max(0, ...w.__fg.gaps));
    }),
});

/**
 * The critic's way (round 3): frame gaps from the tap's pointerdown for 700 ms. Arm before the tap;
 * read after. The first gap is from the pointerdown to the next frame.
 */
const fromTap = (page: Page) => ({
  arm: () =>
    page.evaluate(() => {
      const w = window as unknown as { __tg: number[] };
      w.__tg = [];
      document.addEventListener(
        'pointerdown',
        () => {
          let last = performance.now();
          const t0 = last;
          const loop = (t: number) => {
            w.__tg.push(t - last);
            last = t;
            if (t - t0 < 700) requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        },
        { capture: true, once: true },
      );
    }),
  longest: async () => {
    await expect.poll(() => page.evaluate(() => (window as unknown as { __tg: number[] }).__tg.length)).toBeGreaterThan(20);
    await page.waitForTimeout(750);
    return page.evaluate(() => Math.round(Math.max(0, ...(window as unknown as { __tg: number[] }).__tg)));
  },
});

async function openUi(page: Page) {
  await page.goto('./?dev#/dev/ui');
  await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible();
  await page.waitForTimeout(300);
}

/** pointerdown to the first painted frame where `changed()` holds (two rAFs after it is seen). */
async function pressToPaint(page: Page, target: Locator, probe: string, act: () => Promise<void>) {
  await target.evaluate((el, src) => {
    const w = window as unknown as { __p: { down: number; painted: number } };
    w.__p = { down: 0, painted: 0 };
    // eslint-disable-next-line no-new-func
    const changed = new Function('el', src) as (el: Element) => boolean;
    document.addEventListener(
      'pointerdown',
      () => {
        w.__p.down = performance.now();
        const loop = () => {
          if (changed(el)) requestAnimationFrame(() => requestAnimationFrame(() => (w.__p.painted = performance.now())));
          else requestAnimationFrame(loop);
        };
        loop();
      },
      { capture: true, once: true },
    );
  }, probe);
  await act();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __p: { painted: number } }).__p.painted)).toBeGreaterThan(0);
  return page.evaluate(() => {
    const p = (window as unknown as { __p: { down: number; painted: number } }).__p;
    return p.painted - p.down;
  });
}

test.describe('components (#/dev/ui)', () => {
  test('SlidingToggle: one lime pill slides between two or three options, 48 pt, keyboard, no layout shift @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await openUi(page);
    const two = page.getByTestId('toggle-2');
    const three = page.getByTestId('toggle-3');
    await expect(two.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true');
    for (const r of await page.getByRole('radio').all()) expect((await box(r)).height).toBeGreaterThanOrEqual(48);
    const before = await Promise.all((await three.getByRole('radio').all()).map(box));
    const pill = three.locator('[data-pill]');
    const x0 = (await box(pill)).x;
    await three.getByRole('radio', { name: 'meters' }).tap();
    await expect(three.getByRole('radio', { name: 'meters' })).toHaveAttribute('aria-checked', 'true');
    await expect(three.getByRole('radio', { name: 'km' })).toHaveAttribute('aria-checked', 'false');
    // The pill moved under the pick; the options did not move (a transform, not a relayout).
    await expect.poll(async () => Math.round((await box(pill)).x - x0)).toBeGreaterThan(100);
    const meters = await box(three.getByRole('radio', { name: 'meters' }));
    await expect.poll(async () => Math.abs((await box(pill)).x - meters.x)).toBeLessThan(2);
    await unmoved(async () => Promise.all((await three.getByRole('radio').all()).map(box)), before);
    // Independent instances: the 2 option one is unchanged.
    await expect(two.getByRole('radio', { name: 'lb' })).toHaveAttribute('aria-checked', 'true');
    // Arrow keys move the pick (radiogroup).
    await two.getByRole('radio', { name: 'lb' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(two.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
    await expect(two.getByRole('radio', { name: 'kg' })).toBeFocused();
    // Disabled: grey, no change.
    const off = page.getByTestId('toggle-off');
    await expect(off.getByRole('radio', { name: 'Off' })).toBeDisabled();
    await page.waitForTimeout(300);
    await expect(three).toHaveScreenshot('toggle-3.png', { maxDiffPixelRatio: 0.02 });
    expect(errors).toEqual([]);
  });

  test('ChoiceCard: icon, label, ring that fills; lime border when picked; BottomCTA grey until valid @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await openUi(page);
    const cards = page.getByTestId('choice-cards');
    const cta = page.getByTestId('cta');
    const go = cta.getByRole('button', { name: 'Continue' });
    // Nothing picked: the button is grey and says why, the honest local line under it.
    await expect(go).toBeDisabled();
    await expect(cta.getByRole('note')).toHaveText('Pick a goal first');
    // In the thumb zone: pinned to the bottom of the screen.
    const vh = page.viewportSize()!.height;
    expect((await box(go)).y + (await box(go)).height).toBeGreaterThan(vh * 0.8);
    await shot(page, 'choice-none');
    const goBefore = await box(go);
    const card = cards.getByRole('button', { name: /Build muscle/ });
    expect((await box(card)).height).toBeGreaterThanOrEqual(48);
    const fill = card.locator('[data-ring] > span');
    expect(await fill.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await card.tap();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(cards.getByRole('button', { name: /Get stronger/ })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => fill.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await card.evaluate((el) => getComputedStyle(el).borderColor)).toBe('rgb(212, 255, 58)');
    await expect(go).toBeEnabled();
    await expect(cta.getByRole('note')).toHaveCount(0);
    // Round 2 (critic B2): the reason and the quiet note swap in one reserved line; the button never moves.
    await expect(cta.getByText('Stays on this phone.')).toBeVisible();
    await unmoved(() => box(go), goBefore);
    await page.waitForTimeout(300);
    await expect(cards).toHaveScreenshot('choice-picked.png', { maxDiffPixelRatio: 0.02 });
    await shot(page, 'choice-picked');
    // The CTA works: here it clears the pick, and goes grey again.
    await go.tap();
    await expect(go).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('Toast with Undo: one Undo look, 48 pt, fires once @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await openUi(page);
    await page.getByRole('button', { name: 'Delete a set' }).tap();
    const toast = page.getByRole('status').filter({ hasText: 'Set deleted' });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(450); // the entrance spring settled (it starts at 0.97)
    const undo = toast.getByRole('button', { name: 'Undo' });
    expect((await box(undo)).height).toBeGreaterThanOrEqual(48);
    await expect(undo).toHaveAttribute('data-undo', 'true');
    // Above the bottom button, never over it.
    const t = await box(toast);
    expect(t.y + t.height).toBeLessThanOrEqual((await box(page.getByTestId('cta'))).y + 1);
    await shot(page, 'toast-undo');
    await undo.tap();
    await expect(toast).toHaveCount(0);
    await expect(page.getByTestId('undone')).toHaveText('Undone 1');
    expect(errors).toEqual([]);
  });

  test('PRBadge springs in on a row without moving it; AppMarkLoader draws the mark after 400 ms @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await openUi(page);
    const row = page.getByTestId('pr-row');
    // Each cell relative to its row (a tap may scroll the page): nothing in the row moves.
    const cells = async () => {
      const r = await box(row);
      return Promise.all((await row.locator('span.num').all()).map(async (c) => {
        const b = await box(c);
        return { x: b.x - r.x, y: b.y - r.y, w: b.width, h: b.height };
      }));
    };
    const before = await cells();
    await page.getByRole('button', { name: 'Log a best set' }).tap();
    const badge = row.getByTestId('pr-badge');
    // PLAN 3.8b: the chip reads "New best" (SPEC 23), was "PR".
    await expect(badge).toHaveText('New best');
    const chipEl = badge.locator('[data-chip]');
    expect(await chipEl.evaluate((el) => getComputedStyle(el).animationName)).toMatch(/pr-in/);
    expect(await chipEl.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(212, 255, 58)');
    // Round 2 (critic B3): a real chip, 20 to 22 pt tall with 12 pt text, after the reps; the row pulses once.
    expect(await row.getAttribute('data-pr-fresh')).toBe('');
    await page.waitForTimeout(400); // sprung in
    const b = await box(chipEl);
    // PLAN 3.8b: "New best" on two short lines (26 pt tall, 10 pt text) so the columns keep their room.
    expect(b.height).toBeGreaterThanOrEqual(20);
    expect(b.height).toBeLessThanOrEqual(27);
    expect(parseFloat(await chipEl.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(10);
    const reps = await box(row.locator('span.num').nth(2));
    expect(b.x).toBeGreaterThan(reps.x);
    await unmoved(cells, before);
    await page.waitForTimeout(400);
    await expect(row).toHaveScreenshot('pr-row.png', { maxDiffPixelRatio: 0.02 });
    // 48 pt to tap (SPEC 13.3); it says what it beat, in one line.
    const hit = await box(badge);
    expect(hit.height).toBeGreaterThanOrEqual(48);
    expect(hit.width).toBeGreaterThanOrEqual(48);
    await badge.tap();
    await expect(page.getByTestId('pr-popover')).toHaveText('New best: beat 185 lb × 5 from Sat');
    await shot(page, 'pr-popover');
    await page.getByRole('heading', { name: 'Components' }).tap();
    await expect(page.getByTestId('pr-popover')).toHaveCount(0);
    await expect.poll(() => row.getAttribute('data-pr-fresh')).toBeNull();
    // The loader: invisible before 400 ms, then the mark is drawn.
    await page.getByRole('button', { name: 'Replay' }).tap();
    const loader = page.getByRole('status', { name: 'Loading preview' });
    expect(Number(await loader.evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
    await page.waitForTimeout(1400);
    expect(await loader.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await loader.locator('path').first().evaluate((el) => Number(getComputedStyle(el).strokeDashoffset.replace('px', '')))).toBeLessThan(0.01);
    await loader.scrollIntoViewIfNeeded();
    await shot(page, 'loader');
    expect(errors).toEqual([]);
  });

  test('reduced motion: the pill and the ring change without movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openUi(page);
    expect(await page.getByTestId('toggle-2').locator('[data-pill]').evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
    await page.getByTestId('choice-cards').getByRole('button', { name: /Get stronger/ }).tap();
    const fill = page.getByTestId('choice-cards').getByRole('button', { name: /Get stronger/ }).locator('[data-ring] > span');
    expect(await fill.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });
});

test.describe('PR badge in the workout and the finish lead line', () => {
  async function squatSet(page: Page, view: Locator, reps: number, n: number) {
    const row = view.getByTestId('set-todo').first();
    await fillReps(view, row, reps);
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(n);
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible()) await skip.tap({ timeout: 2000 }).catch(() => undefined); // it may leave with the last set
  }

  async function quickSquat(page: Page) {
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view).toBeVisible();
    // 185 lb on the first row (it may already be there from last time).
    const cell = view.getByTestId('weight-cell').first();
    if ((await cell.innerText()).trim() !== '185') {
      await cell.tap();
      const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
      await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
      await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
      await sheet.getByRole('button', { name: 'Done' }).tap();
    }
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
    return view;
  }

  test('beats the best: the row shows PR, a tie does not; Finish leads with it @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
    await page.reload();
    const view = await quickSquat(page);
    await squatSet(page, view, 6, 1);
    const first = loggedRows(view).first();
    await expect(first.getByTestId('pr-badge')).toBeVisible();
    await expect(first.getByRole('button', { name: /personal record/ })).toBeVisible();
    // After the reps, before Done (critic B3); a tap says what it beat, from the real history.
    const chip = await box(first.getByTestId('pr-badge').locator('[data-chip]'));
    const amount = await box(first.getByTestId('saved-amount'));
    expect(chip.x).toBeGreaterThan(amount.x);
    // 3.8b round 2: the chip has its own slot at the end of the middle button (the reps column gives it room), so
    // it may sit past the reps cell; it still ends before the Done check.
    const done = await box(first.locator('[class*="checkDone"]'));
    expect(chip.x + chip.width).toBeLessThanOrEqual(done.x + 1);
    // The chip never covers the reps number, two digits included (the 320 floor).
    const digits = await first.getByTestId('saved-amount').evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    expect(digits).toBeLessThanOrEqual(chip.x);
    await shot(page, 'workout-pr');
    await first.getByTestId('pr-badge').tap();
    await expect(page.getByTestId('pr-popover')).toHaveText(/^New best: beat 185 lb × 5 from [A-Z][a-z]{2}$/);
    // Gate P9: the same day style as "Last time (Sun)".
    await shot(page, 'workout-pr-popover');
    await view.locator('[data-head]').tap(); // a tap anywhere else closes it
    await expect(page.getByTestId('pr-popover')).toHaveCount(0);
    // The same 185 × 6 again ties: no badge.
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
    await squatSet(page, view, 6, 2);
    await page.waitForTimeout(400);
    await expect(loggedRows(view).nth(1).getByTestId('pr-badge')).toHaveCount(0);
    await expect(view.getByTestId('pr-badge')).toHaveCount(1);
    // 185 × 7 beats this workout's own 185 × 6: "from earlier today" (round 3, critic P5).
    await squatSet(page, view, 7, 3);
    const third = loggedRows(view).nth(2).getByTestId('pr-badge');
    await expect(third).toBeVisible();
    await page.waitForTimeout(400);
    await third.tap();
    await expect(page.getByTestId('pr-popover')).toHaveText('New best: beat 185 lb × 6 from earlier today');
    // A tap anywhere else closes it (the view may be returning to the list after the last set).
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await expect(page.getByTestId('pr-popover')).toHaveCount(0);
    // Back to the list (the last set may already have taken it there) and in again: the badge is
    // still there (and does not replay).
    const back = page.getByRole('button', { name: 'Back to the list' });
    if (await back.isVisible()) await back.tap({ timeout: 2000 }).catch(() => undefined);
    await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
    await navIdle(page);
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(loggedRows(view).first().getByTestId('pr-badge')).toBeVisible();
    expect(await loggedRows(view).first().getByTestId('pr-badge').getAttribute('data-fresh')).toBeNull();
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page).toHaveURL(/\/done$/);
    const win = page.getByTestId('finish-win');
    // Two lines (critic P8): the exercise, then what it did.
    const name = win.getByText('Barbell Back Squat', { exact: true });
    const detail = win.getByText('185 lb × 7, your best yet', { exact: true });
    await expect(detail).toBeVisible();
    expect((await box(detail)).y).toBeGreaterThan((await box(name)).y);
    // It leads: above the numbers.
    expect((await box(win)).y).toBeLessThan((await box(page.getByTestId('finish-duration'))).y);
    // One order everywhere (critic B4): weight × reps; New bests never repeats the lead.
    // The count, then the best set (round 3, critic P6).
    await expect(page.getByTestId('finish-exercise')).toContainText('3 sets · 185 lb × 7');
    // One size for the three stat tiles (round 3, critic P4), never under 22 pt.
    const sizes = await page.locator('[data-testid="finish-duration"], [data-testid="finish-sets"], [data-testid="finish-total"]').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(new Set(sizes).size).toBe(1);
    expect(sizes[0]).toBeGreaterThanOrEqual(22);
    await page.waitForTimeout(900);
    await expect(page.getByTestId('pr-chip')).toHaveCount(0);
    await shot(page, 'finish-win');
    expect(errors).toEqual([]);
  });

  test('two digit reps: the chip sits after "12", never over it (the 320 floor too) @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] });
    await page.reload();
    const view = await quickSquat(page);
    await squatSet(page, view, 12, 1);
    const first = loggedRows(view).first();
    const chip = first.getByTestId('pr-badge').locator('[data-chip]');
    await expect(chip).toBeVisible();
    await page.waitForTimeout(400);
    const c = await box(chip);
    const digits = await first.getByTestId('saved-amount').evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right;
    });
    expect(await first.getByTestId('saved-amount').innerText()).toBe('12');
    expect(digits).toBeLessThanOrEqual(c.x);
    // And the chip stays out of the Done column.
    expect(c.x + c.width).toBeLessThanOrEqual((await box(first.locator('[class*="checkDone"]'))).x + 1);
    await shot(page, 'workout-pr-12');
    expect(errors).toEqual([]);
  });

  test('first ever session: no badge, a plain honest finish @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    const view = await quickSquat(page);
    await squatSet(page, view, 8, 1);
    await squatSet(page, view, 10, 2);
    await page.waitForTimeout(500);
    await expect(view.getByTestId('pr-badge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page.getByTestId('finish-title')).toHaveText('Workout saved');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('finish-win')).toHaveCount(0);
    await expect(page.getByTestId('pr-chip')).toHaveCount(0);
    await shot(page, 'finish-plain');
    expect(errors).toEqual([]);
  });
});

test.describe('speed budget (PLAN 2.2e point 4)', () => {
  test('press feedback under 100 ms: button, choice card, toggle @matrix', async ({ page }) => {
    await openUi(page);
    const card = page.getByTestId('choice-cards').getByRole('button', { name: /Train regularly/ });
    const ms1 = await pressToPaint(page, card, "return el.getAttribute('aria-pressed') === 'true'", () => card.tap());
    const opt = page.getByTestId('toggle-3').getByRole('radio', { name: 'miles' });
    const ms2 = await pressToPaint(page, opt, "return el.getAttribute('aria-checked') === 'true'", () => opt.tap());
    // The primary button's own press state (scale 0.97 while the finger is down).
    const go = page.getByTestId('cta').getByRole('button', { name: 'Continue' });
    const b = await box(go);
    const ms3 = await pressToPaint(page, go, "return getComputedStyle(el).transform !== 'none'", async () => {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
    });
    await page.mouse.up();
    console.log(`${test.info().project.name}: press to paint: card ${Math.round(ms1)} ms, toggle ${Math.round(ms2)} ms, button ${Math.round(ms3)} ms`);
    for (const ms of [ms1, ms2, ms3]) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(100);
    }
  });

  test('a recorded push and pop: the shared page transition, no dropped frames, nothing shifts @matrix', async ({ page }) => {
    await usePlan(page);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.waitForTimeout(1200);
    const row = page.getByTestId('row-barbell-back-squat');
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const record = () =>
      page.evaluate(() => {
        const w = window as unknown as { __rec: { gaps: number[]; scales: number[]; kinds: string[]; run: boolean } };
        w.__rec = { gaps: [], scales: [], kinds: [], run: true };
        // Which page transition ran: View Transitions mark html[data-nav]; the Motion fallback
        // (no View Transitions) moves [data-motion-view] layers with inline transforms.
        const scan = () => {
          const kind = document.documentElement.dataset.nav;
          if (kind) w.__rec.kinds.push(kind);
          for (const v of document.querySelectorAll<HTMLElement>('[data-motion-view]')) {
            const m = /scale\(([\d.]+)\)/.exec(v.style.transform);
            if (m) w.__rec.scales.push(Number(m[1]));
          }
        };
        let last = 0;
        const loop = (t: number) => {
          if (!w.__rec.run) return;
          if (last) w.__rec.gaps.push(t - last);
          last = t;
          scan();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
    const stop = () =>
      page.evaluate(() => {
        const w = window as unknown as { __rec: { gaps: number[]; scales: number[]; kinds: string[]; run: boolean } };
        w.__rec.run = false;
        return w.__rec;
      });
    await record();
    await row.tap();
    await expect(exerciseView(page, 'barbell-back-squat')).toBeVisible();
    await page.waitForTimeout(600);
    const push = await stop();
    // No layout shift once it arrived: the name and the current row's ✓ stay put.
    const view = exerciseView(page, 'barbell-back-squat');
    const parts = [view.getByRole('heading').first(), checkCurrent(view)];
    const settled = await Promise.all(parts.map(box));
    await page.waitForTimeout(500);
    await unmoved(() => Promise.all(parts.map(box)), settled);
    await record();
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await expect(row).toBeVisible();
    await page.waitForTimeout(600);
    const pop = await stop();
    const long = (g: number[]) => Math.round(Math.max(0, ...g));
    // A dropped frame: a gap past two 60 Hz intervals plus the headless clock's few ms of jitter.
    const missed = (g: number[]) => g.filter((x) => x > 40).length;
    console.log(`${test.info().project.name}: push longest ${long(push.gaps)} ms (${missed(push.gaps)} over 40), pop longest ${long(pop.gaps)} ms (${missed(pop.gaps)} over 40), min scale ${Math.min(1, ...push.scales, ...pop.scales)}`);
    // Headless WebKit's frame clock is noisy (see polish-2.2d): no frame over 50 ms, at most one missed.
    for (const r of [push, pop]) {
      if (!isWebKit()) continue;
      expect(long(r.gaps)).toBeLessThan(50);
      expect(missed(r.gaps)).toBeLessThanOrEqual(1);
    }
    // The one page transition ran both ways: a push, then a pop (View Transitions), whose CSS
    // moves the page underneath 30% left, shrinks it to 0.96 and dims it; or the Motion fallback.
    if (push.kinds.length) {
      expect(push.kinds).toContain('push');
      expect(pop.kinds).toContain('pop');
      const rules = await page.evaluate(() => {
        const out: Record<string, string> = {};
        for (const sheet of document.styleSheets) for (const r of sheet.cssRules) if (r instanceof CSSKeyframesRule && /^vt-(push-old|pop-new)$/.test(r.name)) out[r.name] = r.cssText;
        return out;
      });
      expect(rules['vt-push-old']).toMatch(/translateX?\(-30%\) scale\(0\.96\)/);
      expect(rules['vt-pop-new']).toMatch(/translateX?\(-30%\) scale\(0\.96\)/);
    } else {
      expect(Math.min(1, ...push.scales)).toBeCloseTo(0.96, 2);
    }
  });
  test('round 2 (critic B6): checking a PR set and picking a bar never stall a frame past 50 ms @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
    await page.reload();
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
    await fillReps(view, view.getByTestId('set-todo').first(), 6);
    await page.waitForTimeout(600);
    const f = frames(page);
    await f.start();
    await checkCurrent(view).tap();
    await expect(loggedRows(view).first().getByTestId('pr-badge')).toBeVisible();
    await page.waitForTimeout(500);
    const check = await f.stop();
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible()) await skip.tap({ timeout: 2000 }).catch(() => undefined); // it may leave with the last set
    // The bar sheet: pick a bar, the sheet closes, then the weight is worked out.
    await view.getByTestId('weight-cell').first().tap();
    const weight = page.getByRole('dialog', { name: 'Pick the weight' });
    await weight.getByRole('button', { name: /^Change bar/ }).tap();
    const bars = page.getByRole('dialog', { name: 'Which bar?' });
    await expect(bars).toBeVisible();
    await page.waitForTimeout(500);
    await f.start();
    await bars.getByRole('button', { name: /Women's bar/ }).tap();
    await expect(bars).toHaveCount(0);
    await expect(weight.getByTestId('plate-total')).toHaveAttribute('data-math', /^35 bar/);
    await page.waitForTimeout(300);
    const bar = await f.stop();
    console.log(`${test.info().project.name}: PR check longest frame ${check} ms, bar pick longest frame ${bar} ms`);
    if (isWebKit()) {
      expect(check).toBeLessThan(50);
      expect(bar).toBeLessThan(50);
    }
    expect(errors).toEqual([]);
  });

  test('round 2 (critic B1): a tab switch: the pill lands with the page, the bar never fades @matrix', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await page.waitForTimeout(400);
    const plans = nav.getByRole('link', { name: 'Plans' });
    const pill = nav.locator('[data-pill]');
    const vt = await page.evaluate(() => typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function');
    if (vt) expect(await pill.evaluate((el) => (el as HTMLElement).style.viewTransitionName)).toBe('tab-pill');
    await plans.tap();
    await page.waitForTimeout(90);
    await shot(page, 'tab-switch-90ms');
    await navIdle(page);
    // The moment the transition is over the pill already sits under Plans (no late slide).
    const p = await box(pill);
    const t = await box(plans);
    expect(Math.abs(p.x + p.width / 2 - (t.x + t.width / 2))).toBeLessThan(2);
    await page.waitForTimeout(150);
    const later = await box(pill);
    expect(Math.abs(later.x - p.x)).toBeLessThan(1);
    // The bar is never part of the page crossfade: its own layer, drawn at once.
    const rules = await page.evaluate(() => {
      const out: string[] = [];
      for (const sh of document.styleSheets) for (const r of sh.cssRules) if (/tabbar|tab-pill/.test(r.cssText)) out.push(r.cssText);
      return out.join('\n');
    });
    expect(rules).toMatch(/::view-transition-old\(tabbar\)\s*\{\s*display: none/);
    expect(rules).toMatch(/::view-transition-group\(tab-pill\)/);
  });

  test('round 2 (critic B1): reduced motion: the pill jumps to the tab at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await page.waitForTimeout(400);
    await nav.getByRole('link', { name: 'History' }).tap();
    await navIdle(page);
    const pill = nav.locator('[data-pill]');
    const t = await box(nav.getByRole('link', { name: 'History' }));
    const p = await box(pill);
    expect(Math.abs(p.x + p.width / 2 - (t.x + t.width / 2))).toBeLessThan(2);
  });
  test('round 3 (critic B1): from the tap, a tab switch and a PR check on a plan day never stall a frame past 50 ms @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
    await usePlan(page);
    await page.waitForTimeout(800);
    const t = fromTap(page);
    await t.arm();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plans' }).tap();
    const tab = await t.longest();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).tap();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.waitForTimeout(1200);
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = exerciseView(page, 'barbell-back-squat');
    await page.waitForTimeout(900);
    await navIdle(page);
    const cell = view.getByTestId('weight-cell').first();
    if ((await cell.innerText()).trim() !== '185') {
      await cell.tap();
      const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
      await sheet.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
      await sheet.getByRole('button', { name: 'Add 25 lb plate to each side' }).tap();
      await sheet.getByRole('button', { name: 'Done' }).tap();
      await expect(sheet).toHaveCount(0);
    }
    await fillReps(view, view.getByTestId('set-todo').first(), 6);
    await page.waitForTimeout(800);
    await t.arm();
    await checkCurrent(view).tap();
    const check = await t.longest();
    await expect(loggedRows(view).first().getByTestId('pr-badge')).toBeVisible();
    console.log(`${test.info().project.name}: from the tap: tab switch longest frame ${tab} ms, PR check longest frame ${check} ms`);
    if (isWebKit()) {
      expect(tab).toBeLessThan(50);
      expect(check).toBeLessThan(50);
    }
    expect(errors).toEqual([]);
  });

  test('round 3 (critic B2): Finish slides in whole, one plain snapshot, no shared elements cut out @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }] });
    await page.reload();
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await pickExercises(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('weight-cell').first()).toHaveText('185');
    await fillReps(view, view.getByTestId('set-todo').first(), 6);
    await checkCurrent(view).tap();
    await expect(loggedRows(view).first().getByTestId('pr-badge')).toBeVisible();
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible()) await skip.tap({ timeout: 2000 }).catch(() => undefined); // it may leave with the last set
    await page.waitForTimeout(500);
    // While the push runs: what the arriving snapshot was taken from (the live page under it).
    await page.evaluate(() => {
      const w = window as unknown as { __fin: { flat: boolean; parts: string[]; opacity: number[] } | null };
      w.__fin = null;
      const loop = () => {
        const root = document.documentElement;
        if (root.dataset.nav && location.hash.endsWith('/done') && !w.__fin) {
          const ids = ['finish-title', 'finish-win', 'finish-duration', 'finish-sets', 'finish-exercise'];
          w.__fin = {
            flat: root.dataset.navFlat !== undefined,
            parts: ids.filter((id) => document.querySelector(`[data-testid="${id}"]`)),
            opacity: ids.map((id) => Number(getComputedStyle(document.querySelector(`[data-testid="${id}"]`) ?? root).opacity)),
          };
          return;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page).toHaveURL(/\/done$/);
    const fin = await page.evaluate(() => (window as unknown as { __fin: { flat: boolean; parts: string[]; opacity: number[] } | null }).__fin);
    // Browsers without View Transitions slide with Motion (nothing to snapshot).
    if (fin) {
      expect(fin.flat).toBe(true);
      expect(fin.parts).toEqual(['finish-title', 'finish-win', 'finish-duration', 'finish-sets', 'finish-exercise']);
      expect(Math.min(...fin.opacity)).toBe(1);
      const rule = await page.evaluate(() => [...document.styleSheets].flatMap((sh) => [...sh.cssRules].map((r) => r.cssText)).find((t) => t.includes('data-nav-flat')) ?? '');
      expect(rule).toMatch(/view-transition-name: none !important/);
    }
    await navIdle(page);
    expect(await page.evaluate(() => document.documentElement.dataset.navFlat)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('round 3 (critic B3): the active icon and label ride the pill as one layer', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await page.waitForTimeout(300);
    const vt = await page.evaluate(() => typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === 'function');
    test.skip(!vt, 'View Transitions only');
    const names = await nav.locator('a').evaluateAll((as) => as.map((a) => [...a.querySelectorAll<HTMLElement>('span')].map((el) => el.style.viewTransitionName).filter(Boolean)));
    expect(names).toEqual([['tab-pill', 'tab-active'], [], [], []]);
    await nav.getByRole('link', { name: 'Plans' }).tap();
    await navIdle(page);
    const after = await nav.locator('a').evaluateAll((as) => as.map((a) => [...a.querySelectorAll<HTMLElement>('span')].map((el) => el.style.viewTransitionName).filter(Boolean)));
    expect(after).toEqual([[], [], [], ['tab-pill', 'tab-active']]);
    // Every tab keeps its icon in the bar.
    for (const name of ['Today', 'Run', 'History', 'Plans']) await expect(nav.getByRole('link', { name }).locator('svg')).toBeVisible();
  });
});
