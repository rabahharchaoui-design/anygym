import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from './fixtures';
import { checkLayout, insetsOf, simulateSafeAreas, type Insets } from './helpers/layout';
import { pastIntake, card } from './helpers/quick';
import { bar185, dbAll, dbPut, exerciseView, navIdle, seedFinished, usePlan } from './workout-helpers';

// PLAN 3.5h (G's iPhone 17 Pro Max): every screen, sheet and full screen view starts below the
// status bar and the Dynamic Island and ends above the home indicator. Playwright has no notch, so
// tests/helpers/layout.ts `simulateSafeAreas` sets the app's --safe-top/-bottom/-left/-right (the
// only way the app reads the insets, src/styles/tokens.css) to each phone's real ones before the app
// loads: 62/34 on the 17 Pro Max, 59/34 on the 15, 20/0 on the SE, 48/24 on the Pixel 7. Then
// `checkLayout` fails on any visible control whose box reaches into an inset (scrolled into view
// first, so a list's last row must clear the home indicator too). Each screen also checks that the
// document itself cannot scroll (a scrolled document lifts a fixed frame under the status bar) and
// that the screen's own background, not a gap, fills the status bar area.
// Screenshots of every screen: reports/shots/3.5h/<screen>-<phone>.png (17 Pro Max, 15, SE, Pixel 7).

const IMPORT_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json');
const SHOT_PHONES = new Set(['iPhone 17 Pro Max', 'iPhone 15', 'iPhone SE', 'Pixel 7']);
const SHOTS = 'reports/shots/3.5h';

test.beforeEach(async ({ page }) => simulateSafeAreas(page));

/** The checks of one screen, then its screenshot. */
async function screen(page: Page, name: string, opts: { primary?: Locator; insets?: Insets } = {}) {
  await checkLayout(page, opts);
  const doc = await page.evaluate(() => {
    const se = document.scrollingElement!;
    // The status bar area: what is drawn there (topmost, at the inset's middle).
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
    const at = document.elementFromPoint(innerWidth / 2, Math.max(1, top / 2));
    return { overflow: se.scrollHeight - innerHeight, scrolled: scrollY, topIsBody: !at || at === document.body || at === document.documentElement };
  });
  expect(doc.scrolled, `${name}: the document is at the top`).toBe(0);
  expect(doc.overflow, `${name}: the document itself never scrolls (each screen scrolls its own frame)`).toBeLessThanOrEqual(1);
  expect(doc.topIsBody, `${name}: the screen's own bar or background fills the status bar area`).toBe(false);
  const phone = test.info().project.name;
  if (!SHOT_PHONES.has(phone)) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${phone.replace(/ /g, '-')}.png` });
}

const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name });

test.describe('safe areas on every screen @matrix', () => {
  test('tabs, plans, settings and gyms', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'See plans' })).toBeVisible();
    await screen(page, 'today', { primary: page.getByRole('button', { name: 'See plans' }) });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'History' }).tap();
    await expect(page.getByText('No workouts yet')).toBeVisible();
    await screen(page, 'history-empty');
    await nav.getByRole('link', { name: 'Run' }).tap();
    await expect(page.getByText('No runs yet')).toBeVisible();
    await screen(page, 'run');
    await nav.getByRole('link', { name: 'Plans' }).tap();
    await expect(page.getByTestId('place-home')).toBeVisible();
    await screen(page, 'plans', { primary: page.getByTestId('place-home') });
    await page.getByTestId('place-home').tap();
    await expect(page).toHaveURL(/#\/plans\/place\//);
    await screen(page, 'place-plans');
    await page.goto('./#/plans/five-day-split');
    await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
    await screen(page, 'plan-viewer', { primary: page.getByRole('button', { name: 'Use this plan' }) });
    await page.goto('./#/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await screen(page, 'settings');
    await page.getByTestId('settings-gyms').tap();
    await expect(page.getByTestId('gyms-list')).toBeVisible();
    await screen(page, 'gyms');
    await page.getByTestId('gyms-list').locator('button').first().tap();
    await expect(page).toHaveURL(/#\/settings\/gyms\/[^/]+$/);
    await screen(page, 'gym-detail');
    await page.goto('./#/settings');
    await page.getByTestId('import-file').setInputFiles(IMPORT_FIXTURE);
    await expect(page).toHaveURL(/#\/settings\/import$/);
    await screen(page, 'import-review', { primary: page.getByTestId('import-confirm') });
  });

  test('Today with a plan, Change day, the workout, its sheets, the demo viewer and Finish', async ({ page }) => {
    await usePlan(page);
    await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await screen(page, 'today-plan', { primary: page.getByRole('button', { name: 'Start', exact: true }) });
    await page.getByRole('button', { name: 'Change day' }).tap();
    await expect(dialog(page, 'Change day')).toBeVisible();
    await screen(page, 'change-day');
    await page.keyboard.press('Escape');
    await expect(dialog(page, 'Change day')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
    // The bug G saw: the header (timer and Finish) under the status bar and the island.
    const head = await page.getByRole('button', { name: 'Finish', exact: true }).boundingBox();
    expect(head!.y).toBeGreaterThanOrEqual(insetsOf().top);
    await screen(page, 'day-list', { primary: page.getByTestId('start-next') });
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = exerciseView(page, 'barbell-back-squat');
    await expect(view.getByTestId('check-current')).toBeEnabled();
    await page.waitForTimeout(400);
    await navIdle(page);
    await screen(page, 'exercise-view', { primary: view.getByTestId('check-current') });
    await view.getByTestId('check-current').tap();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await screen(page, 'exercise-rest', { primary: view.getByTestId('check-current') });
    await view.getByTestId('weight-cell').first().tap();
    const weight = dialog(page, 'Pick the weight');
    await expect(weight).toBeVisible();
    await screen(page, 'weight-sheet', { primary: weight.getByRole('button', { name: 'Done' }) });
    await weight.getByRole('button', { name: 'Done' }).tap();
    await expect(weight).toHaveCount(0);
    // The full screen demo.
    await page.getByRole('button', { name: 'How to do Barbell Back Squat' }).tap();
    const viewer = page.getByTestId('demo-viewer');
    // Short phones (the 320 x 568 floor) have no hero: the compact tile opens the How to sheet instead.
    if ((page.viewportSize()?.height ?? 0) < 600) {
      const sheet = dialog(page, 'How to do Barbell Back Squat');
      await expect(sheet).toBeVisible();
      await checkLayout(page);
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    } else {
      await expect(viewer).toBeVisible();
      await screen(page, 'demo-viewer');
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
    }
    // The ⋯ menu and Replace.
    await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
    await expect(page.getByTestId('replace-row')).toBeVisible();
    await screen(page, 'exercise-menu');
    await page.getByTestId('replace-row').tap();
    const replace = dialog(page, 'Replace Barbell Back Squat');
    await expect(replace).toBeVisible();
    await screen(page, 'replace');
    await page.keyboard.press('Escape');
    await expect(replace).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    const done = page.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeVisible();
    await screen(page, 'finish', { primary: done });
  });

  test('the exercise picker of a quick workout', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    await expect(dialog(page, 'Add exercise')).toBeVisible();
    await screen(page, 'picker');
  });

  test('Up next after the last set', async ({ page }) => {
    await page.goto('./');
    await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
    const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
    const id = `q-${Date.now()}`;
    const load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
    await dbPut(page, {
      sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 600_000, imported: false, exerciseIds: ['Barbell_Bench_Press_-_Medium_Grip'] }],
      sets: [0, 1].map((i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: 'Barbell_Bench_Press_-_Medium_Grip', order: i, kind: 'work', uncertain: false, reps: 10, load })),
    });
    await page.goto(`./#/workout/${id}`);
    await page.reload();
    await page.getByTestId('row-Barbell_Bench_Press_-_Medium_Grip').tap();
    await expect(exerciseView(page, 'Barbell_Bench_Press_-_Medium_Grip')).toBeVisible();
    await page.waitForTimeout(600);
    await page.getByTestId('check-current').tap();
    await expect(page.getByTestId('up-next')).toBeVisible({ timeout: 10_000 });
    await screen(page, 'up-next');
  });

  test('Quick: How long, the concepts and the deck', async ({ page }) => {
    await pastIntake(page);
    await page.getByTestId('build-card').tap();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    await screen(page, 'quick');
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    await screen(page, 'quick-deck', { primary: page.getByTestId('quick-start') });
  });

  test('History: the list and a workout', async ({ page }) => {
    await page.goto('./');
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] }, 3);
    await page.goto('./#/history');
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(1);
    await screen(page, 'history', { primary: rows.first() });
    await rows.first().tap();
    await expect(page.getByTestId('history-set')).toHaveCount(1);
    await screen(page, 'history-detail');
  });

  test('dev screens', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('anygym-dev', '1'));
    for (const [route, name] of [
      ['dev/viewport', 'dev-viewport'],
      ['dev/ui', 'dev-ui'],
      ['dev/plates', 'dev-plates'],
      ['dev/loads', 'dev-loads'],
      ['dev/info', 'dev-info'],
      ['dev/muscles', 'dev-muscles'],
    ] as const) {
      await page.goto(`./#/${route}`);
      await expect(page.locator('h1').first()).toBeVisible();
      await screen(page, name);
    }
  });
});

test.describe('safe areas: the intake funnel @matrix', () => {
  test.use({ intake: 'fresh' });

  test('the first question, one with a long list, and the reveal', async ({ page }) => {
    await page.goto('./');
    const intake = page.getByTestId('intake');
    await expect(intake).toHaveAttribute('data-step', 'goal');
    await screen(page, 'intake-goal');
    // The fastest honest path to the reveal (as tests/intake-3.3.spec.ts walks it).
    const at = (step: string) => expect(intake).toHaveAttribute('data-step', step);
    const pick = (q: string, id: string) => page.getByTestId(`q-${q}-${id}`).tap();
    const next = () => page.getByTestId('intake-cta').locator('button[data-variant="primary"]').tap();
    await pick('goal', 'muscle');
    await next();
    await at('units');
    await next();
    await at('focus');
    await pick('focus', 'balance');
    await next();
    await at('win');
    await pick('win', 'energy');
    await next();
    await at('experience');
    await pick('experience', '3y');
    await at('days');
    await pick('days', '5');
    await at('weekdays');
    await page.getByTestId('skip').tap();
    await at('minutes');
    await screen(page, 'intake-minutes');
    await pick('minutes', '60');
    await at('place');
    await pick('place', 'full');
    await at('equipment');
    await screen(page, 'intake-equipment');
    await next();
    await at('style');
    await pick('style', 'mix');
    await at('cardio');
    await pick('cardio', 'little');
    await next();
    await at('easyOn');
    await page.getByTestId('skip-rest').tap();
    await expect(intake).toHaveAttribute('data-step', 'reveal');
    await screen(page, 'intake-reveal', { primary: page.getByTestId('reveal-cta').locator('button[data-variant="primary"]') });
  });
});

test('safe areas: the landscape guard @matrix', async ({ page }) => {
  await page.goto('./');
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  const guard = page.getByTestId('landscape-guard');
  await expect(guard).toBeVisible();
  // Sideways, the island and the home indicator sit at the sides and the bottom.
  const p = insetsOf();
  const sideways: Insets = { top: 0, bottom: p.bottom ? 21 : 0, left: p.top > 24 ? p.top : 0, right: p.top > 24 ? p.top : 0 };
  await simulateSafeAreas(page, sideways);
  await page.reload();
  await expect(guard).toBeVisible();
  const box = (await guard.locator('p, h1, h2, svg').first().boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(sideways.left);
  expect(box.x + box.width).toBeLessThanOrEqual(height - sideways.right);
  if (SHOT_PHONES.has(test.info().project.name)) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/landscape-${test.info().project.name.replace(/ /g, '-')}.png` });
  }
});

// ---------------------------------------------------------------- PLAN 3.5h (2): moving previews

/**
 * A preview's demo: its two frames (start, end), and whether the end one is crossfading (the form
 * demo's loop, 3 s: 1.35 s each photo, 0.15 s fades). Our source has two photos per exercise, so
 * this is a two frame loop.
 */
const demoOf = (l: Locator) =>
  l.evaluate((root) => {
    const frames = [...root.querySelectorAll('[data-frame]')];
    const end = root.querySelector('[data-frame="1"]');
    const s = end ? getComputedStyle(end) : null;
    return {
      frames: frames.map((f) => f.getAttribute('data-frame')),
      moving: !!s && s.animationName !== 'none' && s.animationPlayState === 'running',
      duration: s?.animationDuration ?? null,
    };
  });

test.describe('moving previews', () => {
  test('the Quick deck card shows the same moving demo as the exercise screen, top card and the next only @matrix', async ({ page }) => {
    await pastIntake(page);
    await page.getByTestId('build-card').tap();
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    const top = card(page).getByTestId('deck-demo');
    await expect(top.locator('[data-frame="1"] img')).toHaveCount(1);
    expect(await demoOf(top)).toEqual({ frames: ['0', '1'], moving: true, duration: '3s' });
    // The card under it moves too (it is next); nothing else is drawn. 3.5f round 3 (B3): the move a
    // left puts in is drawn under it too (shown only while the card is dragged left).
    const under = page.locator('[data-under] [data-testid="deck-demo"]');
    for (const u of await under.all()) expect((await demoOf(u)).moving).toBe(true);
    await expect(page.getByTestId('deck-demo')).toHaveCount((await under.count()) + 1);
    // The end photo really shows during the loop (both frames loaded, the end one fades to 1).
    await expect.poll(() => top.locator('[data-frame="1"]').evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 4000 }).toBeGreaterThan(0.9);
  });

  test('day list tiles, Replace and Up next move while on screen; off screen tiles stay still', async ({ page }) => {
    await usePlan(page);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    const tiles = page.locator('[data-testid="thumb"][data-photo]');
    await expect(tiles.first()).toBeVisible();
    const states = () =>
      tiles.evaluateAll((els) =>
        els.map((el) => {
          const end = el.querySelector('[data-frame="1"]');
          const moving = !!end && getComputedStyle(end).animationName !== 'none';
          // Its part that can be seen: cut by every scroller it is in, and the screen (+ a margin).
          const r = el.getBoundingClientRect();
          let top = r.top;
          let bottom = r.bottom;
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (getComputedStyle(p).overflowY === 'visible') continue;
            const q = p.getBoundingClientRect();
            top = Math.max(top, q.top);
            bottom = Math.min(bottom, q.bottom);
          }
          const on = bottom - top > 1 && bottom > 0 && top < innerHeight;
          const off = bottom - top <= 0;
          return { frames: el.querySelectorAll('[data-frame]').length, ok: on ? moving : off ? !moving : true };
        }),
      );
    await expect.poll(async () => (await states()).every((s) => s.frames === 2 && s.ok), { timeout: 5000 }).toBe(true);
    // No sure demo, no photo (SPEC 4.3): the tile is the drawing, never a guessed picture.
    await expect(page.locator('[data-testid="thumb"]:not([data-photo]) [data-frame]')).toHaveCount(0);
    // Replace: every choice with a sure demo moves.
    await page.getByTestId('row-barbell-back-squat').tap();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'More for Barbell Back Squat' }).tap();
    await page.getByTestId('replace-row').tap();
    const replace = dialog(page, 'Replace Barbell Back Squat');
    await expect(replace).toBeVisible();
    // 3.5f: Replace opens as a swipe deck; "Show all" lists the options with their tiles.
    await replace.getByTestId('swap-all').tap();
    const choice = replace.locator('[data-testid="thumb"][data-photo]').first();
    await expect(choice).toBeVisible();
    await expect.poll(async () => (await demoOf(choice)).moving).toBe(true);
    expect((await demoOf(choice)).frames).toEqual(['0', '1']);
  });

  test('Up next moves; reduced motion keeps every preview still on its start photo', async ({ page }) => {
    await page.goto('./');
    await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
    const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
    const id = `q-${Date.now()}`;
    const ex = 'Barbell_Bench_Press_-_Medium_Grip';
    const load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
    await dbPut(page, {
      sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 600_000, imported: false, exerciseIds: [ex] }],
      sets: [0, 1].map((i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: ex, order: i, kind: 'work', uncertain: false, reps: 10, load })),
    });
    await page.goto(`./#/workout/${id}`);
    await page.reload();
    await page.getByTestId(`row-${ex}`).tap();
    await page.waitForTimeout(600);
    await page.getByTestId('check-current').tap();
    const pick = page.getByTestId('up-next-pick').locator('[data-testid="thumb"][data-photo]');
    await expect(pick).toBeVisible({ timeout: 10_000 });
    await expect.poll(async () => (await demoOf(pick)).moving).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await demoOf(pick)).moving).toBe(false);
    expect(await pick.locator('[data-frame="1"]').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  });
});
