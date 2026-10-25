import { expect, test, type Locator, type Page } from './fixtures';
import { dbAll, dbPut, navIdle, seedFinished, usePlan, watchErrors, quickWith } from './workout-helpers';

// Round 2 independent recheck of PLAN 1.7c / 1.10e.
const shot = async (page: Page, name: string) => {
  const p = test.info().project.name.replace(/ /g, '-');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.7c/r2-${name}-${p}.png` });
};
const askDialog = (page: Page) => page.getByRole('dialog', { name: 'How do you load this?' });

/** Real hit area: box >= 48 and the element under 9 points of the box (corners, edge midpoints, centre) is the button itself. */
async function hit(l: Locator, label: string, bad: string[], round = false) {
  const n = await l.count();
  if (n === 0) return void bad.push(`${label} MISSING`);
  for (let i = 0; i < Math.min(n, 3); i++) {
    const r = await l.nth(i).evaluate((el, round) => {
      const b = el.getBoundingClientRect();
      const pts: Array<[number, number]> = [];
      for (const fx of [0.12, 0.5, 0.88]) for (const fy of [0.12, 0.5, 0.88]) if (!round || fx === 0.5 || fy === 0.5) pts.push([b.left + b.width * fx, b.top + b.height * fy]);
      const outside = pts.filter(([x, y]) => {
        const top = document.elementFromPoint(x, y);
        return !top || !(el === top || el.contains(top));
      }).length;
      return { w: b.width, h: b.height, outside };
    }, round);
    if (r.w < 48 || r.h < 48) bad.push(`${label}#${i} ${Math.round(r.w)}x${Math.round(r.h)}`);
    if (r.outside) bad.push(`${label}#${i} ${r.outside}/9 points hit something else`);
  }
}

test('H1. real hit areas', async ({ page }) => {
  const errors = watchErrors(page);
  const bad: string[] = [];
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] } }, { reps: 10, load: { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] } }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForTimeout(500);
  await navIdle(page);
  await hit(page.getByRole('button', { name: 'Finish' }), 'finish-list', bad);
  // The floating Start pill sits over the 3rd row on a 568 high screen (the list scrolls under it), so only rows 1 and 2 are probed.
  await hit(page.locator('[data-testid^="row-"]').first(), 'row', bad);
  await hit(page.locator('[data-testid^="row-"]').nth(1), 'row2', bad);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await page.waitForTimeout(600);
  await navIdle(page);
  await hit(view.getByRole('button', { name: /More for/ }), 'more', bad, true);
  await hit(view.getByRole('button', { name: '+ Add set' }), 'add-set', bad);
  await hit(page.getByRole('button', { name: 'Finish' }), 'finish', bad);
  await hit(view.getByTestId('check-current'), 'check', bad);
  await hit(view.getByTestId('weight-cell'), 'weight', bad);
  await hit(view.getByTestId('reps-cell'), 'reps', bad);
  await hit(view.getByTestId('set-type'), 'set-type', bad);
  await view.getByRole('button', { name: /More for/ }).tap();
  const menu = page.getByRole('dialog', { name: /options/ });
  await page.waitForTimeout(500);
  await hit(menu.getByRole('button').and(page.locator(':not([disabled])')), 'menu-items', bad);
  await shot(page, 'menu');
  console.log('H1 bad', JSON.stringify(bad));
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('H2. Day 1 Leg Press, Leg Curl, Leg Extension: no question; menu changes load type and it persists', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.waitForTimeout(500);
  console.log('DAY', await page.getByTestId('workout-title').innerText(), '|', await page.locator('[data-testid^="row-"]').evaluateAll((l) => l.map((e) => e.getAttribute('data-testid'))));
  const names: Array<[RegExp, string]> = [[/^Leg Press$|Leg Press/, 'leg-press'], [/Leg Curl/, 'curl'], [/Leg Extension/, 'ext']];
  for (const [re] of names) {
    const row = page.locator('[data-testid^="row-"]').filter({ hasText: re }).first();
    if ((await row.count()) === 0) { console.log('NO ROW', String(re)); continue; }
    await row.tap();
    await page.waitForTimeout(600);
    const asked = await askDialog(page).isVisible();
    const view = page.locator('[data-testid^="exercise-"]').first();
    console.log('ROW', String(re), 'asks:', asked, '| title', await view.getByRole('heading').first().innerText().catch(() => '?'), '| cell', await view.getByTestId('weight-cell').first().innerText().catch(() => '?'));
    expect(asked).toBe(false);
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.waitForTimeout(400);
  }
  // Leg Curl: change load type through the menu.
  await page.locator('[data-testid^="row-"]').filter({ hasText: /Leg Curl/ }).first().tap();
  await page.waitForTimeout(500);
  const view = page.locator('[data-testid^="exercise-"]').first();
  await view.getByRole('button', { name: /More for/ }).tap();
  const menu = page.getByRole('dialog', { name: /options/ });
  const loaded = menu.getByRole('button', { name: /Loaded with/ });
  console.log('LOADED', await loaded.innerText());
  await expect(loaded).toContainText(/Pin|stack|pin/i);
  await loaded.tap();
  const ask = askDialog(page);
  await expect(ask).toBeVisible();
  await shot(page, 'loaded-with-sheet');
  await ask.getByRole('button', { name: /Plates on a machine/ }).tap();
  await page.waitForTimeout(500);
  await view.getByRole('button', { name: /More for/ }).tap();
  const after = await page.getByRole('dialog', { name: /options/ }).getByRole('button', { name: /Loaded with/ }).innerText();
  console.log('AFTER', after);
  expect(after).toMatch(/machine/i);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForTimeout(800);
  console.log('URL after reload', page.url());
  if (!(await page.locator('[data-testid^="exercise-"]').count())) await page.locator('[data-testid^="row-"]').filter({ hasText: /Leg Curl/ }).first().tap();
  await page.waitForTimeout(500);
  await page.locator('[data-testid^="exercise-"]').first().getByRole('button', { name: /More for/ }).tap();
  const persisted = await page.getByRole('dialog', { name: /options/ }).getByRole('button', { name: /Loaded with/ }).innerText();
  console.log('PERSISTED', persisted);
  expect(persisted).toMatch(/machine/i);
  expect(errors).toEqual([]);
});

test('H3. screenshot: menu + sheet on a plain exercise', async ({ page }) => {
  await quickWith(page, [['leg press', 'Leg Press']]);
  const view = page.getByTestId('exercise-leg-press');
  await view.getByRole('button', { name: /More for/ }).tap();
  await shot(page, 'menu-leg-press');
  await page.getByRole('dialog', { name: /options/ }).getByRole('button', { name: /Loaded with/ }).tap();
  await shot(page, 'sheet-leg-press');
});

const lb = (total: number, per: number[]) => ({ kind: 'barbell', unit: 'lb', total, barWeight: 45, perSide: per });

test('S-a. LAST TIME shows warm up with W tag first', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, kind: 'warmup', load: lb(95, [25]) }, { reps: 10, load: lb(185, [45, 25]) }, { reps: 10, load: lb(185, [45, 25]) }, { reps: 10, load: lb(185, [45, 25]) }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await page.waitForTimeout(600);
  await navIdle(page);
  const lasts = await view.getByRole('button', { name: /Copy into set|no last time/ }).allInnerTexts();
  console.log('LAST cells', JSON.stringify(lasts), '| weights', await view.getByTestId('weight-cell').allInnerTexts(), '| types', await view.getByTestId('set-type').allInnerTexts());
  await shot(page, 'last-warmup');
  expect(lasts[0]).toMatch(/W/);
  expect(lasts[0]).toContain('95');
  expect(lasts[1]).toContain('185');
  expect(errors).toEqual([]);
});

test('S-b. no PR chip when a heavier lift exists in the other unit', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 5, load: { kind: 'barbell', unit: 'kg', total: 100, barWeight: 20, perSide: [25, 15] } }] });
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  console.log('unit label', (await picker.innerText()).replace(/\n/g, ' | ').slice(0, 160));
  // 45 + 2*32.5 lb is not available; use 45 + 2*(45+10+5+2.5=62.5)... keep it simple: 45 lb plate twice-ish
  await picker.getByRole('button', { name: 'Clear' }).tap();
  await picker.getByRole('button', { name: /Add 25 lb plate to each side/ }).tap();
  await picker.getByRole('button', { name: /Add 5 lb plate to each side/ }).tap();
  await picker.getByRole('button', { name: /Add 2.5 lb plate to each side/ }).tap();
  console.log('total', await picker.getByTestId('plate-total').innerText());
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  const chips = await page.getByTestId('pr-chip').allInnerTexts();
  console.log('S-b chips', chips, 'row', await dbAll(page, 'sets').then((l) => l.filter((s: any) => !String(s.id).startsWith('seed-')).map((s: any) => s.load)));
  await shot(page, 'pr-other-unit');
  expect(chips.filter((c) => /heaviest/i.test(c))).toEqual([]);
  expect(errors).toEqual([]);
});

test('S-d. Smith history stays separate from Olympic', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await seedFinished(page, { 'barbell-back-squat': [{ reps: 8, load: lb(135, [45]) }, { reps: 8, load: lb(135, [45]) }] }, 5);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  // The same exercise on the Smith bar, more recent.
  const start = Date.now() - 86_400_000;
  await dbPut(page, {
    sessions: [{ id: 'seed-smith', gymId: gym.id, startedAt: start, endedAt: start + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat'] }],
    sets: [0, 1].map((i) => ({ id: `seed-smith-${i}`, sessionId: 'seed-smith', exerciseId: 'barbell-back-squat', order: i, kind: 'work', uncertain: false, reps: 12, load: { kind: 'barbell', unit: 'lb', total: 95, barWeight: 15, perSide: [25, 15], barId: 'smith' } })),
  });
  console.log('sets stored', JSON.stringify((await dbAll<any>(page, 'sets')).map((s) => [s.id, s.load.barId, s.load.total])));
  await page.reload();
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('back squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await page.waitForTimeout(700);
  const lasts = await view.getByRole('button', { name: /Copy into set|no last time/ }).allInnerTexts();
  console.log('S-d last cells (default bar)', JSON.stringify(lasts), 'weights', await view.getByTestId('weight-cell').allInnerTexts());
  await shot(page, 'smith-vs-olympic');
  expect(lasts.join(' ')).toContain('135');
  expect(lasts.join(' ')).not.toContain('95');
  expect(errors).toEqual([]);
});

test('S-c. editing an older machine set after changing the starting resistance keeps its own total', async ({ page }) => {
  const errors = watchErrors(page);
  await quickWith(page, [['leg press', 'Leg Press']]);
  const view = page.locator('[data-testid^="exercise-"]').first();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await view.getByTestId('weight-cell').first().tap();
  await picker.getByRole('button', { name: 'Set starting weight' }).tap();
  await page.waitForTimeout(400);
  console.log('c start UI', (await page.getByRole('dialog').last().innerText()).replace(/\n/g, ' | '));
  console.log('c btns', JSON.stringify(await page.getByRole('dialog').last().getByRole('button').evaluateAll((l) => l.map((b) => b.getAttribute('aria-label') || b.textContent))));
  await page.getByRole('dialog').last().getByRole('button', { name: 'Plates only' }).tap();
  await page.waitForTimeout(300);
  await picker.getByRole('button', { name: /Add 45 lb plate to each side/ }).tap();
  console.log('c total1', await picker.getByTestId('plate-total').innerText());
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  // Set 2: start 50.
  await view.getByTestId('weight-cell').first().tap();
  console.log('c picker2', (await picker.innerText()).replace(/\n/g, ' | ').slice(0, 200));
  await picker.getByRole('button', { name: /Change/ }).first().tap();
  await page.waitForTimeout(300);
  for (const k of ['5', '0']) await page.getByRole('dialog').last().getByRole('button', { name: k, exact: true }).tap();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Save starting weight' }).tap();
  await page.waitForTimeout(300);
  console.log('c picker2b', (await picker.innerText()).replace(/\n/g, ' | ').slice(0, 200));
  if (!/45 \+ 45|2 × 45|140/.test(await picker.innerText())) await picker.getByRole('button', { name: /Add 45 lb plate to each side/ }).tap();
  console.log('c total2', await picker.getByTestId('plate-total').innerText());
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  const mineSets = async () => (await dbAll<any>(page, 'sets')).filter((s) => !String(s.id).startsWith('seed-')).sort((a, b) => a.order - b.order);
  console.log('c sets', JSON.stringify((await mineSets()).map((s) => [s.reps, s.load.total, s.load.barWeight, s.load.perSide])));
  await view.getByTestId('set-row').first().getByRole('button', { name: /Edit/ }).tap();
  const edit = page.getByRole('dialog', { name: 'Edit set' });
  await expect(edit).toBeVisible();
  console.log('c edit', (await edit.innerText()).replace(/\n/g, ' | ').slice(0, 250));
  await shot(page, 'c-edit');
  const totalText = await edit.getByTestId('plate-total').innerText().catch(() => '?');
  console.log('c edit total', totalText);
  await edit.getByRole('button', { name: 'Save' }).tap();
  await expect(edit).toHaveCount(0);
  const after = await mineSets();
  console.log('c after', JSON.stringify(after.map((s) => [s.reps, s.load.total, s.load.barWeight, s.load.perSide])));
  expect(after[0].load.total).toBe(90);
  expect(after[1].load.total).toBe(140);
  expect(errors).toEqual([]);
});
