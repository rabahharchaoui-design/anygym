import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from './fixtures';
import { pastIntake } from './helpers/quick';

// PLAN PB1: the You tab and the screens only it opens are kept out of the first download. Their
// addresses still open them directly, browser back still works, every new file is in the service
// worker's precache, and a file that cannot be fetched shows the load error with Try again.

test.use({ serviceWorkers: 'block' });

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones');
});

const nav = (page: import('./fixtures').Page) => page.getByRole('navigation', { name: 'Main' });

test('PB1 deep links open the lazy You screens directly, and back still works', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/settings/gyms');
  await expect(page.getByRole('heading', { level: 1, name: 'Gyms' })).toBeVisible();
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await expect(nav(page).getByTestId('tab-you')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Gyms' })).toBeVisible();
});

test('PB1 a You file that cannot load shows the load error, and Try again opens it', async ({ page }) => {
  await pastIntake(page);
  let blocked = true;
  await page.route(/\/assets\/SettingsScreen-[^/]+\.js$/, (route) => (blocked ? route.abort('internetdisconnected') : route.continue()));
  await nav(page).getByTestId('tab-you').tap();
  const error = page.getByTestId('load-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Could not open this screen');
  // Never a blank screen or the app's crash screen: the tab bar stays, so the other tabs still work.
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await expect(nav(page)).toBeVisible();
  blocked = false;
  await error.getByRole('button', { name: 'Try again' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
});

test('PB1 every app file, the lazy screens included, is in the service worker precache', async () => {
  test.skip(test.info().project.name !== 'iPhone 15', 'one phone is enough: it reads the build');
  const dist = process.env.PW_DIST ?? 'dist';
  const sw = readFileSync(`${dist}/sw.js`, 'utf8');
  const js = readdirSync(`${dist}/assets`).filter((f) => f.endsWith('.js') && !f.startsWith('catalog-candidates-'));
  for (const name of ['SettingsScreen-', 'GymsScreen-', 'GymDetail-', 'GymEquipment-', 'ImportReview-', 'ReviewScreen-', 'CandidateReviewScreen-']) {
    expect(js.some((f) => f.startsWith(name)), name).toBe(true);
  }
  for (const f of js) expect(sw, f).toContain(`"assets/${f}"`);
});
