import { allowConsoleErrors, collectedErrors, expect, test } from './fixtures';

// Proof that the automatic error trap in tests/fixtures.ts works (SPEC 13.3, codex bughunt 0800 #8).
// Each `test.fail()` test emits one kind of error on purpose and is EXPECTED to fail at the
// fixture's teardown: if the trap ever stops catching that kind, the test passes and the run
// reports it as an unexpected pass (red). The last tests prove the allowlist and the clean case.

// Waits until the trap saw the error, but never fails on its own: if the trap missed it, the test
// passes and `test.fail()` turns that into a red result. The only failure is the trap's teardown.
const caught = async (text = '') => {
  for (let i = 0; i < 40 && !collectedErrors().some((e) => e.includes(text)); i++) await new Promise((r) => setTimeout(r, 50));
};

test.describe('error trap @matrix', () => {
  test('a console.error in the page fails the test', async ({ page }) => {
    test.fail();
    await page.goto('./');
    await page.evaluate(() => console.error('harness: deliberate console error'));
    await caught();
  });

  test('an uncaught exception in the page fails the test', async ({ page }) => {
    test.fail();
    await page.goto('./');
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('harness: deliberate uncaught error');
      }, 0);
    });
    await caught();
  });

  test('an unhandled promise rejection fails the test', async ({ page }) => {
    test.fail();
    await page.goto('./');
    await page.evaluate(() => {
      void Promise.reject(new Error('harness: deliberate rejection'));
    });
    await caught('harness: deliberate rejection');
  });

  test('an error in a second page of the context fails the test', async ({ context, page }) => {
    test.fail();
    await page.goto('./');
    const other = await context.newPage();
    await other.goto('./');
    await other.evaluate(() => console.error('harness: error in another page'));
    await caught();
  });

  test('an error in a context the test makes itself (guardContext) fails the test', async ({ browser }) => {
    test.fail();
    const { guardContext } = await import('./fixtures');
    const ctx = await guardContext(await browser.newContext());
    const p = await ctx.newPage();
    await p.goto(test.info().project.use.baseURL!);
    await p.evaluate(() => void Promise.reject(new Error('harness: rejection in a new context')));
    await caught();
    await ctx.close();
  });

  test('a context the test makes without guarding it is trapped too', async ({ browser }) => {
    test.fail();
    const ctx = await browser.newContext(); // harness: unguarded on purpose, the fixture guards it
    const p = await ctx.newPage();
    await p.goto(test.info().project.use.baseURL!);
    await p.evaluate(() => console.error('harness: error in a plain new context'));
    await caught('plain new context');
    await ctx.close();
  });

  test('an online network failure of a local asset fails the test', async ({ page }) => {
    test.fail();
    await page.goto('./');
    // Not the guard and not offline: a local request that fails is an app problem.
    await page.route('**/harness-missing.png', (route) => route.abort('failed'));
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = './harness-missing.png';
      document.body.append(img);
    });
    await caught('Failed to load resource');
  });

  test('a request that fails while the test set the context offline is expected', async ({ page, context }) => {
    await page.goto('./');
    await context.setOffline(true);
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = `./harness-offline-${Date.now()}.png`;
      document.body.append(img);
    });
    await page.waitForTimeout(500);
    await context.setOffline(false);
    expect(collectedErrors()).toEqual([]);
  });

  test('an allowlisted error provoked on purpose passes', async ({ page }) => {
    allowConsoleErrors(/harness: provoked on purpose/);
    await page.goto('./');
    await page.evaluate(() => console.error('harness: provoked on purpose'));
    await page.waitForTimeout(100);
    expect(collectedErrors()).toEqual([]);
  });

  test('a clean page passes', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(collectedErrors()).toEqual([]);
  });
});
