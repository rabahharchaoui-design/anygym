import { expect, test } from './fixtures';
import { live, startRun } from './helpers/run';

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
});
