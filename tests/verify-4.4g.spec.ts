// PLAN 4.4a (golden journey 2 left the workout on CI): "Back to the list" tapped just as the "Nice"
// chip's automatic return fired sent two steps back, past the workout list to Today. A tap, a double
// tap, or a tap the moment the list shows must always leave the workout on its list.
import { expect, test, type Page } from './fixtures';
import { bar185, checkCurrent, exerciseView, loggedRows, quickWith, seedFinished } from './workout-helpers';

const EX = 'barbell-incline-bench-press';

/** Every history step the page takes, for the failure message. */
async function recordNav(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __navLog: string[] };
    w.__navLog = [];
    const note = (kind: string, url: unknown) => w.__navLog.push(`${Math.round(performance.now())} ${kind} ${String(url ?? '')}`);
    const push = history.pushState.bind(history);
    history.pushState = (d, t, u) => (note('push', u), push(d, t, u));
    const go = history.go.bind(history);
    history.go = (n?: number) => (note(`go(${n})`, ''), go(n));
    const back = history.back.bind(history);
    history.back = () => (note('back()', ''), back());
    // Registered before the app's own listener: a hook here runs after the step back has landed
    // but before the app has drawn the screen it landed on (the moment a slow phone stretches).
    const hook = w as unknown as { __onPop?: () => void };
    addEventListener('popstate', () => {
      note('popstate', location.hash);
      const fn = hook.__onPop;
      hook.__onPop = undefined;
      fn?.();
    });
  });
}
/** How many steps back the page took. */
const stepsBack = async (page: Page) => (await navLog(page)).split('\n').filter((l) => / go\(-1\)| back\(\)/.test(l)).length;
const backButton = () => document.querySelector('[aria-label="Back to the list"]') as HTMLElement;
const navLog = (page: Page) => page.evaluate(() => (window as unknown as { __navLog: string[] }).__navLog.join('\n'));

/** A quick workout on its exercise view, with the given number of sets logged. */
async function onExercise(page: Page, sets: number) {
  await recordNav(page);
  await page.goto('./');
  await seedFinished(page, { [EX]: [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, EX);
  for (let n = 1; n <= sets; n++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(n);
  }
  return view;
}

/** Still in the workout, on its list, with the sets logged; never Today. */
async function onList(page: Page, sets: number) {
  await page.waitForTimeout(800);
  const log = await navLog(page);
  await expect(page, log).toHaveURL(/#\/workout\/[^/]+$/);
  await expect(page.getByRole('button', { name: 'Minimize workout' }), log).toBeVisible();
  await expect(page.getByTestId('live-stats')).toContainText(`${sets} sets`);
  await page.getByRole('button', { name: 'Finish', exact: true }).tap();
  await expect(page.getByTestId('finish-sets')).toHaveText(String(sets));
}

test.describe('4.4g Back to the list never leaves the workout', () => {
  test('Back to the list tapped as the "Nice" chip returns to the list on its own', async ({ page }) => {
    await page.clock.install();
    await onExercise(page, 3);
    // The last working set: the chip shows and, untouched, returns to the list after 2.5 s.
    await expect(page.getByTestId('next-chip')).toBeVisible();
    // The tap's step back lands, and the chip's moment runs out before the list is drawn (on the CI
    // runner: Back tapped at 17616 ms, about 2.5 s after the third set). The clock's in-page
    // controller (what page.clock.fastForward calls) runs the chip's timer at exactly that moment.
    await page.evaluate((src) => {
      const w = window as unknown as { __onPop?: () => void; __pwClock: { controller: { fastForward: (ms: number) => unknown } } };
      w.__onPop = () => void w.__pwClock.controller.fastForward(3000);
      new Function(`return (${src})`)()().click();
    }, backButton.toString());
    await onList(page, 3);
    expect(await stepsBack(page), await navLog(page)).toBe(1);
  });

  test('a second tap on Back to the list before the list is drawn takes one step back', async ({ page }) => {
    await onExercise(page, 2);
    await page.evaluate((src) => {
      const back = new Function(`return (${src})`)() as () => HTMLElement;
      (window as unknown as { __onPop?: () => void }).__onPop = () => back().click();
      back().click();
    }, backButton.toString());
    await onList(page, 2);
    expect(await stepsBack(page), await navLog(page)).toBe(1);
  });

  for (const gap of [60, 150, 250]) {
    test(`a double tap on Back to the list (${gap} ms apart) stays on the list`, async ({ page }) => {
      await onExercise(page, 2);
      const box = (await page.getByRole('button', { name: 'Back to the list' }).boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(gap);
      await page.touchscreen.tap(x, y);
      await onList(page, 2);
    });
  }

  test('a second tap at the same spot the moment the list shows stays on the list', async ({ page }) => {
    await onExercise(page, 2);
    const box = (await page.getByRole('button', { name: 'Back to the list' }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.touchscreen.tap(x, y);
    await expect(page.getByRole('button', { name: 'Minimize workout' })).toBeVisible({ timeout: 5000 });
    await page.touchscreen.tap(x, y);
    await onList(page, 2);
  });
});
