// PERFORMANCE BUDGETS (PLAN 3.6y). A phone that feels slow is a bug. Numbers are printed so the
// baseline can be read from a run; each is held to its budget.
//
//   cold start to a usable Today   < 2000 ms   (empty phone, no cache, navigation start to the
//                                               frame that shows Today's main button)
//   tab switch                     <  300 ms   (tap on a tab to the new screen painted)
//   set check tap                  <  100 ms   (tap on the check to the logged row painted)
//   finish screen                  <  500 ms   (tap on Finish to the summary painted)
//
// WebKit has no CPU throttle (no CDP), so the iPhone 15 project runs at full speed, the same
// technique tests/polish-2.2d.spec.ts uses. The budgets are enforced there. The Pixel 7 project
// (Chromium, only with PW_FULL_MATRIX=1) runs the same checks at 4x CPU slowdown and only prints
// its numbers: the 4x Chromium set check is about 300 ms today, a known gap, not a gate.
// Run: npm run test:perf.
import { expect, test } from '../fixtures';
import { bar185, checkCurrent, exerciseView, loggedRows, quickWith, seedFinished } from '../workout-helpers';
import { median, round, slowDown, tapToPaint } from '../helpers/perf';

test.describe.configure({ retries: 0, mode: 'serial' });
test.beforeEach(({}, info) => {
  test.skip(!['iPhone 15', 'Pixel 7'].includes(info.project.name), 'Budgets are held on iPhone 15 (full speed) and Pixel 7 (4x slowdown)');
});

const enforced = () => test.info().project.name === 'iPhone 15';
/** Holds a number to its budget on iPhone 15; elsewhere it is only printed. */
const within = (ms: number, budget: number) => {
  if (enforced()) expect(ms).toBeLessThan(budget);
};
const BUDGET = { coldStart: 2000, tabSwitch: 300, setCheck: 100, finish: 500 };
const say = (name: string, ms: number, budget: number, rate: number) =>
  console.log(`perf ${test.info().project.name} (cpu ${rate}x): ${name} ${round(ms)} ms (budget ${budget})`);

test('cold start to a usable Today stays under 2.0 s', async ({ page }) => {
  const rate = await slowDown(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __today: number };
    w.__today = 0;
    const seen = () => !!document.querySelector('[data-testid="build-card"], [data-testid="quick-card"], [data-testid="day-card-title"]');
    const loop = () => {
      if (seen()) requestAnimationFrame(() => requestAnimationFrame(() => (w.__today = performance.now())));
      else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.goto('./');
  await page.waitForFunction(() => (window as unknown as { __today: number }).__today > 0, null, { timeout: 15_000 });
  const ms = await page.evaluate(() => (window as unknown as { __today: number }).__today);
  say('cold start', ms, BUDGET.coldStart, rate);
  within(ms, BUDGET.coldStart);
});

test('a tab switch paints under 300 ms', async ({ page }) => {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await page.reload();
  await expect(page.getByTestId('build-card').or(page.getByTestId('quick-card'))).toBeVisible();
  await page.waitForTimeout(800); // lazy screens and fonts have settled
  const rate = await slowDown(page);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    samples.push(await tapToPaint(page, () => page.getByRole('link', { name: /History/ }).tap(), `return !!root.querySelector('[data-testid="history-row"]')`));
    // The way back keeps every sample a switch from a screen that is not History.
    await page.getByRole('link', { name: /Today/ }).first().tap();
    await expect(page.getByTestId('build-card').or(page.getByTestId('quick-card'))).toBeVisible();
    await page.waitForTimeout(400);
  }
  console.log(`perf ${test.info().project.name}: tab switch samples ${samples.map(round).join(', ')}`);
  say('tab switch (median)', median(samples), BUDGET.tabSwitch, rate);
  within(median(samples), BUDGET.tabSwitch);
  within(Math.max(...samples), BUDGET.tabSwitch * 1.5);
});

test('a set check shows under 100 ms and Finish shows its summary under 500 ms', async ({ page }) => {
  await page.goto('./');
  await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['incline bench', 'Barbell Incline Bench Press']]);
  const view = exerciseView(page, 'barbell-incline-bench-press');
  await expect(checkCurrent(view)).toBeEnabled();
  await page.waitForTimeout(800); // the muscles and tips mounted, the audio context warmed
  const rate = await slowDown(page);
  const samples: number[] = [];
  for (let n = 1; n <= 3; n++) {
    samples.push(
      await tapToPaint(page, () => checkCurrent(view).tap(), `return root.querySelectorAll('main [data-testid="set-row"]').length >= ${n} || !!root.querySelector('main [data-sending]')`),
    );
    await expect(loggedRows(view)).toHaveCount(n);
    await page.waitForTimeout(500);
  }
  console.log(`perf ${test.info().project.name}: set check samples ${samples.map(round).join(', ')}`);
  // Median of three taps, none of them allowed past 1.5x the budget.
  const steady = samples;
  say('set check (median)', median(steady), BUDGET.setCheck, rate);
  within(median(steady), BUDGET.setCheck);
  within(Math.max(...steady), BUDGET.setCheck * 1.5);

  await page.getByRole('button', { name: 'Back to the list' }).tap();
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeVisible();
  await page.waitForTimeout(500);
  const finish = await tapToPaint(page, () => page.getByRole('button', { name: 'Finish', exact: true }).tap(), `return !!root.querySelector('[data-testid="finish-sets"]')`);
  say('finish screen', finish, BUDGET.finish, rate);
  within(finish, BUDGET.finish);
});
