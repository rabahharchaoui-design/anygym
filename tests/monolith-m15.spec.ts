import { expect, test, type Locator, type Page } from './fixtures';
import { openRun } from './helpers/run';
import { stubTiles } from './helpers/tiles';
import { pastIntake } from './helpers/quick';
import { bar185, seedFinished, usePlan } from './workout-helpers';

// PLAN M15 (Monolith style sheet): the shared sheets, toggles, switch, toast, load error and empty
// state, each on a real screen. Rows split by hairlines; the pick is words with an ice line or a small
// square mark, never a filled block; actions are words over a line; nothing rounded over 4 px, no
// shadow, no blur. Every control stays a real control (role, aria state) with a 44 pt target, at the
// normal and the largest text size, with no sideways scroll.

test.beforeEach(() => {
  test.skip(test.info().project.use.browserName !== 'webkit', 'WebKit iPhones and the 320 floor');
});

const look = (el: Locator) =>
  el.evaluate((n) => {
    const s = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return { bg: s.backgroundColor, image: s.backgroundImage, radius: parseFloat(s.borderTopLeftRadius) || 0, shadow: s.boxShadow, blur: s.backdropFilter || 'none', top: parseFloat(s.borderTopWidth), bottom: parseFloat(s.borderBottomWidth), h: r.height, w: r.width, color: s.color, align: s.textAlign, weight: s.fontWeight, size: parseFloat(s.fontSize) };
  });
const clear = (bg: string) => bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const el = document.createElement('i');
    el.style.color = `var(${n})`;
    document.body.append(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, name);
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 0.5);

/** The phone's largest text size, as the 130% specs do it: every size and line height x1.3. */
async function largestText(page: Page) {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const s = getComputedStyle(el);
      const size = parseFloat(s.fontSize);
      const line = parseFloat(s.lineHeight);
      el.style.fontSize = `${size * 1.3}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.3}px`;
    }
  });
  await page.waitForTimeout(250);
}

async function targets(scope: Locator, selector: string) {
  for (const el of await scope.locator(selector).all()) {
    const box = (await el.boundingBox())!;
    expect(box.height, await el.innerText()).toBeGreaterThanOrEqual(44);
  }
}

for (const big of [false, true]) {
  test(`M15 run settings: switches and the segmented choice are words, the pick an ice line${big ? ' (largest text)' : ''} @matrix`, async ({ page, context }) => {
    await stubTiles(page);
    await openRun(page, context);
    await page.getByTestId('run-settings').tap();
    const sheet = page.getByRole('dialog', { name: 'Run settings' });
    await expect(sheet).toBeVisible();
    // openRun holds the clock: let the sheet's entrance settle so its content takes taps.
    await page.clock.runFor(1000);
    if (big) await largestText(page);
    // The sheet: solid, square, hairline top edge, no shadow or blur; its title heavy and left aligned.
    const frame = await look(sheet);
    expect(frame.radius).toBeLessThanOrEqual(4);
    expect(frame.shadow).toBe('none');
    expect(frame.blur).toBe('none');
    const title = await look(sheet.getByRole('heading', { level: 2 }));
    expect(title.align).toMatch(/left|start/);
    expect(Number(title.weight)).toBeGreaterThanOrEqual(800);
    // Switches: real switches with their state; the state a word, no track.
    const auto = sheet.getByRole('switch', { name: /Auto pause/ });
    await expect(auto).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByText('On', { exact: true }).first()).toBeVisible();
    const autoRow = sheet.locator('label').filter({ has: page.getByRole('switch', { name: /Auto pause/ }) });
    await autoRow.tap();
    await expect(auto).toHaveAttribute('aria-checked', 'false');
    await expect(autoRow.getByText('Off', { exact: true })).toBeVisible();
    await targets(sheet, 'label:has([role="switch"])');
    // Say each mile: a radiogroup of words; the pick white over a 3 px ice line, never a filled block.
    const group = sheet.getByTestId('voice-splits');
    await expect(group).toHaveAttribute('role', 'radiogroup');
    const picked = group.getByRole('radio', { checked: true });
    await expect(picked).toHaveCount(1);
    expect(clear((await look(picked)).bg)).toBe(true);
    expect(clear((await look(group)).bg)).toBe(true);
    const line = await look(group.locator('[data-pill]'));
    expect(line.h).toBeLessThanOrEqual(3);
    await targets(group, '[role="radio"]');
    await group.getByRole('radio', { name: 'Never' }).tap();
    await expect(group.getByRole('radio', { name: 'Never' })).toHaveAttribute('aria-checked', 'true');
    expect(await noSideScroll(page)).toBe(true);
  });
}

test('M15 gym sheet: rows split by hairlines, the active gym in ice blue words with a mark, no boxes @matrix', async ({ page }) => {
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: bar185 }] });
  await usePlan(page);
  await page.getByTestId('gym-pill').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Gyms' });
  await expect(sheet.getByTestId('gym-sheet')).toBeVisible();
  const rows = sheet.getByTestId('gym-sheet').locator('ul > li');
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  for (const li of await rows.all()) expect((await look(li)).bottom).toBe(1);
  const here = sheet.locator('button[aria-current="true"]');
  await expect(here).toHaveCount(1);
  const row = await look(here);
  expect(clear(row.bg)).toBe(true);
  expect(row.image).toBe('none');
  expect(row.radius).toBe(0);
  expect(row.h).toBeGreaterThanOrEqual(44);
  expect((await look(here.locator('span').filter({ hasText: /./ }).nth(1))).color).toBe(await token(page, '--accent'));
  await expect(here.getByLabel('Active')).toBeVisible();
  expect((await look(sheet.getByTestId('new-gym-row'))).h).toBeGreaterThanOrEqual(44);
  expect(await noSideScroll(page)).toBe(true);
});

test('M15 toast: a flat strip with a hairline, Undo as ice blue words, 48 pt @matrix', async ({ page }) => {
  await page.goto('./?dev#/dev/ui');
  await expect(page.getByRole('heading', { name: 'Components' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete a set' }).tap();
  const toast = page.getByRole('status').filter({ hasText: 'Set deleted' });
  await expect(toast).toBeVisible();
  await page.waitForTimeout(450);
  const strip = await look(toast);
  expect(strip.radius).toBe(0);
  expect(strip.top).toBe(1);
  expect(strip.shadow).toBe('none');
  expect(strip.blur).toBe('none');
  const undo = toast.getByRole('button', { name: 'Undo' });
  const u = await look(undo);
  expect(clear(u.bg)).toBe(true);
  expect(u.color).toBe(await token(page, '--accent'));
  expect(u.h).toBeGreaterThanOrEqual(44);
  await expect(undo.locator('svg')).toHaveCount(0);
  await undo.tap();
  await expect(toast).toHaveCount(0);
});

for (const big of [false, true]) {
  test(`M15 empty History and load error: giant words, one line, the action over the line${big ? ' (largest text)' : ''} @matrix`, async ({ page }) => {
    await pastIntake(page);
    await page.goto('./#/history');
    const empty = page.getByRole('heading', { level: 2, name: 'No workouts yet' });
    await expect(empty).toBeVisible();
    if (big) await largestText(page);
    expect((await look(empty)).size).toBeGreaterThanOrEqual(big ? 52 : 40);
    const section = page.locator('section').filter({ has: empty });
    const box = await look(section);
    expect(box.top).toBe(0);
    expect(box.radius).toBe(0);
    const go = section.getByRole('button', { name: 'Go to Today' });
    await expect(go).toHaveAttribute('data-variant', 'primary');
    expect((await look(go)).h).toBeGreaterThanOrEqual(44);
    expect(await noSideScroll(page)).toBe(true);

    // A failed read: said in one sentence on the page, Try again as words over the ice line.
    await page.addInitScript(() => ((window as unknown as { __anygymFailReads: boolean }).__anygymFailReads = true));
    await page.reload();
    const error = page.getByTestId('load-error');
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    if (big) await largestText(page);
    const e = await look(error);
    expect(clear(e.bg)).toBe(true);
    expect(e.radius).toBe(0);
    expect(e.top).toBe(1);
    const retry = error.getByRole('button', { name: 'Try again' });
    await expect(retry).toHaveAttribute('data-variant', 'primary');
    const r = await look(retry);
    expect(clear(r.bg)).toBe(true);
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(await noSideScroll(page)).toBe(true);
  });
}

test('M15 back button: a plain mark, no boxed square, 48 pt target @matrix', async ({ page }) => {
  await pastIntake(page);
  await page.goto('./#/settings/gyms');
  const back = page.getByRole('link', { name: /^Back/ }).first();
  await expect(back).toBeVisible();
  const face = await look(back.locator('span').first());
  expect(clear(face.bg)).toBe(true);
  expect(face.shadow).toBe('none');
  expect(face.blur).toBe('none');
  const hit = (await back.boundingBox())!;
  expect(hit.height).toBeGreaterThanOrEqual(44);
  expect(hit.width).toBeGreaterThanOrEqual(44);
});
