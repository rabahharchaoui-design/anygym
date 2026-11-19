import { allowConsoleErrors, expect, test } from './fixtures';
import { fix, live, startRun } from './helpers/run';
import { stubTiles } from './helpers/tiles';

// PLAN 4.4b: the Grok review fixes for the live run that show on screen.

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

test.describe('4.4b live run', () => {
  test('(2) a run toast wraps: its words are never cut @matrix', async ({ page, context }) => {
    await startRun(page, context, { wake: 'none' });
    await expect(live(page)).toHaveAttribute('data-wake', 'missing');
    const text = page.getByTestId('toast-text');
    await expect(text).toHaveText('This phone will not keep the screen on by itself. Set Auto-Lock to Never while you run.');
    const fits = await text.evaluate((el) => [...el.querySelectorAll('*'), el].every((n) => n.scrollWidth <= n.clientWidth + 1));
    expect(fits, 'no part of the toast is cut').toBe(true);
    const box = (await text.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });

  test('(15) one failed map tile does not say "Map offline" for the whole run: the chip goes when tiles load again @matrix', async ({ page, context }) => {
    allowConsoleErrors(/status of 500.*\.pbf/);
    const tiles = await stubTiles(page);
    const r = await startRun(page, context);
    tiles.failNext(1);
    await page.getByTestId('live-dot-1').tap();
    await expect(page.getByTestId('run-map')).toHaveAttribute('data-ready', 'true');
    // A tile failed (before 4.4b this said "Map offline" for the rest of the run).
    await expect(page.getByTestId('run-map-gl').last()).toHaveAttribute('data-map-error', /.+/);
    // Somewhere new (after a long wait, so it is no spike): the map follows and asks for new tiles.
    await page.clock.runFor(600_000);
    r.north += 3000;
    await fix(r);
    await page.clock.runFor(5000);
    r.north += 15;
    await fix(r);
    await expect(page.getByTestId('map-offline')).toHaveCount(0, { timeout: 10_000 });
  });
});

test('(8) VoiceOver reads the numbers on the stats page, not only the cycle hint @matrix', async ({ page, context }) => {
  await startRun(page, context);
  const cycle = page.getByTestId('live-cycle');
  await expect(cycle).toHaveAccessibleName(/kilometers/);
  await expect(cycle).toHaveAccessibleName(/moving time/);
  await expect(cycle).toHaveAccessibleDescription('Shows the next number big');
});

test('(MINOR) the page dots are 44 pt touch targets @matrix', async ({ page, context }) => {
  await startRun(page, context);
  for (const i of [0, 1]) {
    const box = (await page.getByTestId(`live-dot-${i}`).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
