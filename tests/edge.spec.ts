import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from './fixtures';
import type { Session, WorkoutSet } from '../src/db/types';
import { fullyShown } from './helpers/layout';
import { addIdbSeams, heldWrites, holdNextSetWrite, releaseSetWrite } from './helpers/idb';
import { bar185, dbAll, dbPut, seedFinished, usePlan } from './workout-helpers';

// SPEC 13.3 edge cases, on the whole device matrix: a brand new user, very long exercise names,
// 0 and huge weights, kg and lb, offline logging, double taps on every primary button, fast back
// and forth navigation, and the React level delayed Log transaction (codex bughunt 0800 #5).

const IMPORT_FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'import', '__tests__', 'fixtures', 'synthetic-import-v1.json');

const noSideScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

/**
 * Every element inside `scope` lies within the viewport horizontally (nothing wider than the
 * screen). Elements inside a container that clips or scrolls sideways (a chip row) are judged by
 * that container.
 */
async function nothingWider(scope: Locator) {
  const over = await scope.evaluate((root) => {
    const out: string[] = [];
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible') return true;
      return false;
    };
    for (const el of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || clipped(el)) continue;
      if (r.left < -1 || r.right > innerWidth + 1) out.push(`${el.tagName}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return out;
  });
  expect(over).toEqual([]);
}

async function quick(page: Page, query: string, name: string) {
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(query);
  await sheet.getByRole('button', { name, exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
  await expect(sheet).toHaveCount(0);
}

const picker = (page: Page) => page.getByRole('dialog', { name: 'Pick the weight' });

async function pick45(page: Page, view: Locator) {
  await view.getByTestId('weight-cell').first().tap();
  await picker(page).getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker(page).getByRole('button', { name: 'Done' }).tap();
  await expect(picker(page)).toHaveCount(0);
}

const sets = async (page: Page) => (await dbAll<WorkoutSet>(page, 'sets')).sort((a, b) => a.order - b.order);

/** Two touch taps on the same point, a thumb's double tap. */
async function doubleTap(page: Page, l: Locator, gap = 60) {
  await l.tap({ trial: true }); // visible, stable and hit-testable first
  const box = (await l.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(gap);
  await page.touchscreen.tap(x, y);
}

test.describe('edge cases @matrix', () => {
  test('brand new user: every screen is honest, nothing invented', async ({ page }) => {
    await page.goto('./');
    const main = page.getByRole('main');
    await expect(page.getByRole('heading', { level: 2, name: 'Pick a plan' })).toBeVisible();
    // No weight anywhere for someone who never lifted.
    expect(await main.textContent()).not.toMatch(/\d\s?(lb|kg)\b/);
    await noSideScroll(page);
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'History' }).tap();
    await expect(page.getByText('No workouts yet')).toBeVisible();
    await noSideScroll(page);
    await nav.getByRole('link', { name: 'Run' }).tap();
    await expect(page.getByText('No runs yet')).toBeVisible();
    await nav.getByRole('link', { name: 'Plans' }).tap();
    await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
    await noSideScroll(page);
    await nav.getByRole('link', { name: 'Today' }).tap();
    await page.getByRole('link', { name: 'Settings' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await noSideScroll(page);
    // A first exercise: no Last time, no guessed weight, the ✓ waits for a pick.
    await quick(page, 'back squat', 'Barbell Back Squat');
    const view = page.getByTestId('exercise-barbell-back-squat');
    await expect(view.getByTestId('weight-cell').first()).toHaveText('Pick');
    await expect(view.getByTestId('set-guide')).not.toContainText('Last time');
    await expect(view.getByTestId('check-current')).toBeDisabled();
    expect(await dbAll(page, 'sets')).toEqual([]);
  });

  test('a 120 character exercise name wraps on the day list, the exercise view and the picker', async ({ page }) => {
    const long = 'Single Arm Half Kneeling Landmine Press With A Three Second Pause At The Bottom And A Slow Eccentric On Every Single Rep';
    expect(long.length).toBe(120);
    await page.goto('./');
    // Done once before (so it is in the picker's recent list), and in today's quick workout.
    await seedFinished(page, { [long]: [{ reps: 8, load: { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 } }] });
    const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
    const id = `edge-long-${Date.now()}`;
    await dbPut(page, { sessions: [{ id, gymId: gym.id, startedAt: Date.now() - 60_000, imported: false, exerciseIds: [long, 'barbell-back-squat'] }] });
    await page.goto(`./#/workout/${id}`);
    const row = page.getByTestId(`row-${long}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(long);
    await nothingWider(page.locator('body'));
    await noSideScroll(page);
    await row.tap();
    // Never seen before: the app asks once how it is loaded (the long name is the sheet's title too).
    const ask = page.getByRole('dialog', { name: 'How do you load this?' });
    await expect(ask).toBeVisible();
    await nothingWider(ask);
    await ask.getByRole('button', { name: /Machine|Stack/ }).first().tap();
    await expect(ask).toHaveCount(0);
    const view = page.getByTestId(`exercise-${long}`);
    const title = view.getByRole('heading', { level: 2, name: long });
    await expect(title).toBeVisible();
    expect(await fullyShown(title)).toBe(true);
    await nothingWider(page.locator('body'));
    await noSideScroll(page);
    // The picker lists it (recent) without overflowing.
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
    const sheet = page.getByRole('dialog', { name: 'Add exercise' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(long);
    await page.waitForTimeout(300);
    await nothingWider(sheet);
    await noSideScroll(page);
  });

  test('0 and 9999: Type it is exact or an honest Closest, and what is logged is what was shown', async ({ page }) => {
    await quick(page, 'back squat', 'Barbell Back Squat');
    const view = page.getByTestId('exercise-barbell-back-squat');
    await view.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Type it' }).tap();
    const typeIt = page.getByRole('dialog', { name: 'Type a weight' });
    for (const k of '9999') await typeIt.getByRole('button', { name: k, exact: true }).tap();
    const result = typeIt.getByTestId('solve-result');
    await expect(result).toHaveText(/^(Exact|Closest: \d[\d,.]*( or \d[\d,.]*)?)/);
    expect(await result.textContent()).not.toMatch(/NaN|Infinity|undefined/);
    let total: number;
    if ((await result.textContent())!.startsWith('Exact')) {
      total = 9999;
      await typeIt.getByRole('button', { name: 'Load it' }).tap();
    } else {
      await expect(typeIt.getByRole('button', { name: 'Pick one above' })).toBeDisabled();
      const choice = typeIt.getByRole('button', { name: /^Use / }).first();
      total = Number((await choice.getAttribute('aria-label'))!.replace(/[^\d.]/g, ''));
      await choice.tap();
    }
    await expect(typeIt).toHaveCount(0);
    await picker(page).getByRole('button', { name: 'Done' }).tap();
    await expect(view.getByTestId('weight-cell').first()).toHaveText(total.toLocaleString('en-US'));
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    expect((await sets(page))[0]!.load!.total).toBe(total);

    // 0 on a bar: never below the empty bar, said plainly.
    await view.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Type it' }).tap();
    await typeIt.getByRole('button', { name: '0', exact: true }).tap();
    // 0 is no weight at all on a bar: nothing to load, never a made up total.
    await expect(result).toHaveText(/^(Type the total|Closest: 45)/);
    await expect(typeIt.getByRole('button', { name: /^(Load it|Pick one above)$/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(typeIt).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(picker(page)).toHaveCount(0);

    // A bodyweight exercise logs reps only: no weight, never a made up number.
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: '+ Add exercise' }).first().tap();
    const sheet = page.getByRole('dialog', { name: 'Add exercise' });
    await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('crunch');
    await sheet.getByRole('button', { name: 'Crunch', exact: true }).tap();
    await sheet.getByRole('button', { name: 'Add 1', exact: true }).tap();
    const bw = page.getByTestId('exercise-crunch');
    await expect(bw.getByTestId('check-current')).toBeEnabled();
    await bw.getByTestId('check-current').tap();
    await expect(bw.getByTestId('set-row')).toHaveCount(1);
    const pushUp = (await sets(page)).at(-1)!;
    expect(pushUp.load).toMatchObject({ kind: 'bodyweight', total: 0 });
    expect(pushUp.reps).toBeGreaterThan(0);
  });

  test('a kg gym picks, shows and logs kg', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('radio', { name: 'kg' }).tap();
    await expect(page.getByRole('radio', { name: 'kg' })).toHaveAttribute('aria-checked', 'true');
    await quick(page, 'back squat', 'Barbell Back Squat');
    const view = page.getByTestId('exercise-barbell-back-squat');
    await view.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Add 20 kg plate to each side' }).tap();
    await expect(picker(page).getByTestId('plate-total')).toHaveText('60kg');
    await picker(page).getByRole('button', { name: 'Done' }).tap();
    await expect(view.getByTestId('check-current')).toHaveAccessibleName(/kg$/);
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    expect((await sets(page))[0]!.load).toMatchObject({ kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] });
  });

  test('offline: log, reload offline, log again; every set saved once', async ({ page, context }) => {
    await quick(page, 'back squat', 'Barbell Back Squat');
    const view = page.getByTestId('exercise-barbell-back-squat');
    await pick45(page, view);
    await context.setOffline(true);
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    await page.reload();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(2);
    expect((await sets(page)).map((s) => s.load!.total)).toEqual([135, 135]);
    await context.setOffline(false);
  });

  test('double taps on Start, Done, Finish and Back up never duplicate anything', async ({ page }) => {
    test.setTimeout(90_000);
    await usePlan(page);
    await seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });
    await page.reload();
    // Start: one workout.
    await doubleTap(page, page.getByRole('button', { name: 'Start', exact: true }));
    await expect(page).toHaveURL(/#\/workout\//);
    await page.waitForTimeout(400);
    expect((await dbAll<Session>(page, 'sessions')).filter((s) => s.endedAt === undefined)).toHaveLength(1);
    // Done in the weight sheet: one change, the sheet closes once (and nothing behind it is hit).
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await view.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
    await doubleTap(page, picker(page).getByRole('button', { name: 'Done' }));
    await expect(picker(page)).toHaveCount(0);
    await expect(view.getByTestId('weight-cell').first()).toHaveText('195');
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    // Finish: one finished workout with that one set.
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await doubleTap(page, page.getByRole('button', { name: 'Finish', exact: true }));
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    const finished = (await dbAll<Session>(page, 'sessions')).filter((s) => !s.id.startsWith('seed-'));
    expect(finished).toHaveLength(1);
    expect(finished[0]!.endedAt).toEqual(expect.any(Number));
    expect((await sets(page)).filter((s) => !s.id.startsWith('seed-'))).toHaveLength(1);
    await page.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    // Back up: one file.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
      Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    });
    await page.goto('./#/settings');
    await page.reload();
    const downloads: string[] = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    await doubleTap(page, page.getByTestId('backup'));
    await expect(page.getByText('Backup saved')).toBeVisible();
    await page.waitForTimeout(800);
    expect(downloads).toHaveLength(1);
  });

  test('double taps on Import and Replace never duplicate a workout', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('./#/settings');
    await expect(page.getByTestId('import-history')).toBeVisible();
    await page.getByTestId('import-file').setInputFiles(IMPORT_FIXTURE);
    await expect(page).toHaveURL(/#\/settings\/import$/);
    // The two questions of the synthetic file (tests/import.spec.ts).
    const confirm = page.getByTestId('import-confirm');
    await confirm.tap();
    await page.getByRole('dialog', { name: 'How do you load this?' }).getByRole('button', { name: /Dumbbells/ }).tap();
    await confirm.tap();
    const pick = page.getByRole('dialog', { name: 'Pick the exercise' });
    await pick.getByRole('searchbox', { name: 'Search exercises' }).fill('dumbbell bench');
    await pick.getByRole('button', { name: 'Dumbbell Bench Press', exact: true }).tap();
    await expect(confirm).toHaveText('Import 16 sets');
    await doubleTap(page, confirm);
    await expect(page).toHaveURL(/#\/settings$/);
    await page.waitForTimeout(500);
    expect(await dbAll(page, 'sets')).toHaveLength(16);
    const sessions = (await dbAll<Session>(page, 'sessions')).length;

    // Back up, then Replace everything with a fast double tap (its own second tap): one copy.
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true });
      Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    });
    await page.reload();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').tap()]);
    const file = readFileSync(await download.path(), 'utf8');
    await page.getByTestId('restore-file').setInputFiles({ name: 'anygym-backup.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    const replace = page.getByRole('button', { name: /^Replace/ });
    await expect(replace).toBeVisible();
    await doubleTap(page, replace, 120);
    await page.waitForTimeout(1200);
    expect(await dbAll(page, 'sets')).toHaveLength(16);
    expect(await dbAll(page, 'sessions')).toHaveLength(sessions);
  });

  test('a tap on the left edge strip over an icon reaches its button, never a crash (found by the monkey)', async ({ page }) => {
    // The edge swipe strip (left 20 px of a pushed screen) hands a plain tap to what is under it.
    // The monkey hit a point where that was an icon: an SVG element has no click(), so the tap
    // threw. Here a button with an icon is put under the strip of the exercise view and tapped.
    await usePlan(page);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.getByTestId('row-barbell-back-squat').tap();
    const strip = page.getByTestId('edge-swipe');
    await expect(strip).toBeAttached();
    await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to the list' }).tap({ trial: true }); // arrived, stable
    const box = (await strip.boundingBox())!;
    const y = Math.round(box.y + box.height / 2);
    await strip.evaluate((strip, y) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Icon probe');
      const top = y - strip.parentElement!.getBoundingClientRect().top - 20;
      b.style.cssText = `position:absolute;left:0;top:${top}px;width:40px;height:40px;z-index:1;padding:0;border:0;background:none`;
      b.innerHTML = '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" fill="red"/></svg>';
      b.addEventListener('click', () => ((window as unknown as { __probe: number }).__probe = ((window as unknown as { __probe?: number }).__probe ?? 0) + 1));
      strip.parentElement!.insertBefore(b, strip);
    }, y);
    // The strip is on top at that point, and under it lies the SVG.
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute('data-testid'), [10, y])).toBe('edge-swipe');
    // Under the strip at that point: the icon (an SVG element), not its button.
    expect(
      await strip.evaluate((el, [x, y]) => {
        el.style.pointerEvents = 'none';
        const under = document.elementFromPoint(x!, y!);
        el.style.pointerEvents = '';
        return under instanceof SVGElement;
      }, [10, y]),
    ).toBe(true);
    await page.touchscreen.tap(10, y);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __probe?: number }).__probe ?? 0)).toBe(1);
    await expect(page.getByTestId('exercise-barbell-back-squat')).toBeVisible();
  });

  test('20 fast pushes and pops: never a stuck screen', async ({ page }) => {
    // Each push or pop waits for the screen to take taps again (a view transition holds them for
    // about half a second on Chromium), so this is a long test on Android.
    test.setTimeout(120_000);
    await usePlan(page);
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page).toHaveURL(/#\/workout\/[\w-]+$/);
    const rows = page.locator('[data-testid^="row-"]');
    await expect(rows.first()).toBeVisible();
    for (let i = 0; i < 20; i++) {
      await rows.nth(i % 3).tap();
      await page.getByRole('button', { name: 'Back to the list' }).tap();
    }
    await expect(page.getByTestId('workout-title')).toBeVisible();
    // Still responsive: a push works and lands on its exercise.
    await rows.first().tap();
    await expect(page.locator('main[data-testid^="exercise-"]')).toBeVisible();
    // And the main tabs in quick succession.
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Main' });
    for (const name of ['History', 'Plans', 'Today', 'History', 'Run', 'Plans', 'Today', 'Plans', 'History', 'Today']) await nav.getByRole('link', { name }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await noSideScroll(page);
  });

  test('a Log set write held open while you leave and come back lands once; a second set logs exactly', async ({ page }) => {
    await addIdbSeams(page);
    await quick(page, 'back squat', 'Barbell Back Squat');
    const view = page.getByTestId('exercise-barbell-back-squat');
    await pick45(page, view);
    // Set 1 (135 × the prefilled reps): its write is held open (not committed).
    const reps1 = Number(await view.getByTestId('reps-cell').first().textContent());
    await holdNextSetWrite(page);
    await view.getByTestId('check-current').tap();
    await expect.poll(() => heldWrites(page)).toBe(1);
    // Still pending (a read of the sets store would wait for it): nothing shows as logged.
    await page.waitForTimeout(300);
    await expect(view.getByTestId('set-row')).toHaveCount(0);
    // Away and back while it is pending: the list, then the exercise again.
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(view).toBeVisible();
    await expect(view.getByTestId('set-row')).toHaveCount(0);
    expect(await heldWrites(page)).toBe(1);
    // Release: the set lands once, and the remounted view hears it.
    await releaseSetWrite(page);
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    // Set 2, distinct: 155 and one rep more.
    await view.getByTestId('weight-cell').first().tap();
    await picker(page).getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
    await picker(page).getByRole('button', { name: 'Done' }).tap();
    await expect(picker(page)).toHaveCount(0);
    await view.getByTestId('reps-cell').first().tap();
    await view.getByRole('button', { name: 'More reps' }).tap();
    await view.getByRole('button', { name: 'Done', exact: true }).tap();
    const reps2 = Number(await view.getByTestId('reps-cell').first().textContent());
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(2);
    await page.reload();
    await expect(view.getByTestId('set-row')).toHaveCount(2);
    const saved = await sets(page);
    expect(saved).toHaveLength(2);
    expect(new Set(saved.map((s) => s.id)).size).toBe(2);
    expect(saved.map((s) => [s.load!.total, s.load!.perSide, s.reps])).toEqual([
      [135, [45], reps1],
      [155, [45, 10], reps2],
    ]);
    expect(reps2).toBe(reps1 + 1);
  });
});
