import { expect, test, type Page } from './fixtures';
import { endAndDiscard, live, openRun } from './helpers/run';

// PLAN 4.4c (4): the countdown's ticks. iPhone plays a haptic tick only inside a tap (ui/haptics),
// so the tick of the first number must come from the tap that starts the countdown; the 2, 1, GO
// that follow fire on their own through the best effort buzz. A real iPhone is still needed to
// feel them; here the vibrate path stands in and each call says whether it ran inside a tap.

type Call = { pattern: unknown; inTap: boolean };

/** Records every vibrate call, and whether a click was being dispatched at that moment. */
async function recordTicks(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ticks: Call[]; __inTap: boolean };
    w.__ticks = [];
    w.__inTap = false;
    // Capture on window runs first, bubble on window runs last: the flag spans the whole dispatch.
    window.addEventListener('click', () => (w.__inTap = true), true);
    window.addEventListener('click', () => (w.__inTap = false));
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern: unknown) => (w.__ticks.push({ pattern, inTap: w.__inTap }), true) });
  });
}

const ticks = (page: Page) => page.evaluate(() => (window as unknown as { __ticks: Call[] }).__ticks.slice());
const clear = (page: Page) => page.evaluate(() => void ((window as unknown as { __ticks: Call[] }).__ticks.length = 0));

async function countdownTicks(page: Page, first: () => Promise<void>) {
  await clear(page);
  await first();
  await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', '3');
  // Let the first frame and its effects run before the first beat is due.
  await page.clock.runFor(200);
  const atThree = await ticks(page);
  for (const beat of ['2', '1', 'go']) {
    await page.clock.runFor(1000);
    await expect(page.getByTestId('run-countdown')).toHaveAttribute('data-beat', beat);
  }
  await page.clock.runFor(700);
  await expect(live(page)).toBeVisible();
  return { atThree, all: await ticks(page) };
}

test.describe('4.4c the countdown ticks', () => {
  test.skip(() => test.info().project.name !== 'iPhone 15', 'one phone is enough: the rule is about where the tick fires');

  test('the tick for 3 fires inside the Start tap; 2, 1 and GO tick on their own, once each', async ({ page, context }) => {
    await recordTicks(page);
    await openRun(page, context);
    const { atThree, all } = await countdownTicks(page, () => page.getByTestId('run-start').tap());
    expect(atThree, 'by 3: one tick, from the tap').toEqual([{ pattern: 8, inTap: true }]);
    expect(all).toHaveLength(4);
    expect(all.slice(1).every((c) => !c.inTap)).toBe(true);
    await page.clock.resume();
    await endAndDiscard(page);
  });

  test('first run: the tick for 3 fires inside the Got it tap of the pocket sheet', async ({ page, context }) => {
    await recordTicks(page);
    await openRun(page, context, { pocket: true });
    await page.getByTestId('run-start').tap();
    await expect(page.getByTestId('pocket-sheet')).toBeVisible();
    const { atThree, all } = await countdownTicks(page, () => page.getByTestId('pocket-go').tap());
    expect(atThree).toEqual([{ pattern: 8, inTap: true }]);
    expect(all).toHaveLength(4);
    await page.clock.resume();
    await endAndDiscard(page);
  });
});
