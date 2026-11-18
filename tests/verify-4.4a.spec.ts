import { mkdirSync } from 'node:fs';
import { collectedErrors, expect, test, type Page } from './fixtures';
import { endAndDiscard, fix, live, move, openRun, pocketSeen, startRun, type Runner } from './helpers/run';
import { simulateSafeAreas } from './helpers/layout';

// PLAN 4.4a, G's hand test of the live run. (1) The clock counts 1, 2, 3 between GPS positions
// (iPhone Safari sends one every few seconds), stops on pause and on auto pause, and is what End
// saves. (2) The 3, 2, 1, GO countdown: giant ice numbers on graphite, never clipped, smooth under
// a 4x slower CPU, no console or CSP error from Start to the live screen (issue #2).

const SHOTS = process.env.SHOTS_44A;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

const PHONES = ['iPhone 15', 'iPhone SE', 'Small Android'];
// Each test names the phones it is about; the others skip it with that reason.
const onlyOn = (names: string[]) => test.skip(!names.includes(test.info().project.name), `runs on ${names.join(', ')}`);

const faceSec = async (page: Page) => Number(await live(page).getAttribute('data-moving-sec'));
const toSec = (text: string) => text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
const shownTime = async (page: Page) => toSec((await page.getByTestId('live-small-time').locator('span').first().textContent())!);

/** Stops the page's clock where it is: from here on only runFor moves it. */
async function holdClock(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 50);
}

/** One second on the page's clock; the face shows exactly `expected` (the attribute and the printed time). */
async function second(page: Page, expected: number) {
  await page.clock.runFor(1000);
  await expect.poll(() => faceSec(page), { message: `the face shows ${expected}` }).toBe(expected);
  expect(await shownTime(page)).toBe(expected);
}

test.describe('4.4a the live clock', () => {
  test('a position every 6 s: the time advances every second, stops on pause and on auto pause, and End saves it', async ({ page, context }) => {
    onlyOn(PHONES);
    test.setTimeout(120_000);
    const r: Runner = await startRun(page, context);
    await holdClock(page);
    let t = await faceSec(page);
    // 24 seconds of running, a position every 6.
    for (let f = 0; f < 4; f++) {
      for (let s = 0; s < 6; s++) await second(page, ++t);
      r.north += 18;
      await fix(r);
      // The position lands: the face neither steps back nor jumps.
      expect(await faceSec(page)).toBe(t);
    }

    // Pause by hand: the face stops where it was, however long the pause.
    await page.getByTestId('live-pause').tap();
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
    const paused = await faceSec(page);
    expect(paused).toBeGreaterThanOrEqual(t);
    expect(paused).toBeLessThanOrEqual(t + 1);
    await page.clock.runFor(5000);
    expect(await faceSec(page)).toBe(paused);

    // Resume: it stands until the first position, then counts on.
    await page.getByTestId('live-resume').tap();
    await page.clock.runFor(1000);
    r.north += 3;
    await fix(r);
    t = await faceSec(page);
    expect(t).toBe(paused);
    for (let s = 0; s < 3; s++) await second(page, ++t);

    // Standing still with auto pause on: once it says so, the face stands still too.
    for (let i = 0; i < 6 && (await live(page).getAttribute('data-status')) !== 'auto-paused'; i++) {
      await page.clock.runFor(6000);
      await fix(r);
    }
    await expect(live(page)).toHaveAttribute('data-status', 'auto-paused');
    const stood = await faceSec(page);
    for (let i = 0; i < 2; i++) {
      await page.clock.runFor(6000);
      await fix(r);
      expect(await faceSec(page), 'auto paused: the time does not move').toBe(stood);
    }

    // Moving again counts again; End saves what the face shows (never a second less, at most one more).
    await move(r, 2, 6);
    await page.clock.runFor(2500);
    const before = await faceSec(page);
    expect(before).toBeGreaterThan(stood);
    await page.clock.resume();
    await endAndDiscardKeepingTime(page, before);
  });
});

/** Holds End, checks the summary's time against the face, then discards the run. */
async function endAndDiscardKeepingTime(page: Page, face: number) {
  const end = page.getByTestId('live-end');
  const box = (await end.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1250);
  await page.mouse.up();
  await expect(page.getByTestId('run-summary')).toBeVisible();
  const saved = toSec((await page.getByTestId('summary-time').textContent())!);
  expect(saved, 'End saves at least what the face showed').toBeGreaterThanOrEqual(face);
  // The hold itself takes a second or two of running time on the clock.
  expect(saved).toBeLessThanOrEqual(face + 3);
  await page.getByTestId('summary-discard').tap();
  await expect(page.getByTestId('run-start')).toBeVisible();
}

/** The countdown's number, and the room around it, on this phone. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const n = document.querySelector('[data-testid="run-count"]')!.getBoundingClientRect();
    const stage = document.querySelector('[data-testid="run-count"]')!.parentElement!;
    return { top: n.top, bottom: n.bottom, left: n.left, right: n.right, height: n.height, vw: innerWidth, vh: innerHeight, cut: stage.scrollWidth > stage.clientWidth + 1 || stage.scrollHeight > stage.clientHeight + 1 };
  });

async function checkBeat(page: Page, beat: string, digits: boolean) {
  await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', beat);
  await expect(page.getByTestId('run-count')).toHaveText(beat === 'go' ? 'GO' : beat);
  const m = await measure(page);
  expect(m.cut, `${beat}: never clipped`).toBe(false);
  expect(m.top).toBeGreaterThanOrEqual(0);
  expect(m.left).toBeGreaterThanOrEqual(0);
  expect(m.right).toBeLessThanOrEqual(m.vw);
  expect(m.bottom).toBeLessThanOrEqual(m.vh);
  if (digits) {
    // About 60% of the screen height (the type size; a little less where the room is shorter).
    expect(m.height / m.vh, `${beat}: fills most of the screen`).toBeGreaterThanOrEqual(0.5);
    expect(m.height / m.vh).toBeLessThanOrEqual(0.62);
  }
}

test.describe('4.4a the countdown', () => {
  test('3, 2, 1, GO: giant ice numbers, never clipped, also at 130% text; then the live run @matrix', async ({ page, context }) => {
    for (const zoom of [1, 1.3]) {
      if (zoom !== 1) {
        // Safari's 130% text zoom scales the whole page: the same phone, 1.3 times fewer CSS pixels.
        const vp = page.viewportSize()!;
        await page.setViewportSize({ width: Math.round(vp.width / zoom), height: Math.round(vp.height / zoom) });
      }
      if (zoom === 1) await openRun(page, context);
      await holdClock(page);
      await page.getByTestId('run-start').tap();
      const color = await page.getByTestId('run-count').evaluate((el) => getComputedStyle(el).backgroundImage);
      // Ice (#9fd3ff, lit with #c6e5ff), no lime.
      expect(color).toMatch(/159, 211, 255|9fd3ff/i);
      expect(await page.getByTestId('run-count').evaluate((el) => getComputedStyle(el).fontWeight)).toBe('900');
      for (const beat of ['3', '2', '1']) {
        await checkBeat(page, beat, true);
        await page.clock.runFor(1000);
      }
      await checkBeat(page, 'go', false);
      await expect(page.getByRole('timer')).toHaveAttribute('aria-label', 'Go');
      await page.clock.runFor(700);
      await expect(live(page)).toBeVisible();
      await expect(page.getByTestId('run-countdown')).toHaveCount(0);
      await page.clock.resume();
      await endAndDiscard(page);
    }
  });

  test('while the countdown is up the map sleeps, and GPS is already on', async ({ page, context }) => {
    onlyOn(PHONES);
    await page.addInitScript(() => {
      const w = window as unknown as { __watches: number };
      w.__watches = 0;
      const geo = navigator.geolocation;
      const watch = geo.watchPosition.bind(geo);
      geo.watchPosition = (...a: Parameters<Geolocation['watchPosition']>) => (w.__watches++, watch(...a));
    });
    await openRun(page, context);
    await holdClock(page);
    const watches = await page.evaluate(() => (window as unknown as { __watches: number }).__watches);
    await page.getByTestId('run-start').tap();
    await expect(page.getByTestId('run-map')).toHaveAttribute('data-asleep', 'true');
    expect(await page.getByTestId('run-map').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
    expect(await page.evaluate(() => (window as unknown as { __watches: number }).__watches), 'the run watch starts with the countdown').toBe(watches + 1);
    await page.clock.runFor(3700);
    await expect(live(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __watches: number }).__watches), 'the run keeps that watch').toBe(watches + 1);
    await page.clock.resume();
    await endAndDiscard(page);
  });

  test('Start to the live screen: no console message and no CSP violation (issue #2)', async ({ page, context }) => {
    onlyOn(PHONES);
    await page.addInitScript(() => {
      const w = window as unknown as { __csp: string[] };
      w.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
    });
    const said: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') said.push(`${m.type()}: ${m.text()}`);
    });
    // No screenshots in this test: Playwright's own screenshot style would be refused by the CSP.
    await simulateSafeAreas(page);
    await pocketSeen(page);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.7812, longitude: -73.9665, accuracy: 5 });
    await page.goto('./#/run');
    await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');
    said.length = 0;
    await page.getByTestId('run-start').tap();
    await expect(page.getByTestId('run-countdown')).toBeVisible();
    await expect(live(page)).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
    expect(said).toEqual([]);
    expect(collectedErrors()).toEqual([]);
    await endAndDiscard(page);
  });

  test('smooth under a 4x slower CPU: no frame gap over 50 ms during the whole countdown', async ({ page, context }) => {
    onlyOn(['Pixel 7']);
    await simulateSafeAreas(page);
    await pocketSeen(page);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 40.7812, longitude: -73.9665, accuracy: 5 });
    await page.goto('./#/run');
    await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');
    await page.waitForTimeout(500);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      await page.evaluate(() => {
        const w = window as unknown as { __gaps: number[]; __frames: number };
        w.__gaps = [];
        w.__frames = 0;
        let last = -1;
        const loop = (t: number) => {
          if (document.querySelector('[data-testid="run-countdown"]')) {
            if (last >= 0) w.__gaps.push(t - last);
            last = t;
            w.__frames++;
          } else if (last >= 0) return;
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      await page.getByTestId('run-start').tap();
      await expect(page.getByTestId('run-countdown')).toBeVisible();
      await expect(live(page)).toBeVisible({ timeout: 15_000 });
      const { gaps, frames } = await page.evaluate(() => {
        const w = window as unknown as { __gaps: number[]; __frames: number };
        return { gaps: w.__gaps, frames: w.__frames };
      });
      const worst = Math.max(...gaps);
      test.info().annotations.push({ type: 'worst frame gap (ms) at 4x', description: worst.toFixed(1) }, { type: 'frames', description: String(frames) });
      console.log(`4.4a countdown at 4x CPU: ${frames} frames, worst gap ${worst.toFixed(1)} ms`);
      expect(frames, 'the countdown ran its 3.6 s').toBeGreaterThan(150);
      expect(worst, 'no frame gap over 50 ms').toBeLessThanOrEqual(50);
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    await endAndDiscard(page);
  });

  test('screenshots of 3, 2, 1, GO for the report', async ({ page, context }) => {
    onlyOn(['iPhone SE', 'iPhone 17 Pro Max', '320 floor']);
    test.skip(!SHOTS, 'set SHOTS_44A to a folder');
    await openRun(page, context);
    await holdClock(page);
    await page.getByTestId('run-start').tap();
    for (const beat of ['3', '2', '1', 'go']) {
      await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', beat);
      // The arrival is a CSS animation on real time: let it land.
      await page.waitForTimeout(beat === 'go' ? 260 : 320);
      await shot(page, `countdown-${beat}`);
      await page.clock.runFor(1000);
    }
  });
});
