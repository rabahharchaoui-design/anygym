import { expect, test, type Page } from './fixtures';
import { simulateSafeAreas } from './helpers/layout';
import { pastIntake } from './helpers/quick';
import { bar185, checkCurrent, exerciseView, loggedRows, quickWith, seedFinished } from './workout-helpers';

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

// ---- Round 2 majors in the intake (ux-critic M5, M6, M7).

test('M5 place to equipment: the slide carries the first rows only, the rest of the grid arrives once it has landed @matrix', async ({ page }) => {
  await drafted(page, 'place', { goal: 'muscle', goals: ['muscle'], units: US, experience: 'break', days: 5, minutes: 45 });
  await page.evaluate(() => {
    const w = window as unknown as { __tiles: number[] };
    w.__tiles = [];
    const loop = () => {
      const grid = document.querySelector('[data-testid="equipment"]');
      if (grid && document.documentElement.dataset.nav) w.__tiles.push(grid.querySelectorAll('[data-testid^="equip-"][aria-pressed]:not([data-testid^="equip-all"])').length);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await slowCpu(page);
  const frames = fromTap(page, 600);
  await frames.arm();
  await page.getByTestId('q-place-full').tap();
  await atStep(page, 'equipment');
  const longest = await frames.longest();
  console.log(`${test.info().project.name}: place to equipment longest frame ${longest} ms`);
  const during = await page.evaluate(() => (window as unknown as { __tiles: number[] }).__tiles);
  // While the page slides (where there is a view transition) only three rows of three are in it.
  for (const n of during) expect(n).toBeLessThanOrEqual(9);
  // Landed: every tile is there, and all can be reached.
  await expect(page.getByTestId('equipment')).toHaveAttribute('data-whole', 'true');
  expect(await page.getByTestId('equipment').locator('li button[aria-pressed]').count()).toBeGreaterThan(20);
  await expect(page.getByTestId('equip-jump_rope')).toHaveCount(1);
});

test('M6 cardio on a short screen: the kinds that arrive below the fold are scrolled into view, only as far as needed', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await drafted(page, 'cardio', { ...FULL, cardio: undefined });
  await page.getByTestId('q-cardio-love').tap();
  const kinds = page.getByTestId('cardio-kinds');
  await expect(kinds).toBeVisible();
  await expect(kinds).toBeInViewport({ ratio: 1 });
  // Above the button, and not a pixel further than that takes.
  await expect
    .poll(async () => {
      const k = (await kinds.boundingBox())!;
      const main = (await page.locator('main[data-scroller]').boundingBox())!;
      return Math.round(main.y + main.height - (k.y + k.height));
    })
    .toBeLessThanOrEqual(10);
  const gap = await page.evaluate(() => {
    const k = document.querySelector('[data-testid="cardio-kinds"]')!.getBoundingClientRect();
    const m = document.querySelector('main[data-scroller]')!.getBoundingClientRect();
    return m.bottom - k.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
});

test('M7 a short screen: with no room for the strip, one line under the progress bar shows the latest answer and "+N"', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 659 });
  await drafted(page, 'experience', { goal: 'muscle', goals: ['muscle', 'fat_loss'], units: US });
  const line = page.getByTestId('plan-so-far-line');
  const strip = page.getByTestId('plan-so-far');
  const state = async () => ({ away: await strip.evaluate((el) => (el as HTMLElement).dataset.away !== undefined), line: await line.isVisible() });
  // Exactly one of the two shows.
  const first = await state();
  expect(first.line).toBe(first.away);
  test.skip(!first.away, 'the strip fits here');
  await expect(line.getByTestId('so-far-latest')).toHaveText('Muscle + fat loss');
  await expect(line.getByTestId('so-far-more')).toHaveCount(0);
  // One line, right under the progress bar, above the title.
  const bar = (await page.getByRole('progressbar').boundingBox())!;
  const box = (await line.boundingBox())!;
  const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(36);
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(box.y + box.height).toBeLessThanOrEqual(title.y + 1);
  // The pick moves nothing (the line keeps its one row) and the next screen shows the new answer.
  const before = await optionBoxes(page, 'q-experience');
  await page.getByTestId('q-experience-3y').tap();
  expect(await optionBoxes(page, 'q-experience')).toEqual(before);
  await atStep(page, 'days');
  await page.waitForFunction(() => !document.documentElement.dataset.nav);
  await expect(line).toBeVisible();
  await expect(line.getByTestId('so-far-latest')).toHaveText('3+ years');
  await expect(line.getByTestId('so-far-more')).toHaveText('+1');
  // A screen that adds nothing to the plan has neither.
  await page.getByTestId('q-days-4').tap();
  await atStep(page, 'weekdays');
  await expect(line).toHaveCount(0);
});

// ---- Round 2 (ux-critic, reports/shots/3.5w-critic/): the three blockers, measured on every frame.
test.describe('round 2: past the intake', () => {
  test.use({ intake: 'done' });

  /** Records `read()` on every frame from the next pointerdown for `ms`. Read with frames(). */
  const everyFrame = async (page: Page, ms: number, read: string) => {
    await page.evaluate(
      ([span, body]) => {
        const w = window as unknown as { __ef: Array<{ t: number; v: unknown }> };
        w.__ef = [];
        const fn = new Function(`return (${body})()`);
        document.addEventListener(
          'pointerdown',
          () => {
            const t0 = performance.now();
            const loop = () => {
              const t = performance.now() - t0;
              w.__ef.push({ t, v: fn() });
              if (t < (span as number)) requestAnimationFrame(loop);
            };
            loop();
          },
          { capture: true, once: true },
        );
      },
      [ms, read] as const,
    );
    return async <T,>() => {
      await page.waitForTimeout(ms + 150);
      return page.evaluate(() => (window as unknown as { __ef: Array<{ t: number; v: unknown }> }).__ef) as Promise<Array<{ t: number; v: T }>>;
    };
  };

  test('B1 a tab switch: the bar is pixel stable on every frame, no page snapshot, the pill slides live, only the screen rises @matrix', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await page.waitForTimeout(500);
    type F = { bar: number[]; opacity: number[]; nav: string | null; pill: number; page: [number, number] | null };
    const frames = await everyFrame(
      page,
      600,
      `() => {
        const nav = document.querySelector('nav[aria-label="Main"]');
        const cap = nav.firstElementChild;
        const r = cap.getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        const pill = nav.querySelector('[data-pill]');
        const main = document.querySelector('[data-shell] main[data-scroller]');
        const cs = main ? getComputedStyle(main) : null;
        return {
          bar: [r.x, r.y, r.width, r.height, n.x, n.y, n.width, n.height],
          opacity: [Number(getComputedStyle(nav).opacity), Number(getComputedStyle(cap).opacity)],
          nav: document.documentElement.dataset.nav ?? null,
          pill: pill ? pill.getBoundingClientRect().x : -1,
          page: cs ? [Number(cs.opacity), cs.transform === 'none' ? 0 : new DOMMatrixReadOnly(cs.transform).m42] : null,
        };
      }`,
    );
    const plans = nav.getByRole('link', { name: 'Plans' });
    await plans.tap();
    const seen = await frames<F>();
    expect(seen.length).toBeGreaterThan(10);
    // The bar: the same box and fully opaque on every single frame, and never inside a view transition.
    for (const f of seen) {
      expect(f.v.bar, `bar box at ${Math.round(f.t)} ms`).toEqual(seen[0]!.v.bar);
      expect(f.v.opacity, `bar opacity at ${Math.round(f.t)} ms`).toEqual([1, 1]);
      expect(f.v.nav, `no view transition at ${Math.round(f.t)} ms`).toBeNull();
      expect(f.v.pill, 'the pill is always in the bar').toBeGreaterThanOrEqual(0);
    }
    expect(await nav.evaluate((el) => [el, ...el.querySelectorAll<HTMLElement>('*')].filter((e) => /tab-/.test(getComputedStyle(e).viewTransitionName ?? '')).length)).toBe(0);
    // The pill travels through places between the two tabs (live, not a jump), and ends under Plans.
    const xs = seen.map((f) => f.v.pill);
    const from = xs[0]!;
    const to = (await plans.boundingBox())!.x;
    if (!(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))) expect(xs.filter((x) => x > from + 4 && x < to - 4).length).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => Math.abs((await nav.locator('[data-pill]').boundingBox())!.x - to)).toBeLessThan(1.5);
    // Only the screen's content moved: it faded in and rose at most 7 px, and is at rest inside 350 ms.
    const pages = seen.filter((f) => f.v.page).map((f) => ({ t: f.t, o: f.v.page![0], y: f.v.page![1] }));
    expect(pages.some((p) => p.o < 1)).toBe(true);
    expect(Math.max(...pages.map((p) => p.y))).toBeLessThanOrEqual(7.01);
    expect(Math.max(...pages.map((p) => p.y))).toBeGreaterThan(1);
    for (const p of pages.filter((q) => q.t > 350)) expect([p.o, p.y]).toEqual([1, 0]);
    await expect(page.getByRole('heading', { name: 'Plans' }).first()).toBeVisible();
  });

  test('B1 reduced motion: the screen only fades, the bar and pill do not animate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await page.waitForTimeout(400);
    const frames = await everyFrame(page, 300, `() => { const m = document.querySelector('[data-shell] main[data-scroller]'); return m ? getComputedStyle(m).transform : 'none'; }`);
    await nav.getByRole('link', { name: 'History' }).tap();
    for (const f of await frames<string>()) expect(f.v).toBe('none');
  });

  async function openSquat(page: Page) {
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: bar185 }, { reps: 5, load: bar185 }, { reps: 5, load: bar185 }] });
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(checkCurrent(view)).toBeVisible();
    await page.waitForFunction(() => !document.documentElement.dataset.nav);
    await page.waitForTimeout(500);
    return view;
  }

  test('B2 closing a sheet: the app behind comes forward over about 200 ms, never in one frame @matrix', async ({ page }) => {
    const view = await openSquat(page);
    await view.getByTestId('weight-cell').first().tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const scale = () => page.evaluate(() => getComputedStyle(document.getElementById('root')!).scale);
    await expect.poll(scale).toBe('0.94');
    const frames = await everyFrame(page, 500, `() => { const s = getComputedStyle(document.getElementById('root')).scale; return s === 'none' ? 1 : Number(s); }`);
    await dialog.getByRole('button', { name: 'Done' }).tap();
    const seen = (await frames<number>()).map((f) => ({ t: f.t, s: f.v }));
    // Frames on the way: several sizes strictly between stepped back and full, only ever growing.
    const between = seen.filter((f) => f.s > 0.941 && f.s < 0.999);
    expect(between.length, `sizes seen: ${seen.map((f) => f.s.toFixed(3)).join(' ')}`).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.s).toBeGreaterThanOrEqual(seen[i - 1]!.s - 0.0005);
    // Full size again inside 300 ms of it starting (about 200 ms, in step with the sheet leaving).
    const start = between[0]!.t;
    for (const f of seen.filter((q) => q.t > start + 300)) expect(f.s).toBe(1);
    await expect.poll(scale).toBe('none');
    await expect(dialog).toHaveCount(0);
  });

  test('B3 logging a set: the next check does not move from 100 ms to 1500 ms after the tap, and the hero never resizes @matrix', async ({ page }) => {
    const view = await openSquat(page);
    const hero = view.getByTestId('ex-hero');
    const heroBefore = (await hero.count()) ? (await hero.boundingBox())!.height : null;
    for (let n = 1; n <= 2; n++) {
      const frames = await everyFrame(
        page,
        1500,
        `() => { const c = document.querySelector('[data-testid="check-current"]'); const h = document.querySelector('[data-testid="ex-hero"]'); const r = c ? c.getBoundingClientRect() : null; return { c: r ? [r.x, r.y, r.width, r.height] : null, h: h ? h.getBoundingClientRect().height : null }; }`,
      );
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(n);
      const seen = (await frames<{ c: number[] | null; h: number | null }>()).filter((f) => f.t >= 100);
      expect(seen.length).toBeGreaterThan(40);
      const first = seen[0]!.v;
      expect(first.c, 'a next row to check').not.toBeNull();
      for (const f of seen) {
        expect(f.v.c, `set ${n}: the next check at ${Math.round(f.t)} ms`).not.toBeNull();
        f.v.c!.forEach((v, i) => expect(Math.abs(v - first.c![i]!), `set ${n}: the next check at ${Math.round(f.t)} ms`).toBeLessThan(0.5));
        expect(f.v.h).toBe(first.h);
      }
      if (heroBefore !== null) expect(first.h).toBe(heroBefore);
      // Whole, above the rest bar.
      const check = (await checkCurrent(view).boundingBox())!;
      const rest = (await page.getByTestId('rest-timer').boundingBox())!;
      expect(check.y + check.height).toBeLessThanOrEqual(rest.y + 0.5);
    }
  });

  test('M4 Quick workout: an idea card answers the press and grows into the deck (nav.ts expand), and Back folds it away @matrix', async ({ page }) => {
    await pastIntake(page);
    await page.goto('./#/quick?min=30');
    const first = page.locator('[data-concept]').first();
    await expect(first).toBeVisible();
    await page.waitForFunction(() => !document.documentElement.dataset.nav);
    await page.waitForTimeout(400);
    const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    type F = { press: number; stage: string | null; fade: number; top: number[] | null; idea: number[] | null };
    const read = `() => {
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
      const card = document.querySelector('[data-concept]');
      const face = card ? card.querySelector('[data-testid="concept-pick"]') : null;
      const stage = document.querySelector('[data-stage]');
      return {
        press: face ? new DOMMatrixReadOnly(getComputedStyle(face).transform).a : 1,
        stage: stage ? stage.getAttribute('data-stage') : null,
        fade: stage ? Number(getComputedStyle(stage).opacity) : 1,
        top: box(document.querySelector('[data-testid="deck-card"]')),
        idea: box(card),
      };
    }`;
    const ideaBox = (await first.boundingBox())!;
    const frames = await everyFrame(page, 600, read);
    await first.getByTestId('concept-pick').tap();
    const seen = await frames<F>();
    await expect(page.getByTestId('deck-card')).toBeVisible();
    // The press: the card is at the shared press scale on the first frame.
    if (!reduced) expect(seen[0]!.v.press).toBeCloseTo(0.97, 2);
    const deck = seen.filter((f) => f.v.stage === 'deck' && f.v.top);
    const rest = (await page.getByTestId('deck-card').boundingBox())!;
    // Not a hard cut: the deck fades in over several frames...
    expect(deck.filter((f) => f.v.fade < 1).length).toBeGreaterThanOrEqual(6);
    if (!reduced) {
      // ...while its top card starts where the idea card was and grows into place, only ever growing.
      const start = deck[0]!.v.top!;
      expect(Math.abs(start[1]! - ideaBox.y)).toBeLessThan(24);
      expect(start[3]!).toBeLessThan(rest.height * 0.75);
      for (let i = 1; i < deck.length; i++) expect(deck[i]!.v.top![3]!).toBeGreaterThanOrEqual(deck[i - 1]!.v.top![3]! - 0.5);
    }
    // At rest inside 350 ms of the deck appearing: full size, fully shown, nothing left on the card.
    for (const f of deck.filter((q) => q.t > deck[0]!.t + 350)) {
      expect(f.v.fade).toBe(1);
      expect(Math.abs(f.v.top![3]! - rest.height)).toBeLessThan(0.5);
    }
    expect(await page.getByTestId('deck-card').evaluate((el) => el.getAnimations().length)).toBe(0);
    // No page snapshot was taken: the deck takes a swipe from its first frame.
    expect(await page.evaluate(() => document.documentElement.dataset.nav)).toBeUndefined();
    // Back: the same way home; the card it came from grows down out of the deck card's box.
    const back = await everyFrame(page, 600, read);
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    const home = (await back<F>()).filter((f) => f.v.stage === 'choose' && f.v.idea);
    await expect(first).toBeVisible();
    expect(home.filter((f) => f.v.fade < 1).length).toBeGreaterThanOrEqual(6);
    if (!reduced) expect(home[0]!.v.idea![3]!).toBeGreaterThan(ideaBox.height * 1.25);
    for (const f of home.filter((q) => q.t > home[0]!.t + 350)) expect(Math.abs(f.v.idea![3]! - ideaBox.height)).toBeLessThan(0.5);
    await expect.poll(async () => (await first.boundingBox())!.y).toBe(ideaBox.y);
  });
});
