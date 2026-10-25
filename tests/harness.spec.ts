import { allowConsoleErrors, collectedErrors, expect, test } from './fixtures';
import { activeWorkoutProblems, controlProblems, type ActivePart } from './helpers/layout';
import { contrastReport } from './helpers/contrast';
import { monkey } from './helpers/monkey';

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

// PLAN 1.7i (9), (10), (11): the checkers themselves are proven to reject what they must.
test.describe('checkers reject what they must @matrix', () => {
  const PARTS: ActivePart[] = [
    ['title', '#harness h2'],
    ['current row', '#harness [data-state="current"]'],
    ['reps', '#harness [data-testid="reps-cell"]'],
    ['✓', '#harness [data-testid="check-current"]'],
  ];
  /** A fake active workout over the app: the row sits `rowTop` px down a 220 px tall table that scrolls. */
  const fakeWorkout = (rowTop: number) => `
    <div id="harness" style="position:fixed;inset:0;z-index:2147483647;background:#000;color:#fff;padding:80px 16px">
      <main data-testid="exercise-harness"><h2 style="margin:0 0 12px">Barbell back squat</h2>
        <div id="hscroll" style="height:220px;overflow:auto">
          <div style="height:${rowTop}px"></div>
          <div data-state="current" style="display:flex;gap:8px;height:56px">
            <button data-testid="reps-cell" style="width:56px;height:56px">10</button>
            <button data-testid="check-current" style="width:56px;height:56px">✓</button>
          </div>
          <div style="height:400px"></div>
        </div>
      </main>
    </div>`;

  test('active workout check: a ✓ below the fold is rejected, and the check never scrolls', async ({ page }) => {
    await page.goto('./');
    await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), fakeWorkout(20));
    expect(await activeWorkoutProblems(page, PARTS)).toEqual([]);
    await page.evaluate((html) => {
      document.getElementById('harness')!.remove();
      document.body.insertAdjacentHTML('beforeend', html);
    }, fakeWorkout(300));
    const problems = await activeWorkoutProblems(page, PARTS);
    expect(problems.some((p) => p.startsWith('✓') && /cut off|safe area/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith('current row'))).toBe(true);
    expect(await page.locator('#hscroll').evaluate((el) => el.scrollTop)).toBe(0);
    // Below the screen itself (not in a scroller): rejected too.
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('#harness [data-state="current"]')!;
      document.getElementById('harness')!.append(row);
      row.style.cssText = 'position:absolute;top:120vh;display:flex;gap:8px';
    });
    expect((await activeWorkoutProblems(page, PARTS)).some((p) => p.startsWith('✓') && /safe area/.test(p))).toBe(true);
  });

  test('control audit: an unnamed control and an undersized one fail; a named 48 px one passes', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() =>
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div id="ctl" style="position:fixed;top:120px;left:20px;z-index:2147483647;display:flex;gap:24px;background:#000">
           <button style="width:56px;height:56px"><svg width="20" height="20" aria-hidden="true"></svg></button>
           <button aria-label="Tiny" style="width:24px;height:24px;padding:0"></button>
           <button style="width:48px;height:48px;border-radius:50%">OK</button>
         </div>`,
      ),
    );
    const problems = await controlProblems(page, '#ctl');
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('has no accessible name');
    expect(problems[1]).toMatch(/"Tiny" 24×24.*smaller than 48 × 48/);
  });

  test('contrast check: a deliberately low contrast element fails, a clear one passes', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() =>
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div id="lowc" style="position:fixed;top:120px;left:10px;z-index:2147483647;background:#888888;padding:8px">
           <p style="color:#777777;font-size:16px;margin:0">Low contrast label</p>
           <p style="color:#000000;font-size:16px;margin:0">Clear label</p>
           <p style="color:rgba(255,255,255,0.2);font-size:16px;margin:0">Faded label</p>
         </div>`,
      ),
    );
    const r = await contrastReport(page, '#lowc');
    expect(r.checked).toBe(3);
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toContain('Low contrast label');
    expect(r.problems[1]).toContain('Faded label');
  });

  test('monkey: a transparent overlay that takes every tap fails at once, before any reload', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await page.evaluate(() =>
      setTimeout(() => {
        const o = document.createElement('div');
        o.id = 'harness-overlay';
        o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent';
        document.body.append(o);
      }, 1500),
    );
    const started = Date.now();
    await expect(monkey(page, { home: './', durationMs: 40_000, seed: 3 })).rejects.toThrow(/takes every tap/);
    expect(Date.now() - started).toBeLessThan(25_000);
    // Same document, overlay still there: nothing reloaded it away.
    await expect(page.locator('#harness-overlay')).toHaveCount(1);
  });
});
