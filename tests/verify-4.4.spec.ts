import { mkdirSync } from 'node:fs';
import { allowConsoleErrors, expect, test, type BrowserContext, type Page } from './fixtures';
import { checkLayout } from './helpers/layout';
import { firstFix, live, move, openRun, wake, type Runner } from './helpers/run';
import { flashes, played, playedIds, spoken, stubVoice } from './helpers/voice';

// PLAN 4.4 (SPEC 12.4, 12.7): the voice coach and intervals. The run is the synthetic one of
// verify-4.3 (helpers/run.ts): Playwright's position stepped north, page.clock moved by hand. The
// voice's outputs are replaced (helpers/voice.ts), so a test reads which clips were scheduled, in
// which order and when. One test plays the real files through the real decoder (WebKit only: the
// test Chromium has no AAC decoder, a real Android phone has).

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

const SHOTS = process.env.SHOTS_44;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
};

/** Taps Start and waits for the live run with its first position. */
async function begin(page: Page, context: BrowserContext): Promise<Runner> {
  await page.getByTestId('run-start').tap();
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  return { page, context, north: 0 };
}
async function open(page: Page, context: BrowserContext) {
  await stubVoice(page);
  await openRun(page, context);
}
const settings = async (page: Page) => {
  await page.getByTestId('run-settings').tap();
  await expect(page.getByTestId('run-settings-sheet')).toBeVisible();
};
/**
 * Done on the run settings sheet. Once this spec has jumped the page's clock (runFor), the sheet's
 * slide away never reports its end in the test browser, so the sheet's node stays although it is
 * closed: no longer a dialog, taking no taps (checked by hand: with real waiting instead of a clock
 * jump it goes within half a second). So "closed" here means: the dialog is gone.
 */
const closeSettings = async (page: Page) => {
  await page.getByTestId('run-settings-done').tap();
  await expect(page.getByRole('dialog', { name: 'Run settings' })).toHaveCount(0);
};
const voiceSwitch = (page: Page) => page.getByRole('switch', { name: /Voice coach/ });
/**
 * Waits until `n` clips were scheduled, moving the clock on in small steps (a cue waits for the one
 * before it to end). Small steps on purpose: a long stretch of clock with no position is a GPS gap.
 */
async function saidCount(page: Page, n: number) {
  await expect.poll(async () => (await page.clock.runFor(400), (await playedIds(page)).length), { timeout: 20_000, message: `${n} clips scheduled` }).toBeGreaterThanOrEqual(n);
}
/** Cues are queued: the clock moves on until the list stops growing. Only where no run is being measured. */
async function settled(page: Page) {
  // Longer than any one sentence, so the queue is past whatever was playing.
  await page.clock.runFor(8000);
  let before = -1;
  for (let i = 0; i < 20; i++) {
    const n = (await playedIds(page)).length + (await spoken(page)).length;
    if (n === before) return;
    before = n;
    await page.clock.runFor(1500);
  }
}
const PREVIEW = ['n1', 'kilometer', 'min9', 'sec12', 'pace', 'n9', 'n12'];

test.describe('4.4 voice coach', () => {
  test('a km split is said as one sentence: the clips, their order, back to back @matrix', async ({ page, context }) => {
    await open(page, context);
    const r = await begin(page, context);
    await saidCount(page, 1);
    expect(await playedIds(page), 'the start is said').toEqual(['run_started']);
    // 5 m/s, a position every 10 s: the first km ends at 200 s (3:20).
    await move(r, 21, 10, 5);
    await saidCount(page, 8);
    const ids = await playedIds(page);
    expect(ids.slice(0, 3)).toEqual(['run_started', 'n1', 'kilometer']);
    expect(ids[3]).toBe('min3');
    expect(ids[4]).toMatch(/^sec(18|19|20|21|22)$/);
    expect(ids[5]).toBe('pace');
    expect(ids[6]).toBe('n3');
    expect(ids[7]).toMatch(/^n(18|19|20|21|22)$/);
    expect(ids).toHaveLength(8);
    // One sentence: every clip starts after the one before it ended, with a gap of at most the full stop pause.
    const clips = (await played(page)).slice(1);
    for (let i = 1; i < clips.length; i++) {
      const gap = clips[i]!.at - (clips[i - 1]!.at + clips[i - 1]!.dur);
      expect(gap, `no overlap before ${clips[i]!.id}`).toBeGreaterThanOrEqual(0.02);
      expect(gap, `no hole before ${clips[i]!.id}`).toBeLessThanOrEqual(0.36);
    }
    // The silence around the sound of a decoded clip is not played.
    expect(clips[0]!.dur).toBeCloseTo(0.508, 2);
    expect(await spoken(page), "the phone's own voice stays quiet").toEqual([]);

    // Pause and resume are said too, each once, never on top of each other.
    await wake(page);
    await page.getByTestId('live-pause').tap();
    // The button ignores a second tap that comes within a moment of the first (double tap guard).
    await page.clock.runFor(700);
    await page.getByTestId('live-resume').tap();
    await settled(page);
    expect((await playedIds(page)).slice(8)).toEqual(['paused', 'resumed']);
    const tail = (await played(page)).slice(8);
    expect(tail[1]!.at).toBeGreaterThanOrEqual(tail[0]!.at + tail[0]!.dur);
  });

  test('voice off plays nothing at all', async ({ page, context }) => {
    await open(page, context);
    await settings(page);
    await expect(voiceSwitch(page)).toBeChecked();
    await page.getByText('Voice coach', { exact: true }).tap();
    await expect(voiceSwitch(page)).not.toBeChecked();
    await expect(page.getByTestId('voice-settings')).toHaveCount(0);
    await closeSettings(page);
    const r = await begin(page, context);
    await move(r, 21, 10, 5);
    await wake(page);
    await page.getByTestId('live-pause').tap();
    await settled(page);
    expect(await playedIds(page)).toEqual([]);
    expect(await spoken(page)).toEqual([]);
    // The choice is remembered.
    await page.reload();
    await expect(live(page)).toBeVisible();
    await page.getByTestId('live-settings').tap();
    await expect(voiceSwitch(page)).not.toBeChecked();
  });

  test('how often: every 2nd km says only the even ones', async ({ page, context }) => {
    test.slow();
    await open(page, context);
    await settings(page);
    await page.getByTestId('voice-splits').getByRole('radio', { name: 'Every 2nd' }).tap();
    await closeSettings(page);
    const r = await begin(page, context);
    // 7 m/s, a position every 10 s: a km every 143 s.
    await move(r, 15, 10, 7);
    await page.clock.runFor(1500);
    expect(await playedIds(page), 'km 1 is not said').toEqual(['run_started']);
    await move(r, 14, 10, 7);
    await saidCount(page, 8);
    const ids = await playedIds(page);
    expect(ids.slice(1, 4), 'km 2 is said').toEqual(['n2', 'kilometers', 'min4']);
    // That km's own pace: 2:23 at 7 m/s.
    expect(ids.slice(5, 7)).toEqual(['pace', 'n2']);
    expect(ids[7]).toMatch(/^n2[1-5]$/);
    expect(ids).toHaveLength(8);
  });

  test('how often: never says no split, but pause and resume are still said; a change in the run settings of a paused run counts at once', async ({ page, context }) => {
    await open(page, context);
    await settings(page);
    await page.getByTestId('voice-splits').getByRole('radio', { name: 'Never' }).tap();
    await closeSettings(page);
    const r = await begin(page, context);
    await move(r, 21, 10, 5);
    await page.clock.runFor(1500);
    expect(await playedIds(page), 'km 1 is not said').toEqual(['run_started']);
    await wake(page);
    await page.getByTestId('live-pause').tap();
    await saidCount(page, 2);
    // Run settings of the paused run: every km again.
    await page.getByTestId('live-settings').tap();
    await expect(page.getByTestId('voice-splits').getByRole('radio', { name: 'Never' })).toBeChecked();
    await page.getByTestId('voice-splits').getByRole('radio', { name: 'Always' }).tap();
    await closeSettings(page);
    await page.getByTestId('live-resume').tap();
    await saidCount(page, 3);
    expect(await playedIds(page)).toEqual(['run_started', 'paused', 'resumed']);
    r.north += 30;
    await move(r, 21, 10, 5);
    await saidCount(page, 5);
    expect((await playedIds(page)).slice(3, 5), 'km 2 is said').toEqual(['n2', 'kilometers']);
  });

  test('Play a sample says a whole split sentence, also with the voice set to say no splits @matrix', async ({ page, context }) => {
    await open(page, context);
    await settings(page);
    await page.getByTestId('voice-splits').getByRole('radio', { name: 'Never' }).tap();
    await checkLayout(page, { scope: '[data-testid="run-settings-sheet"]' });
    await shot(page, 'voice-settings');
    await page.getByTestId('voice-preview').tap();
    await settled(page);
    expect(await playedIds(page)).toEqual(PREVIEW);
    expect(await spoken(page)).toEqual([]);
    // Two quick taps: two sentences, one after the other, never mixed.
    await page.getByTestId('voice-preview').tap();
    await page.getByTestId('voice-preview').tap();
    await settled(page);
    expect(await playedIds(page)).toEqual([...PREVIEW, ...PREVIEW, ...PREVIEW]);
    const clips = await played(page);
    for (let i = 1; i < clips.length; i++) expect(clips[i]!.at).toBeGreaterThanOrEqual(clips[i - 1]!.at + clips[i - 1]!.dur);
  });

  test('a clip that cannot be loaded: the whole sentence is said by the best installed voice, never both', async ({ page, context }) => {
    allowConsoleErrors(/Failed to load resource.*voice\/kilometer\.m4a/);
    await page.route('**/voice/kilometer.m4a*', (route) => route.fulfill({ status: 404, body: 'gone' }));
    await open(page, context);
    await settings(page);
    await page.getByTestId('voice-preview').tap();
    await settled(page);
    expect(await playedIds(page), 'no recorded clip is played for that sentence').toEqual([]);
    expect(await spoken(page)).toEqual([{ text: 'One kilometer. Nine minutes, Twelve seconds. Pace Nine Twelve', voice: 'Ava (Premium)' }]);
    // The clip is tried again next time: once it loads, the recorded voice is back.
    await page.unroute('**/voice/kilometer.m4a*');
    await page.getByTestId('voice-preview').tap();
    await settled(page);
    expect(await playedIds(page)).toEqual(PREVIEW);
    expect(await spoken(page)).toHaveLength(1);
  });

  test('the real files through the real decoder: a sample plays with no error (WebKit)', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'webkit', 'the test Chromium ships without an AAC decoder');
    const asked: string[] = [];
    page.on('response', (res) => /\/voice\/[^/]+\.m4a/.test(res.url()) && asked.push(`${res.status()} ${/voice\/([^.]+)/.exec(res.url())![1]}`));
    await page.addInitScript(() => {
      // Counts what really reaches the speakers' queue, and whether speech was needed.
      const w = window as unknown as { __real: { started: number; spoke: number } };
      w.__real = { started: 0, spoke: 0 };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...a: Parameters<typeof start>) {
        w.__real.started++;
        return start.apply(this, a);
      };
      const speak = window.speechSynthesis?.speak;
      if (speak) window.speechSynthesis.speak = (u) => (w.__real.spoke++, speak.call(window.speechSynthesis, u));
    });
    await openRun(page, context);
    await settings(page);
    await page.getByTestId('voice-preview').tap();
    await expect.poll(async () => (await page.clock.runFor(500), page.evaluate(() => (window as unknown as { __real: { started: number } }).__real.started)), { timeout: 15_000 }).toBe(7);
    expect(await page.evaluate(() => (window as unknown as { __real: { spoke: number } }).__real.spoke)).toBe(0);
    // Each clip of the sentence came from the built app (the rest of the pack is being saved in the background meanwhile).
    for (const id of PREVIEW) expect(asked, id).toContain(`200 ${id}`);
  });
});

test.describe('4.4 intervals', () => {
  test('Beginner: the ring, RUN then WALK, the colour change and a cue at the switch; pause freezes the block @matrix', async ({ page, context }) => {
    await open(page, context);
    await page.getByTestId('run-type-intervals').tap();
    await expect(page.getByTestId('goal-sheet-intervals')).toBeVisible();
    await page.getByTestId('interval-beginner').tap();
    await expect(page.getByTestId('goal-sheet-intervals')).toBeHidden();
    const r = await begin(page, context);
    const face = page.getByTestId('interval-face');
    await expect(face).toBeVisible();
    await expect(page.getByTestId('interval-name')).toHaveText('RUN');
    await expect(page.getByTestId('interval-round')).toHaveText('1 of 8');
    await expect(face).toHaveAttribute('data-effort', 'push');
    await expect(live(page)).toHaveAttribute('data-effort', 'push');
    const ringColour = () => face.locator('svg circle').last().evaluate((el) => getComputedStyle(el).stroke);
    await move(r, 4);
    await expect(page.getByTestId('interval-count')).toHaveText(/^0:(3[6-9]|40)$/);
    const push = await ringColour();
    await wake(page);
    await checkLayout(page, { scope: '[data-testid="live-run"]' });
    await shot(page, 'interval-run');
    // The three numbers are all there, small, under the ring.
    for (const m of ['distance', 'time', 'pace']) await expect(page.getByTestId(`live-small-${m}`)).toBeVisible();
    const row = await Promise.all(['distance', 'time', 'pace'].map(async (m) => (await page.getByTestId(`live-small-${m}`).boundingBox())!));
    expect(Math.abs(row[0]!.y - row[2]!.y), 'one row of three').toBeLessThan(2);
    expect(row[2]!.y + row[2]!.height, 'clear of the controls').toBeLessThanOrEqual((await page.getByTestId('live-controls').boundingBox())!.y);
    await expect(page.getByTestId('live-big')).toHaveCount(0);

    await move(r, 9);
    await expect(page.getByTestId('interval-name')).toHaveText('WALK');
    await expect(face).toHaveAttribute('data-effort', 'ease');
    await expect(page.getByTestId('interval-tint')).toHaveAttribute('data-effort', 'ease');
    expect(await ringColour(), 'the ring changed colour').not.toBe(push);
    expect(await flashes(page), 'the screen flashed in the new colour once').toEqual(['ease']);
    await settled(page);
    expect(await playedIds(page)).toEqual(['run_started', 'run', 'walk']);
    await wake(page);
    await checkLayout(page, { scope: '[data-testid="live-run"]' });
    await shot(page, 'interval-walk');

    // Pause freezes the block; resume goes on from the same second.
    await page.getByTestId('live-pause').tap();
    const frozen = await page.getByTestId('interval-count').textContent();
    await page.clock.runFor(90_000);
    await expect(page.getByTestId('interval-count')).toHaveText(frozen!);
    await expect(page.getByTestId('interval-name')).toHaveText('WALK');
    await page.getByTestId('live-resume').tap();
    await page.clock.runFor(10_000);
    await expect(page.getByTestId('interval-count')).not.toHaveText(frozen!);
    await settled(page);
    expect((await playedIds(page)).slice(3)).toEqual(['paused', 'resumed']);
  });

  test('a custom set built with taps runs to its end: every switch is said, "last one", then the free run goes on', async ({ page, context }) => {
    test.slow();
    await open(page, context);
    await page.getByTestId('run-type-intervals').tap();
    await page.getByTestId('interval-custom').tap();
    const editor = page.getByTestId('interval-editor');
    await expect(editor).toBeVisible();
    // Run 2 min, walk 1 min, 5 times becomes: sprint 30 s, easy 30 s, 2 times.
    for (let i = 0; i < 3; i++) await page.getByTestId('block-0-time-less').tap();
    await expect(page.getByTestId('block-0-time-value')).toHaveText('30 s');
    await expect(page.getByTestId('block-0-time-less')).toBeDisabled();
    await page.getByTestId('block-1-time-less').tap();
    await page.getByTestId('block-0-name').tap();
    await page.getByTestId('block-name-sprint').tap();
    await page.getByTestId('block-1-name').tap();
    await page.getByTestId('block-name-easy').tap();
    for (let i = 0; i < 3; i++) await page.getByTestId('rounds-less').tap();
    await expect(page.getByTestId('rounds-value')).toHaveText('2 times');
    await expect(page.getByTestId('interval-total')).toHaveText('2 min in all');
    // Bounds: four blocks at most, and a block can be taken away again.
    await page.getByTestId('block-add').tap();
    await page.getByTestId('block-add').tap();
    await expect(page.getByTestId('block-add')).toHaveCount(0);
    await page.getByTestId('block-3-name').tap();
    await page.getByTestId('block-3-remove').tap();
    await page.getByTestId('block-2-name').tap();
    await page.getByTestId('block-2-remove').tap();
    await expect(page.getByTestId('block-2')).toHaveCount(0);
    await checkLayout(page, { scope: '[data-testid="goal-sheet-intervals"]' });
    await shot(page, 'custom-intervals');
    await page.getByTestId('goal-done').tap();
    await expect(page.getByTestId('run-goal')).toContainText('Custom');
    await expect(page.getByTestId('run-goal')).toContainText('Sprint 30 s, easy 30 s, 2 times');

    await begin(page, context);
    await expect(page.getByTestId('interval-name')).toHaveText('SPRINT');
    await expect(page.getByTestId('interval-round')).toHaveText('1 of 2');
    await page.clock.runFor(31_000);
    await expect(page.getByTestId('interval-name')).toHaveText('EASY');
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('interval-name')).toHaveText('SPRINT');
    await expect(page.getByTestId('interval-round')).toHaveText('2 of 2');
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('interval-name')).toHaveText('EASY');
    await page.clock.runFor(31_000);
    // The blocks are over: the ring goes, the big number is back, one quiet line says why.
    await expect(page.getByTestId('interval-face')).toHaveCount(0);
    await expect(page.getByTestId('intervals-done')).toBeVisible();
    await expect(page.getByTestId('live-big')).toBeVisible();
    await expect(live(page)).not.toHaveAttribute('data-effort', /./);
    await page.clock.runFor(20_000);
    await settled(page);
    expect(await playedIds(page), 'done is said once').toEqual(['run_started', 'sprint', 'easy', 'last_one', 'sprint', 'easy', 'intervals_done']);
    expect(await flashes(page)).toEqual(['ease', 'push', 'ease']);
    await wake(page);
    await checkLayout(page, { scope: '[data-testid="live-run"]' });
  });

  test('a reload in the middle of a block: back paused on the same block, nothing said again, the next switch is not missed', async ({ page, context }) => {
    test.slow();
    await open(page, context);
    await page.getByTestId('run-type-intervals').tap();
    await page.getByTestId('interval-beginner').tap();
    const r = await begin(page, context);
    await move(r, 14);
    await expect(page.getByTestId('interval-name')).toHaveText('WALK');
    await page.clock.runFor(6000);
    await page.reload();
    await expect(live(page)).toBeVisible();
    await expect(live(page)).toHaveAttribute('data-status', 'paused');
    await expect(page.getByTestId('interval-name')).toHaveText('WALK');
    await expect(page.getByTestId('interval-count')).toHaveText(/^1:(4\d|5\d)$/);
    // A long time later, still paused (one jump of the clock: the block must not move).
    await page.clock.fastForward(200_000);
    await page.clock.runFor(2000);
    await expect(page.getByTestId('interval-name')).toHaveText('WALK');
    expect(await playedIds(page), 'nothing is said by a run that only came back').toEqual([]);
    await page.getByTestId('live-resume').tap();
    await page.clock.runFor(121_000);
    await expect(page.getByTestId('interval-name')).toHaveText('RUN');
    await expect(page.getByTestId('interval-round')).toHaveText('2 of 8');
    await settled(page);
    expect(await playedIds(page)).toEqual(['resumed', 'run']);
  });

  test('130% text and reduced motion: the ring, its words and the controls all fit; the colour still changes, without the flash', async ({ page, context }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, context);
    await page.getByTestId('run-type-intervals').tap();
    await page.getByTestId('interval-speed').tap();
    await begin(page, context);
    await expect(page.getByTestId('interval-name')).toHaveText('HARD');
    await page.clock.runFor(61_000);
    await expect(page.getByTestId('interval-name')).toHaveText('EASY');
    await expect(page.getByTestId('interval-face')).toHaveAttribute('data-effort', 'ease');
    expect(await flashes(page)).toEqual([]);
    await wake(page);
    await page.getByTestId('live-pause').tap();
    await page.evaluate(() => {
      const sizes = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="live-run"] *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
      for (const { el, size } of sizes) el.style.fontSize = `${size * 1.3}px`;
    });
    await page.waitForTimeout(300);
    const cut = await page.evaluate(() => {
      const out: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth) out.push('page scrolls sideways');
      const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      for (const id of ['interval-face', 'interval-name', 'interval-count', 'interval-round', 'live-note', 'live-small-distance', 'live-small-time', 'live-small-pace', 'live-lock', 'live-resume', 'live-end']) {
        const r = box(id);
        if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`${id}: off the side`);
        if (r.bottom > innerHeight + 0.5 || r.top < 0) out.push(`${id}: off the screen`);
      }
      // The words stay inside the ring, and the numbers stay clear of the controls.
      const ring = box('interval-face');
      for (const id of ['interval-name', 'interval-count', 'interval-round']) {
        const r = box(id);
        if (r.left < ring.left || r.right > ring.right || r.top < ring.top || r.bottom > ring.bottom) out.push(`${id}: outside the ring`);
      }
      if (box('live-small-time').bottom > box('live-controls').top) out.push('numbers under the controls');
      if (box('live-note').bottom > ring.top + 1) out.push('note over the ring');
      return out;
    });
    expect(cut).toEqual([]);
    await shot(page, 'interval-text-130');
  });
});
