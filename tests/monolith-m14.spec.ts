import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { pastIntake } from './helpers/quick';

// PLAN M14 (SPEC 8, 19, 23.1, G's round 2 boards): five tabs in the boards' order, Today, Plan,
// Run, History, You; Settings is the You tab (board 13), reached in one tap from every tab, its
// old address still opens it, and every setting on it still works and is saved.

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones');
});

const TABS = [
  { id: 'today', word: 'Today', hash: '#/' },
  { id: 'plan', word: 'Plan', hash: '#/plans' },
  { id: 'run', word: 'Run', hash: '#/run' },
  { id: 'history', word: 'History', hash: '#/history' },
  { id: 'you', word: 'You', hash: '#/settings' },
] as const;

/** Every row of the You root, top to bottom (the status table of PLAN M14). */
const YOU_ROWS = [
  'settings-gyms',
  'settings-units',
  'switch:Colored plates',
  'settings-distance',
  'settings-measure',
  'switch:Voice coach',
  'switch:Auto level up',
  'redo-intake',
  'redo-schedule',
  'redo-focus',
  'switch:Haptics',
  'settings-body',
  'backup',
  'restore',
  'import-history',
  'switch:Send crash reports',
  'report-problem',
  'app-version',
  'about-voice',
];

const SHOTS = 'reports/monolith/m14';
const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  const phone = test.info().project.name.replace(/\s+/g, '-');
  await page.screenshot({ path: `${SHOTS}/${name}-${phone}.jpg`, type: 'jpeg', quality: 60 });
};

/** The phone's largest text size, as the 130% specs do it (tests/monolith-m1.spec.ts): every size x1.3. */
async function largestText(page: Page) {
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const sizes = els.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize), line: parseFloat(getComputedStyle(el).lineHeight) }));
    for (const { el, size, line } of sizes) {
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(150);
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('M14 five tabs in the boards order, each opens its screen, You is Settings', async ({ page }) => {
  await pastIntake(page);
  const links = nav(page).getByRole('link');
  await expect(links).toHaveCount(5);
  await expect(links).toHaveText(TABS.map((t) => t.word));
  for (const t of TABS) await expect(nav(page).getByTestId(`tab-${t.id}`)).toHaveText(t.word);
  // No gear on Today any more (SPEC 8): the only way in is the tab. The gym chip stays.
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByTestId('gym-pill').first()).toBeVisible();
  for (const t of [...TABS.slice(1), TABS[0]]) {
    await nav(page).getByTestId(`tab-${t.id}`).tap();
    await expect(page).toHaveURL(new RegExp(`${t.hash.replace('/', '\\/')}$`));
    await expect(nav(page).getByTestId(`tab-${t.id}`)).toHaveAttribute('aria-current', 'page');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
    if (t.id === 'plan') await expect(page.getByRole('heading', { level: 1, name: 'Plan', exact: true })).toBeVisible();
    if (t.id === 'history') await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
    if (t.id === 'run') await expect(page.getByTestId('run-start')).toBeVisible();
    if (t.id === 'you') await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
    if (t.id === 'today') await expect(page.getByTestId('gym-pill').first()).toBeVisible();
  }
});

test('M14 the old address opens You; Gyms goes back to it; browser back moves like the other tabs', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await expect(nav(page).getByTestId('tab-you')).toHaveAttribute('aria-current', 'page');
  // A tab root: no back button, the tab bar shows.
  await expect(page.getByRole('link', { name: /^Back/ })).toHaveCount(0);
  await expect(nav(page)).toBeVisible();
  await page.getByTestId('settings-gyms').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Gyms' })).toBeVisible();
  // Pushed: the tab bar hides, the back is plain words.
  await expect(page.locator('nav[aria-label="Main"]')).toHaveAttribute('data-hidden', 'true');
  const back = page.getByRole('link', { name: 'Back to Settings' });
  await expect(back).toContainText('Back');
  await back.tap();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  // Tab to History, then the browser's back: You again, as History → Plan would do.
  await nav(page).getByTestId('tab-history').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
});

test('M14 You shows every row, words for toggles, and the choices stay after a reload', async ({ page }) => {
  await pastIntake(page);
  await nav(page).getByTestId('tab-you').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  for (const row of YOU_ROWS) {
    const el = row.startsWith('switch:') ? page.getByRole('switch', { name: new RegExp(row.slice(7)) }) : page.getByTestId(row);
    await expect(el, row).toHaveCount(1);
  }
  // Board 13: the gym names as the Gyms row's value.
  await expect(page.getByTestId('settings-gyms-value')).not.toHaveText('');
  // Toggles are words: no track, no filled block; the picked unit is white over a line, not a pill.
  await expect(page.locator('[data-words] [data-pill]')).toHaveCount(0);
  const picked = page.getByTestId('settings-distance').locator('[aria-checked="true"]');
  const bg = await picked.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBe(true);
  // Every control at least 44 pt tall.
  for (const row of ['settings-units', 'settings-distance', 'settings-body']) {
    const box = (await page.getByTestId(row).getByRole('radio').first().boundingBox())!;
    expect(box.height, row).toBeGreaterThanOrEqual(44);
  }
  const haptics = page.getByRole('switch', { name: /Haptics/ });
  const hapticRow = (await page.locator('label', { has: haptics }).boundingBox())!;
  expect(hapticRow.height).toBeGreaterThanOrEqual(44);
  // Flip one toggle and one unit; both stay after a reload.
  const wasOn = await haptics.isChecked();
  await page.locator('label', { has: haptics }).tap();
  await expect(haptics).toBeChecked({ checked: !wasOn });
  await expect(page.locator('label', { has: haptics })).toContainText(wasOn ? 'Off' : 'On');
  const distance = page.getByTestId('settings-distance');
  const now = (await distance.locator('[aria-checked="true"]').textContent())!.trim();
  const other = now === 'km' ? 'mi' : 'km';
  await distance.getByRole('radio', { name: other, exact: true }).tap();
  await expect(distance.getByRole('radio', { name: other, exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Haptics/ })).toBeChecked({ checked: !wasOn });
  await expect(page.getByTestId('settings-distance').getByRole('radio', { name: other, exact: true })).toHaveAttribute('aria-checked', 'true');
  // The voice coach here is the Run tab's setting: off here, off in the run settings sheet.
  const voice = page.getByRole('switch', { name: /Voice coach/ });
  await expect(voice).toBeEnabled();
  const voiceOn = await voice.isChecked();
  await page.locator('label', { has: voice }).tap();
  await expect(voice).toBeChecked({ checked: !voiceOn });
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole('switch', { name: /Voice coach/ })).toBeChecked({ checked: !voiceOn });
});

test('M14 at 320 px wide and the largest text, all five words fit without clipping', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await pastIntake(page);
  await nav(page).getByTestId('tab-you').tap();
  await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
  await largestText(page);
  const fit = await nav(page).evaluate((bar) => {
    const tabs = Array.from(bar.querySelectorAll<HTMLElement>('a'));
    return tabs.map((a) => {
      const label = a.querySelector<HTMLElement>('span:last-child')!;
      const t = a.getBoundingClientRect();
      const l = label.getBoundingClientRect();
      return { word: label.textContent, size: parseFloat(getComputedStyle(label).fontSize), tabL: t.left, tabR: t.right, l: l.left, r: l.right, sw: label.scrollWidth, cw: label.clientWidth, h: t.height };
    });
  });
  expect(fit).toHaveLength(5);
  for (const [i, f] of fit.entries()) {
    expect(f.size, `${f.word} at the largest text`).toBeGreaterThanOrEqual(16.9 - 0.1);
    expect(f.sw, `${f.word} not clipped`).toBeLessThanOrEqual(f.cw + 0.5);
    expect(f.l, `${f.word} inside its tab`).toBeGreaterThanOrEqual(f.tabL - 0.5);
    expect(f.r, `${f.word} inside its tab`).toBeLessThanOrEqual(f.tabR + 0.5);
    expect(f.l).toBeGreaterThanOrEqual(0);
    expect(f.r).toBeLessThanOrEqual(320);
    expect(f.h).toBeGreaterThanOrEqual(44);
    if (i > 0) expect(f.l, `${f.word} clear of the word before`).toBeGreaterThan(fit[i - 1]!.r);
  }
  console.log(`M14FIT ${JSON.stringify(fit.map((f) => [f.word, Math.round(f.r - f.l), Math.round(f.tabR - f.tabL)]))}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('M14 screenshots of You, Gyms, a gym and the tab bar (iPhone 15, SE, 320 x 568)', async ({ page }) => {
  for (const size of [null, { width: 320, height: 568 }]) {
    if (size) await page.setViewportSize(size);
    const tag = size ? '320x568' : 'device';
    await pastIntake(page);
    await nav(page).getByTestId('tab-you').tap();
    await expect(page.getByRole('heading', { level: 1, name: 'You', exact: true })).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `you-${tag}`);
    await page.locator('[data-scroller]').first().evaluate((el) => el.scrollTo(0, el.scrollHeight / 2));
    await page.waitForTimeout(300);
    await shot(page, `you-middle-${tag}`);
    await page.locator('[data-scroller]').first().evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.waitForTimeout(300);
    await shot(page, `you-end-${tag}`);
    await page.locator('[data-scroller]').first().evaluate((el) => el.scrollTo(0, 0));
    await page.getByTestId('settings-gyms').tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Gyms' })).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `gyms-${tag}`);
    await page.getByTestId('gyms-list').getByRole('button').first().tap();
    await expect(page.getByTestId('edit-equipment')).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `gym-detail-${tag}`);
    await page.goto('./#/');
    await expect(page.getByTestId('gym-pill').first()).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `today-${tag}`);
  }
});
