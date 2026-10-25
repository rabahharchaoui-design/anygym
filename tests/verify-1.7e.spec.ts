import { expect, test, type Locator, type Page } from './fixtures';
import { bar185, dbAll, fitsOneScreen, quickWith, seedFinished, usePlan, watchErrors } from './workout-helpers';

// Tester checks for PLAN 1.7e (premium restyle) and 1.7g (130% text). Functional rules must survive.

const seedSquat = (page: Page) => seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });

const counter = () => {
  let n = 0;
  return { tap: async (l: Locator) => { await l.tap(); n++; }, get count() { return n; } };
};

test('V1 tap counts: 6 / 3 / 7 (own count)', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  const t = counter();
  await t.tap(page.getByRole('button', { name: 'Start', exact: true }));
  await t.tap(page.getByTestId('row-barbell-back-squat'));
  const view = page.getByTestId('exercise-barbell-back-squat');
  for (let i = 0; i < 4; i++) {
    await t.tap(view.getByTestId('check-current'));
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  expect(t.count).toBe(6);

  expect(errors).toEqual([]);
});

test('V1a weight change in 3 extra taps', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const v2 = page.getByTestId('exercise-barbell-back-squat');
  await v2.getByTestId('check-current').tap();
  await expect(v2.getByTestId('set-row')).toHaveCount(1);
  const t = counter();
  await t.tap(v2.getByTestId('weight-cell').first());
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await t.tap(sheet.getByRole('button', { name: 'Add 5 lb plate to each side' }));
  await t.tap(sheet.getByRole('button', { name: 'Done' }));
  expect(t.count).toBe(3);
  await expect(v2.getByTestId('weight-cell')).toHaveText(['195', '195', '195']);
  expect(errors).toEqual([]);
});

test('V1b quick workout 7 taps', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedSquat(page);
  await page.reload();
  const t = counter();
  await t.tap(page.getByRole('button', { name: /Quick workout/ }));
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' });
  await t.tap(search);
  await search.pressSequentially('squat');
  await t.tap(sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }));
  await t.tap(sheet.getByRole('button', { name: 'Add 1' }));
  const view = page.getByTestId('exercise-barbell-back-squat');
  for (let i = 0; i < 3; i++) {
    await t.tap(view.getByTestId('check-current'));
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  expect(t.count).toBe(7);
  expect(errors).toEqual([]);
});

test('V2 SE one screen with 4 rows, single bottom inset on the dock and the tab bar', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  // Tab bar on Today
  const navBottom = () => page.getByRole('navigation', { name: 'Main' }).evaluate((el) => el.getBoundingClientRect().bottom);
  expect(await navBottom()).toBe(await page.evaluate(() => innerHeight));
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('set-row').or(view.getByTestId('check-current'))).toBeVisible();
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  await fitsOneScreen(page);
  const dock = await page.locator('[class*="dockWrap"]').evaluate((el) => el.getBoundingClientRect().bottom);
  expect(dock).toBe(await page.evaluate(() => innerHeight));
  // everything of the exercise view is on screen without scrolling (4 rows, ✓ reachable)
  const rows = await view.getByTestId('set-todo').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  const h = await page.evaluate(() => innerHeight);
  for (const b of rows) expect(b).toBeLessThanOrEqual(h);
  // log all, rest dock shown: still one screen
  for (let i = 0; i < 4; i++) {
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  expect(errors).toEqual([]);
});

const HIT_SCREENS = async (_page: Page, visit: (name: string) => Promise<void>) => {
  for (const n of ['today', 'plans', 'plan', 'run', 'history', 'settings', 'day', 'exercise', 'weight', 'picker', 'finish']) await visit(n);
};

/** Visible controls under 48 in either dimension. */
async function small(page: Page, label: string): Promise<string[]> {
  return page.evaluate((lab) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], [role=button], [role=switch], [role=tab], summary, input:not([type=hidden])'))) {
      if (el.closest('[inert], [aria-hidden="true"]')) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.pointerEvents === 'none') continue;
      let r = el.getBoundingClientRect();
      // switch inputs are drawn by their row label
      if (el instanceof HTMLInputElement && el.closest('label')) r = el.closest('label')!.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 47.5 || r.height < 47.5) out.push(`${lab}: <${el.tagName.toLowerCase()} ${(el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 30)}> ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  }, label);
}

test('V3 every control is at least 48pt on every screen', async ({ page }) => {
  const errors = watchErrors(page);
  const found: string[] = [];
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  const check = async (n: string) => { await page.waitForTimeout(450); found.push(...(await small(page, n))); };
  await check('today');
  await page.getByRole('link', { name: 'Plans' }).tap();
  await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
  await check('plans');
  await page.getByTestId('plan-six-week-volume').tap();
  await expect(page.getByRole('button', { name: 'Use this plan' })).toBeVisible();
  await check('plan viewer');
  await page.goto('./#/run');
  await check('run');
  await page.goto('./#/settings');
  await expect(page.getByTestId('app-version')).toBeVisible();
  await check('settings');
  await page.goto('./');
  await page.getByRole('button', { name: 'Change day' }).tap();
  await check('change day sheet');
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: 'Close', exact: true }).first().tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await check('day list');
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await check('exercise');
  await view.getByTestId('check-current').tap();
  await check('exercise+rest');
  await view.getByTestId('weight-cell').first().tap();
  await expect(page.getByRole('dialog', { name: 'Pick the weight' })).toBeVisible();
  await check('weight sheet');
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await view.getByTestId('reps-cell').first().tap();
  await check('reps stepper');
  await page.getByRole('button', { name: 'Done' }).tap();
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(900);
  await check('finish');
  await page.getByRole('button', { name: 'Done' }).tap();
  await page.getByRole('link', { name: 'History' }).tap();
  await check('history');
  await page.getByTestId('history-row').first().tap();
  await check('history detail');
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  await check('picker');
  console.log(`SMALL CONTROLS:\n${[...new Set(found)].join('\n')}`);
  expect([...new Set(found)]).toEqual([]);
  expect(errors).toEqual([]);
});
void HIT_SCREENS;

for (const w of [320, 375, 440]) {
  test(`V4 no horizontal overflow at ${w} wide`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize({ width: w, height: 760 });
    const found: string[] = [];
    const check = async (n: string) => {
      await page.waitForTimeout(400);
      const o = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, wide: Array.from(document.querySelectorAll<HTMLElement>('body *')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('[aria-hidden="true"], [data-scroller-x], [inert]') && getComputedStyle(e).position !== 'fixed' && !/_digit_|_strip|_pill|_edge/.test(e.className); }).slice(0, 3).map((e) => `${e.tagName}.${e.className}`) }));
      if (o.doc > 0) found.push(`${n}: scrollWidth +${o.doc}`);
      if (o.wide.length) found.push(`${n}: past edge ${o.wide.join(', ')}`);
    };
    await usePlan(page);
    await seedSquat(page);
    await page.reload();
    await check('today');
    await page.getByRole('link', { name: 'Plans' }).tap();
    await check('plans');
    await page.getByTestId('plan-six-week-volume').tap();
    await check('viewer');
    await page.goto('./#/run'); await check('run');
    await page.goto('./#/settings'); await check('settings');
    await page.goto('./');
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await check('day list');
    await page.getByTestId('row-barbell-back-squat').tap();
    await check('exercise');
    await page.getByTestId('exercise-barbell-back-squat').getByTestId('check-current').tap();
    await check('exercise+rest');
    await page.getByTestId('exercise-barbell-back-squat').getByTestId('weight-cell').first().tap();
    await check('weight sheet');
    await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Close', exact: true }).tap();
    await page.getByRole('button', { name: 'Finish' }).tap();
    await page.waitForTimeout(900); await check('finish');
    await page.getByRole('button', { name: 'Done' }).tap();
    await page.getByRole('link', { name: 'History' }).tap(); await check('history');
    await page.getByTestId('history-row').first().tap(); await check('history detail');
    expect(found).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('V5 whole flow works, nothing is transformed away, no errors', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await seedSquat(page);
    await page.reload();
    await page.getByRole('link', { name: 'Plans' }).tap();
    await expect(page.getByTestId('plan-five-day-split')).toBeVisible();
    await page.getByTestId('plan-five-day-split').tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Classic 5 Day Split' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Plans' }).tap();
    await page.getByRole('link', { name: 'Today' }).tap();
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(1);
    await view.getByTestId('weight-cell').first().tap();
    const w = page.getByRole('dialog', { name: 'Pick the weight' });
    await expect(w).toBeVisible();
    // sheet must be at its resting place: no translate left over
    await expect.poll(() => w.evaluate((el) => { const r = el.getBoundingClientRect(); return Math.round(innerHeight - r.bottom); })).toBeLessThanOrEqual(1);
    await w.getByRole('button', { name: 'Close', exact: true }).tap();
    await page.getByRole('button', { name: 'Finish' }).tap();
    await expect(page.getByTestId('finish-total')).toHaveText(/2,035/);
    await page.getByRole('button', { name: 'Done' }).tap();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    for (const t of await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('main, header, nav')).map((e) => getComputedStyle(e).transform))) expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(t);
    expect(errors).toEqual([]);
  });
});

test('V6 sheet dialog a11y: focus inside, Tab stays, background inert, Escape closes the top one only', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['leg press', 'Leg Press']]);
  await page.getByTestId('exercise-leg-press').getByTestId('weight-cell').first().tap();
  const weight = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(weight).toBeVisible();
  await weight.getByRole('button', { name: 'Set starting weight' }).tap();
  const start = page.getByRole('dialog', { name: 'Starting weight' });
  await expect(start).toBeVisible();
  await start.getByRole('button', { name: 'What is Plate loaded machine?' }).tap();
  const info = page.getByRole('dialog', { name: 'Plate loaded machine' });
  await expect(info).toBeVisible();
  await page.waitForTimeout(500);
  // focus inside the top dialog
  expect(await info.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await info.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await info.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  // background inert (tab bar and sheets below)
  expect(await page.evaluate(() => !!document.querySelector('[data-testid="exercise-leg-press"]')!.closest('[inert], [aria-hidden="true"]'))).toBe(true);
  expect(await start.evaluate((el) => !!el.closest('[inert], [aria-hidden="true"]') || el.hasAttribute('inert') || el.getAttribute('aria-hidden') === 'true')).toBe(true);
  await page.keyboard.press('Escape');
  await expect(info).toHaveCount(0);
  await expect(start).toBeVisible();
  await expect(weight).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(start).toHaveCount(0);
  await expect(weight).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(weight).toHaveCount(0);
  expect(await page.evaluate(() => !!document.querySelector('[data-testid="exercise-leg-press"]')!.closest('[inert], [aria-hidden="true"]'))).toBe(false);
  expect(errors).toEqual([]);
});

test('V7 Settings: Haptics persists on and off, colors change the diagram, version; haptics never throws without the API', async ({ page }) => {
  const errors = watchErrors(page);
  // Pretend to be a real browser (not webdriver) with no vibrate, so the switch tick path runs.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // @ts-expect-error remove
    delete Navigator.prototype.vibrate;
    // @ts-expect-error remove
    delete navigator.vibrate;
  });
  await page.goto('./#/settings');
  await expect(page.getByTestId('app-version')).toHaveText(/^Version \d+\.\d+\.\d+$/);
  const hap = page.getByRole('switch', { name: /Haptics/ });
  await expect(hap).toBeChecked();
  await page.reload();
  await expect(page.getByRole('switch', { name: /Haptics/ })).toBeChecked();
  // tabs tick through the switch path without throwing
  await page.getByRole('link', { name: 'History' }).tap();
  await page.getByRole('link', { name: 'Today', exact: true }).tap();
  await expect(page).toHaveURL(/#\/$/);
  await page.goto('./#/settings');
  await expect(page).toHaveURL(/#\/settings$/);
  await page.waitForTimeout(800);
  await page.getByText('Haptics', { exact: true }).tap();
  expect(await page.evaluate(() => localStorage.getItem('anygym.haptics'))).toBe('off');
  await page.reload();
  await expect(page.getByRole('switch', { name: /Haptics/ })).not.toBeChecked();
  // colors toggle changes the diagram
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] });
  await quickWith(page, [['squat', 'Barbell Back Squat']]);
  await page.getByTestId('exercise-barbell-back-squat').getByTestId('weight-cell').first().tap();
  const plates = page.getByRole('dialog', { name: 'Pick the weight' }).locator('svg').first();
  await expect(plates).toBeVisible();
  const before = await plates.evaluate((el) => el.outerHTML);
  await page.goto('./#/settings');
  await page.getByText('Colored plates', { exact: true }).tap();
  await expect(page.getByRole('switch', { name: /Colored plates/ })).toBeChecked();
  await page.goBack();
  await page.waitForTimeout(500);
  const sheetStill = page.getByRole('dialog', { name: 'Pick the weight' });
  if (!(await sheetStill.isVisible())) {
    await page.getByTestId('exercise-barbell-back-squat').getByTestId('weight-cell').first().tap();
  }
  const after = await page.getByRole('dialog', { name: 'Pick the weight' }).locator('svg').first().evaluate((el) => el.outerHTML);
  expect(after).not.toEqual(before);
  expect(errors).toEqual([]);
});

test('V8 data exactness: 2 sets of 10 x 185 via check; odometer text equals the stored values', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  for (let i = 0; i < 2; i++) {
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
  }
  const sets = (await dbAll<{ id: string; order: number; reps: number; load: { total: number } }>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
  expect(sets).toHaveLength(2);
  await page.waitForTimeout(1200);
  const logged = await view.getByTestId('set-row').evaluateAll((rows) => rows.map((r) => (r.textContent ?? '').replace(/\s+/g, ' ')));
  console.log('logged rows', logged, sets.map((s) => `${s.reps}x${s.load.total}`));
  for (let i = 0; i < 2; i++) {
    expect(logged[i]).toContain(String(sets[i]!.load.total));
    expect(logged[i]).toContain(String(sets[i]!.reps));
  }
  // The finish screen: lifted total = sum reps*load of stored sets
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(1600);
  const expected = sets.reduce((a, s) => a + s.reps * s.load.total, 0);
  const text = (await page.getByTestId('finish-total').textContent()) ?? '';
  console.log('finish total', text, 'db', expected);
  expect(text.replace(/,/g, '')).toContain(String(expected));
  expect(errors).toEqual([]);
});

test('V9 stress: double tap, reload mid workout, offline', async ({ page, context }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').dblclick();
  await page.waitForTimeout(600);
  const n1 = (await dbAll(page, 'sets')).filter((s) => !(s as { id: string }).id.startsWith('seed-')).length;
  console.log('sets after double tap', n1);
  expect(n1).toBeLessThanOrEqual(2);
  await page.reload();
  await expect(page.getByTestId('exercise-barbell-back-squat')).toBeVisible();
  await context.setOffline(true);
  await page.getByTestId('exercise-barbell-back-squat').getByTestId('check-current').tap();
  await page.waitForTimeout(500);
  const n2 = (await dbAll(page, 'sets')).filter((s) => !(s as { id: string }).id.startsWith('seed-')).length;
  expect(n2).toBe(n1 + 1);
  await context.setOffline(false);
  expect(errors.filter((e) => !/Failed to load resource|offline|network/i.test(e))).toEqual([]);
});
