import { allowConsoleErrors, expect, test, type Page } from './fixtures';
import { pastIntake } from './helpers/quick';
import { firstFix, live, move, openRun } from './helpers/run';

// PLAN R1 (1): the Run tab, a run's detail and the records load through lazyScreen, so a file
// that cannot be fetched (first visit with no signal, a stale tab after an update) shows the load
// error with Try again in place of that screen; the tab bar and the other tabs keep working.
// The map's own file failing leaves the dark placeholder and "Map offline"; the run still starts.

test.use({ serviceWorkers: 'block', locale: 'en-GB' });

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones');
});

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const RUN_FILE = /\/assets\/RunScreen-[^/]+\.js$/;

test('R1 a Run file that cannot load shows the load error, the other tabs work, Try again brings it back', async ({ page, context }) => {
  allowConsoleErrors(/assets\/RunScreen-[^ ]+\.js/, /ScreenLoadError/);
  // Blocked before the app starts: the quiet preload of the Run file fails too.
  await page.route(RUN_FILE, (route) => route.abort('internetdisconnected'));
  await pastIntake(page);
  await nav(page).getByRole('link', { name: 'Run' }).tap();
  const error = page.getByTestId('load-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Could not open this screen');
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await expect(page.getByText('Something went wrong')).toHaveCount(0);
  // The rest of the app keeps working.
  await nav(page).getByTestId('tab-today').tap();
  await expect(page.getByTestId('gym-pill').first()).toBeVisible();
  await nav(page).getByTestId('tab-history').tap();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await nav(page).getByRole('link', { name: 'Run' }).tap();
  await expect(error).toBeVisible();
  // Signal back, nothing active: Try again loads the page afresh and the Run tab opens.
  await page.unroute(RUN_FILE);
  const reloaded = page.waitForEvent('load');
  await error.getByRole('button', { name: 'Try again' }).tap();
  await reloaded;
  await expect(page).toHaveURL(/#\/run$/);
  // WebKit keeps a module that failed for the life of the test page (as in PB1): the screen itself
  // is checked in a fresh page.
  const fresh = await context.newPage();
  await fresh.goto('./#/run');
  await expect(fresh.getByRole('heading', { level: 1, name: 'Run With Me' })).toBeVisible();
  await expect(fresh.getByTestId('load-error')).toHaveCount(0);
  await fresh.close();
});

test('R1 the run records and a run detail that cannot load show the load error, not the crash screen', async ({ page }) => {
  allowConsoleErrors(/assets\/Run(Records|Detail)-[^ ]+\.js/, /ScreenLoadError/);
  await page.route(/\/assets\/Run(Records|Detail)-[^/]+\.js$/, (route) => route.abort('internetdisconnected'));
  await pastIntake(page);
  await page.goto('./#/history/runs');
  await expect(page.getByTestId('load-error')).toBeVisible();
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await page.goto('./#/history/run/nope');
  await expect(page.getByTestId('load-error')).toBeVisible();
  await expect(page.getByTestId('app-error')).toHaveCount(0);
});

test('R1 the map file blocked: the dark placeholder says Map offline, and a run starts and counts', async ({ page, context }) => {
  allowConsoleErrors(/assets\/RunMapGl-[^ ]+\.js/);
  await page.route(/\/assets\/RunMapGl-[^/]+\.js$/, (route) => route.abort('internetdisconnected'));
  await openRun(page, context);
  await expect(page.getByTestId('run-map')).toBeVisible();
  await expect(page.getByTestId('map-offline')).toBeVisible();
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await page.getByTestId('run-start').tap();
  await expect(live(page)).toBeVisible({ timeout: 8000 });
  await firstFix(page, context);
  const r = { page, context, north: 0 };
  await move(r, 20); // 300 m in 100 s
  await expect(live(page)).toHaveAttribute('data-status', 'running');
  await expect.poll(async () => Number(await page.getByTestId('live-big').textContent())).toBeGreaterThan(0.2);
  await expect(page.getByTestId('app-error')).toHaveCount(0);
});

test('R1 a reload while a screen file is still on its way is not a load error (nothing logged)', async ({ page }) => {
  const YOU_FILE = /\/assets\/SettingsScreen-[^/]+\.js$/;
  // The You file takes a while; the page is reloaded before it arrives (the browser cancels it).
  await page.route(YOU_FILE, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue().catch(() => undefined);
  });
  await pastIntake(page);
  await nav(page).getByTestId('tab-you').tap();
  await expect(page.getByTestId('screen-wait')).toBeVisible();
  await page.reload();
  await page.unroute(YOU_FILE);
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
  // The fixture fails the test on any console error, the logged ScreenLoadError included.
});
