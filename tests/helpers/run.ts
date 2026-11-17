// PLAN 4.3: shared moves for specs that start a run (the live run screen, SPEC 12.2).
import { expect, type BrowserContext, type Locator, type Page } from '../fixtures';
import { simulateSafeAreas } from './layout';

/** The pocket mode explainer (shown once before the first run) counts as already seen. Call before goto. */
export async function pocketSeen(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('anygym.run.told.pocket', '1');
    } catch {
      // No storage yet on this document: the spec handles the sheet itself.
    }
  });
}

/** Presses a hold button for `ms` (a real press: pointer down, wait, pointer up). */
export async function holdFor(page: Page, button: Locator, ms: number) {
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Ends the live run with the one second hold and throws the (empty) run away: back on the start screen. */
export async function endAndDiscard(page: Page) {
  await holdFor(page, page.getByTestId('live-end'), 1250);
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await page.getByTestId('summary-discard').tap();
  await expect(page.getByTestId('run-summary')).toBeHidden();
  await expect(page.getByTestId('run-start')).toBeVisible();
}

// PLAN 4.3, shared with 4.4: a synthetic run. The phone's position is Playwright's, stepped along a
// straight route north from PARK; the clock is page.clock, moved by hand between positions.
export const PARK = { latitude: 40.7812, longitude: -73.9665 };
/** Meters per degree of latitude (the same earth radius as lib/gps). */
export const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
export const T0 = new Date('2026-06-01T08:00:00Z');
export const SPEED = 3;

export type Runner = { page: Page; context: BrowserContext; north: number };
export const live = (page: Page) => page.getByTestId('live-run');

/** Reports one position `north` meters up the route and waits until the run has taken it. */
export async function fix(r: Runner, accuracy = 5) {
  const before = await live(r.page).getAttribute('data-fix');
  await r.context.setGeolocation({ latitude: PARK.latitude + r.north / M_PER_DEG, longitude: PARK.longitude, accuracy });
  await expect.poll(() => live(r.page).getAttribute('data-fix'), { message: 'the position reached the run' }).not.toBe(before);
}
/** `steps` positions, `stepSec` apart on the clock, at 3 m/s (or standing with speed 0). */
export async function move(r: Runner, steps: number, stepSec = 5, speed = SPEED) {
  for (let i = 0; i < steps; i++) {
    await r.page.clock.runFor(stepSec * 1000);
    r.north += speed * stepSec;
    await fix(r);
  }
}
/** The clock moved the screen into pocket mode: one tap wakes it. */
export async function wake(page: Page) {
  if ((await live(page).getAttribute('data-dim')) === 'lit') return;
  await page.getByTestId('live-dim').tap({ force: true });
  await expect(live(page)).toHaveAttribute('data-dim', 'lit');
}

export async function openRun(page: Page, context: BrowserContext, opts: { pocket?: boolean; wake?: 'stub' | 'none' } = {}) {
  await simulateSafeAreas(page);
  if (!opts.pocket) await pocketSeen(page);
  await page.addInitScript((mode) => {
    const w = window as unknown as { __wakeAsks: number };
    w.__wakeAsks = 0;
    const lock = mode === 'none' ? undefined : { request: () => (w.__wakeAsks++, Promise.resolve({ released: false, release: () => Promise.resolve(), addEventListener: () => undefined })) };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: lock });
  }, opts.wake ?? 'stub');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...PARK, accuracy: 5 });
  await page.clock.install({ time: T0 });
  await page.goto('./#/run');
  await expect(page.getByRole('heading', { level: 1, name: 'Run With Me' })).toBeVisible();
}

/** The mocked phone reports only when its position is set: set it (again) so the new watch hears it. */
export async function firstFix(page: Page, context: BrowserContext) {
  await expect(async () => {
    await context.setGeolocation({ ...PARK, accuracy: 5 });
    await expect(live(page)).not.toHaveAttribute('data-fix', '', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}

export async function startRun(page: Page, context: BrowserContext, opts: Parameters<typeof openRun>[2] = {}): Promise<Runner> {
  await openRun(page, context, opts);
  await page.getByTestId('run-start').tap();
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  return { page, context, north: 0 };
}

