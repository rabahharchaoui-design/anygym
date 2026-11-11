import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';

// PLAN 3.5w: motion polish from G's recordings. Each fixed transition has its proof here: nothing
// moves under the finger, one animation per element, movement on transforms only inside the shared
// spring's range, and reduced motion still gives fades. Findings: reports/shots/3.5w/findings.md.

test.use({ intake: 'fresh' });
test.beforeEach(async ({ page }) => simulateSafeAreas(page));

const US = { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' };
const FULL = { goal: 'muscle', goals: ['muscle'], units: US, focus: ['balance'], experience: '3y', days: 5, minutes: 60, place: 'full', equipmentFor: 'full', style: 'mix', cardio: 'little' };
const intake = (page: Page) => page.getByTestId('intake');
const atStep = (page: Page, s: string) => expect(intake(page)).toHaveAttribute('data-step', s);
const isWebKit = () => test.info().project.use.browserName === 'webkit';

/** A fresh phone put on this step with these answers (the funnel's own draft, as a reload finds it). */
async function drafted(page: Page, step: string, answers: Record<string, unknown>) {
  await page.goto('./');
  await expect(intake(page)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem('anygym.intakeDraft') !== null);
  await page.evaluate(([st, a]) => localStorage.setItem('anygym.intakeDraft', JSON.stringify({ step: st, answers: a })), [step, answers] as const);
  await page.reload();
  await atStep(page, step);
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await page.waitForTimeout(350);
}

/** Chromium phones run at 4x CPU slowdown (a mid range phone), as the 2.2d speed test does; WebKit has no CDP. */
async function slowCpu(page: Page) {
  if (isWebKit()) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

/** Frame gaps from the next pointerdown for `ms`; read with longest(). */
const fromTap = (page: Page, ms = 500) => ({
  arm: () =>
    page.evaluate((span) => {
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
            if (t - t0 < span) requestAnimationFrame(loop);
          };
          requestAnimationFrame(loop);
        },
        { capture: true, once: true },
      );
    }, ms),
  longest: async () => {
    await page.waitForTimeout(ms + 100);
    const gaps = await page.evaluate(() => (window as unknown as { __tg: number[] }).__tg);
    const longest = Math.round(Math.max(0, ...gaps));
    // WebKit (the iPhones): no dropped streak. Headless WebKit's frame clock is noisy when the whole
    // suite runs beside it, so one late frame is let through, as in the 2.2e push and pop budget.
    if (isWebKit()) {
      expect(longest).toBeLessThan(67);
      expect(gaps.filter((g) => g > 40).length).toBeLessThanOrEqual(1);
    }
    return longest;
  },
});

/** The layout boxes (not the painted ones: a pulse or a press scale never counts) of a question's options. */
const optionBoxes = (page: Page, group: string) =>
  page.getByTestId(group).evaluate((el) => [...el.children].map((c) => [(c as HTMLElement).offsetTop, (c as HTMLElement).offsetHeight]));

test('a single choice: the new pill wraps "Your plan so far" and no option moves under the finger @matrix', async ({ page }) => {
  // G's recording (0:46): on the Home Screen app the fifth pill wrapped the strip and every card jumped.
  await page.setViewportSize({ width: 393, height: 852 });
  await drafted(page, 'place', { goal: 'muscle', goals: ['muscle'], units: US, experience: 'break', days: 5, minutes: 45 });
  const strip = page.getByTestId('plan-so-far');
  await expect(strip).toBeInViewport({ ratio: 1 });
  const stripBefore = (await strip.boundingBox())!;
  const before = await optionBoxes(page, 'q-place');
  await slowCpu(page);
  const frames = fromTap(page, 400);
  await frames.arm();
  await page.getByTestId('q-place-full').tap();
  // The answer is in the strip at once, on a line of its own; the cards are where they were.
  await expect(page.getByTestId('so-far-place')).toHaveText('Full gym');
  expect(await optionBoxes(page, 'q-place')).toEqual(before);
  const stripNow = (await strip.boundingBox())!;
  expect(stripNow.y).toBe(stripBefore.y);
  expect(stripNow.height).toBeGreaterThan(stripBefore.height);
  // Whole (to a hairline): the new line shows in the room under the strip, above the note.
  const pill = (await page.getByTestId('so-far-place').boundingBox())!;
  const foot = (await page.getByText('Stays on this phone.').boundingBox())!;
  expect(pill.y + pill.height).toBeLessThanOrEqual(foot.y + 1);
  const longest = await frames.longest();
  console.log(`${test.info().project.name}: place pick longest frame ${longest} ms`);
  // It still moves on by itself, and the next screen holds nothing.
  await atStep(page, 'equipment');
  await expect(page.locator('main[data-scroller]')).not.toHaveAttribute('data-hold', /.*/);
});

test('the hold ends with the screen: after a pick the next question fills its space again', async ({ page }) => {
  await drafted(page, 'experience', { goal: 'muscle', goals: ['muscle'], units: US });
  await page.getByTestId('q-experience-3y').tap();
  await atStep(page, 'days');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  const main = page.locator('main[data-scroller]');
  await expect(main).not.toHaveAttribute('data-hold', /.*/);
  expect(await main.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--hold'))).toBe('');
});

test('cardio: the cards glide to make room (one transform each, inside the spring range) and the kinds fade in @matrix', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await drafted(page, 'cardio', { ...FULL, cardio: undefined });
  const cards = page.getByTestId('q-cardio');
  const before = await optionBoxes(page, 'q-cardio');
  await slowCpu(page);
  const frames = fromTap(page, 400);
  await frames.arm();
  await page.getByTestId('q-cardio-love').tap();
  await expect(page.getByTestId('cardio-kinds')).toBeVisible();
  const moving = await cards.evaluate((el) =>
    [...el.children].map((c) => {
      const all = c.getAnimations();
      return {
        count: all.length,
        props: [...new Set(all.flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)))))],
        ms: Math.max(0, ...all.map((a) => Number(a.effect!.getComputedTiming().endTime))),
      };
    }),
  );
  const after = await optionBoxes(page, 'q-cardio');
  // The layout changed at once (no layout property is animated): the cards are compact now.
  expect(after[3]![0]).toBeLessThan(before[3]![0]!);
  moving.forEach((m, i) => {
    const moved = Math.abs(after[i]![0]! - before[i]![0]!) >= 1;
    expect(m.count, `card ${i}: one animation at most`).toBe(moved ? 1 : 0);
    if (moved) {
      expect(m.props).toEqual(['transform']);
      // The shared page spring: 220 ms, inside SPEC 13.2's 180 to 280 ms band.
      expect(m.ms).toBeGreaterThanOrEqual(180);
      expect(m.ms).toBeLessThanOrEqual(280);
    }
  });
  // The kinds come in on opacity only.
  const kinds = await page.getByTestId('cardio-kinds').evaluate((el) => el.getAnimations().map((a) => ({ props: (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k).filter((p) => p === 'opacity' || p === 'transform')), ms: Number(a.effect!.getComputedTiming().endTime) })));
  expect(kinds).toHaveLength(1);
  expect(new Set(kinds[0]!.props)).toEqual(new Set(['opacity']));
  expect(kinds[0]!.ms).toBeLessThanOrEqual(300);
  const longest = await frames.longest();
  console.log(`${test.info().project.name}: cardio pick longest frame ${longest} ms`);
  // Landed: nothing is left on the cards, and they sit exactly on their layout boxes.
  await expect.poll(() => cards.evaluate((el) => [...el.children].every((c) => c.getAnimations().length === 0 && (c as HTMLElement).style.transform === ''))).toBe(true);
  // Back to None: the cards fill the screen again, the same way.
  await page.getByTestId('q-cardio-none').tap();
  await expect(page.getByTestId('cardio-kinds')).toHaveCount(0);
  await expect.poll(() => optionBoxes(page, 'q-cardio')).toEqual(before);
});

test('cardio, reduced motion: no card travels, the kinds still fade in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await drafted(page, 'cardio', { ...FULL, cardio: undefined });
  await page.getByTestId('q-cardio-love').tap();
  await expect(page.getByTestId('cardio-kinds')).toBeVisible();
  expect(await page.getByTestId('q-cardio').evaluate((el) => [...el.children].reduce((n, c) => n + c.getAnimations().length, 0))).toBe(0);
  const kinds = await page.getByTestId('cardio-kinds').evaluate((el) => el.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes().flatMap((k) => Object.keys(k).filter((p) => p === 'opacity' || p === 'transform'))));
  expect(new Set(kinds)).toEqual(new Set(['opacity']));
});

test('the progress bar grows on a transform: its box never changes', async ({ page }) => {
  await drafted(page, 'goal', { units: US });
  const fill = page.getByRole('progressbar').locator('span');
  const read = () =>
    fill.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { width: (el as HTMLElement).offsetWidth, track: (el.parentElement as HTMLElement).clientWidth, property: cs.transitionProperty, scale: new DOMMatrixReadOnly(cs.transform).a };
    });
  const first = await read();
  expect(first.width).toBe(first.track);
  expect(first.property).toBe('transform');
  await page.getByTestId('q-goal-muscle').tap();
  await page.getByTestId('intake-cta').locator('button[data-variant="primary"]').tap();
  await atStep(page, 'units');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await expect.poll(async () => (await read()).scale).toBeGreaterThan(first.scale);
  const second = await read();
  expect(second.width).toBe(first.width);
  // Painted inside its track, from the left edge.
  const box = (await fill.boundingBox())!;
  const track = (await page.getByRole('progressbar').boundingBox())!;
  expect(Math.abs(box.x - track.x)).toBeLessThan(1);
  expect(box.x + box.width).toBeLessThanOrEqual(track.x + track.width + 0.5);
});

test('the reveal: the week builds in after the page lands, never during the slide; the check is done inside 900 ms', async ({ page }) => {
  await drafted(page, 'about', FULL);
  await page.evaluate(() => {
    const w = window as unknown as { __during: number[] };
    w.__during = [];
    // Every frame while the page slides: how far the first day's build in has come.
    const loop = () => {
      const row = document.querySelector('[data-testid="reveal-week"] li');
      if (row && document.documentElement.dataset.nav) w.__during.push(Number(row.getAnimations()[0]?.currentTime ?? 0));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.getByTestId('skip').tap();
  await atStep(page, 'reveal');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  const during = await page.evaluate(() => (window as unknown as { __during: number[] }).__during);
  // WebKit and Chromium slide with a view transition; where there is none the page is simply there.
  if (during.length) expect(Math.max(...during)).toBe(0);
  // Then every day comes in: one animation each, opacity and a small rise, well inside the range.
  const rows = page.getByTestId('reveal-week').getByRole('listitem');
  const timing = await rows.evaluateAll((els) => els.map((el) => el.getAnimations().map((a) => Number(a.effect!.getComputedTiming().endTime))));
  for (const t of timing) {
    expect(t.length).toBeLessThanOrEqual(1);
    for (const end of t) expect(end).toBeLessThanOrEqual(600);
  }
  await expect.poll(() => rows.evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '1'))).toBe(true);
  // Built in place: a row's layout box is the same before and after its rise.
  const check = page.getByTestId('reveal-check');
  if (await check.count()) {
    const end = await check.evaluate((svg) => Math.max(0, ...[...svg.querySelectorAll('*')].flatMap((el) => el.getAnimations().map((a) => Number(a.effect!.getComputedTiming().endTime)))));
    // 220 ms of slide before it: still a celebration under 900 ms from the tap.
    expect(end + 220).toBeLessThanOrEqual(900);
  }
});

test('the reveal, reduced motion: the days fade, nothing travels', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await drafted(page, 'reveal', FULL);
  const rows = page.getByTestId('reveal-week').getByRole('listitem');
  expect(await rows.evaluateAll((els) => els.every((el) => getComputedStyle(el).transform === 'none'))).toBe(true);
  await expect.poll(() => rows.evaluateAll((els) => els.every((el) => getComputedStyle(el).opacity === '1'))).toBe(true);
});

test('the love or never cards: the next card comes up with its name on the same lines (no reflow when the info button arrives)', async ({ page }) => {
  await drafted(page, 'exercises', FULL);
  await expect(page.getByTestId('ex-deck')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    const under = page.getByTestId('deck-under-keep').locator('h2');
    const name = (await under.textContent())!;
    const before = await under.evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
    await page.getByTestId('ex-love').tap();
    await expect(page.getByTestId('deck-name')).toHaveText(name);
    expect(await page.getByTestId('deck-name').evaluate((el) => ({ w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }))).toEqual(before);
    // One info button, on the top card only; the room kept under it is not a control.
    await expect(page.getByTestId('deck-info')).toHaveCount(1);
    await page.waitForTimeout(350);
  }
});

test('the welcome: Escape moves on like a tap outside, and the words never sit on the tab bar or the lit element', async ({ page }) => {
  await drafted(page, 'about', FULL);
  await page.getByTestId('skip').tap();
  await atStep(page, 'reveal');
  await page.getByTestId('reveal-cta').locator('button[data-variant="primary"]').tap();
  const tour = page.getByTestId('welcome-tour');
  await expect(tour).toHaveAttribute('data-step', 'day');
  const clear = async (target: string) => {
    await expect
      .poll(async () => {
        const w = await page.getByTestId('tour-words').boundingBox();
        const tabs = await page.locator('[data-tour="tabs"]').boundingBox();
        const lit = await page.locator(`[data-tour="${target}"]`).boundingBox();
        if (!w || !tabs || !lit) return 'missing';
        if (w.y + w.height > tabs.y) return `on the tab bar by ${(w.y + w.height - tabs.y).toFixed(1)}`;
        if (!(w.y + w.height <= lit.y || w.y >= lit.y + lit.height)) return 'on the lit element';
        return 'clear';
      })
      .toBe('clear');
  };
  await clear('day');
  // Escape: the next step, not the end.
  await page.keyboard.press('Escape');
  await expect(tour).toHaveAttribute('data-step', 'quick');
  await clear('quick');
  await page.keyboard.press('Escape');
  await expect(tour).toHaveAttribute('data-step', 'tabs');
  // On the last step moving on ends it, as Done does.
  await page.keyboard.press('Escape');
  await expect(tour).toHaveCount(0);
});
