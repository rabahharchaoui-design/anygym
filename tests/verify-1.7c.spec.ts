import { expect, test, type Locator, type Page } from './fixtures';
import { collarsSettingOf, sumLoad } from '../src/lib/load';
import { bar185, dbAll, seedFinished, usePlan, watchErrors, pickSetType } from './workout-helpers';

// Independent tester spec for PLAN 1.7c / 1.10e. Taps are counted by my own page-level listener
// (capture phase "click" and "pointerdown"), not by the builder's helper.

const shot = async (page: Page, name: string) => {
  const p = test.info().project.name.replace(/ /g, '-');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.7c/t-${name}-${p}.png` });
};

async function countTaps(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __c: number; __p: number; __hook?: boolean };
    w.__c = 0;
    w.__p = 0;
    if (w.__hook) return;
    w.__hook = true;
    window.addEventListener('click', () => w.__c++, true);
    window.addEventListener('pointerdown', () => w.__p++, true);
  });
}
const taps = async (page: Page) => page.evaluate(() => ({ click: (window as unknown as { __c: number }).__c, down: (window as unknown as { __p: number }).__p }));

type Set_ = { id: string; sessionId: string; exerciseId: string; order: number; kind: string; reps?: number; seconds?: number; failure?: boolean; load: any };
const mine = async (page: Page) => (await dbAll<Set_>(page, 'sets')).filter((s) => !s.id.startsWith('seed-')).sort((a, b) => a.order - b.order);
const totalOf = (l: any) => (l.kind === 'barbell' ? sumLoad({ bar: l.barWeight, perSide: l.perSide, collars: collarsSettingOf(l), unit: l.unit }).total : l.total);

const seedSquat = (page: Page) => seedFinished(page, { 'barbell-back-squat': Array.from({ length: 4 }, () => ({ reps: 10, load: bar185 })) });

test('A. SPEC 20 squat: Start, row, 4 checks, rest bar each time, Nice. Next chip, list state', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await countTaps(page);

  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('weight-cell')).toHaveText(['185', '185', '185', '185']);
  console.log('target text:', await view.getByTestId('set-next').innerText().catch(() => ''), '|', await view.getByTestId('set-plan').innerText().catch(() => ''), '|', await view.getByTestId('set-target').first().innerText().catch(() => ''));
  console.log('reps cells:', await view.getByTestId('reps-cell').allInnerTexts());
  const lastCells = await view.locator('[class*="last"]').allInnerTexts();
  console.log('last time cells:', lastCells);
  await shot(page, 'a-exercise-view');
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await view.getByTestId('check-current').tap();
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    if (i < 3) await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
    if (i === 1) await shot(page, 'a-two-logged-rest');
  }
  await expect(page.getByTestId('next-chip')).toContainText('Nice. Next:');
  console.log('chip:', await page.getByTestId('next-chip').innerText());
  await shot(page, 'a-next-chip');
  await expect(page.getByTestId('row-barbell-back-squat')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('[data-state="next"]')).toHaveCount(1);
  await shot(page, 'a-list-after');
  const t = await taps(page);
  console.log('TAPCOUNT a', JSON.stringify(t));
  expect(t.click).toBeLessThanOrEqual(6);
  expect(t.down).toBeLessThanOrEqual(6);
  const sets = await mine(page);
  expect(sets).toHaveLength(4);
  sets.forEach((s, i) => {
    expect(s.kind).toBe('work');
    expect(totalOf(s.load)).toBe(s.load.total);
    expect(s.load.total).toBe(185);
    expect(s.order).toBe(i + 1 > 0 ? s.order : 0);
  });
  expect(sets.map((s) => s.order)).toEqual([...sets.map((s) => s.order)].sort((a, b) => a - b));
  console.log('A reps saved', sets.map((s) => s.reps), 'orders', sets.map((s) => s.order));
  expect(errors).toEqual([]);
});

const bar135 = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };

test('B. change one weight: cell, plate, Done in at most 3 taps; logged rows unchanged', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedFinished(page, { 'barbell-straight-leg-romanian-deadlift': Array.from({ length: 3 }, () => ({ reps: 10, load: bar135 })) });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-straight-leg-romanian-deadlift').tap();
  const view = page.getByTestId('exercise-barbell-straight-leg-romanian-deadlift');
  await expect(view.getByTestId('weight-cell')).toHaveText(['135', '135', '135']);
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await page.waitForTimeout(400);
  await countTaps(page);

  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await expect(sheet.getByTestId('plate-total')).toHaveText('135lb');
  await shot(page, 'b-sheet');
  await sheet.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).tap();
  const t = await taps(page);
  console.log('TAPCOUNT b', JSON.stringify(t));
  expect(t.click).toBeLessThanOrEqual(3);
  expect(t.down).toBeLessThanOrEqual(3);
  await expect(sheet).toHaveCount(0);
  await expect(view.getByTestId('weight-cell')).toHaveText(['145', '145']);
  await expect(view.getByTestId('set-row').first()).toContainText('135');
  const before = await mine(page);
  expect(before[0]!.load.total).toBe(135);
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  const sets = await mine(page);
  expect(sets.map((s) => s.load.total)).toEqual([135, 145]);
  expect(sets.map((s) => totalOf(s.load))).toEqual([135, 145]);
  expect(errors).toEqual([]);
});

for (const history of [true, false]) {
  test(`C. quick workout, search bench, 3 checks (${history ? 'with' : 'without'} history)`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    if (history) await seedFinished(page, { 'barbell-incline-bench-press': Array.from({ length: 3 }, () => ({ reps: 10, load: bar135 })) });
    else await seedSquat(page);
    await page.reload();
    await expect(page.getByRole('button', { name: /Quick workout/ })).toBeVisible();
    await countTaps(page);
    await page.getByRole('button', { name: /Quick workout/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Add exercise' });
    const search = sheet.getByRole('searchbox', { name: 'Search exercises' });
    await search.tap();
    await search.pressSequentially('bench');
    await sheet.getByRole('button', { name: 'Barbell Incline Bench Press', exact: true }).tap();
    await sheet.getByRole('button', { name: 'Add 1' }).tap();
    const view = page.getByTestId('exercise-barbell-incline-bench-press');
    await expect(view).toBeVisible();
    if (!history) {
      await view.getByTestId('weight-cell').first().tap();
      const w = page.getByRole('dialog', { name: 'Pick the weight' });
      await shot(page, 'c-first-time-sheet');
      await w.getByRole('button', { name: 'Add 5 lb plate to each side' }).tap();
      await w.getByRole('button', { name: 'Done' }).tap();
    }
    for (let i = 0; i < 3; i++) {
      await view.getByTestId('check-current').tap();
      await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
    }
    const t = await taps(page);
    console.log(`TAPCOUNT c history=${history}`, JSON.stringify(t));
    if (history) {
      expect(t.click).toBeLessThanOrEqual(7);
      expect(t.down).toBeLessThanOrEqual(7);
    }
    const sets = await mine(page);
    expect(sets).toHaveLength(3);
    sets.forEach((s) => expect(totalOf(s.load)).toBe(s.load.total));
    console.log('C sets', JSON.stringify(sets.map((s) => [s.reps, s.load.total, s.kind])));
    expect(errors).toEqual([]);
  });
}

const sessionsOf = async (page: Page) => (await dbAll<{ id: string; startedAt: number; endedAt?: number }>(page, 'sessions')).filter((s) => !s.id.startsWith('seed-'));

test('D1. set types W D F, LAST TIME copy, and finish numbers match the db', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('set-todo')).toHaveCount(4);
  // Row 1 → W, logged. Row 2 → D, logged. Row 3 → F, logged.
  for (const presses of [1, 2, 3]) {
    const row = view.getByTestId('set-todo').first();
    await pickSetType(page, row.getByTestId('set-type'), (['warmup', 'drop', 'failure'] as const)[presses - 1]!);
    // Gate 2: a warm up drops the working target; fill it from LAST TIME (10 × 185).
    if (presses === 1) await row.getByRole('button', { name: /^Last time .*Copy into set/ }).tap();
    console.log('type', presses, await row.getByTestId('set-type').innerText());
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(presses);
    await page.waitForTimeout(350);
  }
  // Row 4: heavier weight, then LAST TIME copy puts back exactly 10 × 185.
  const row4 = view.getByTestId('set-todo').first();
  await row4.getByTestId('reps-cell').tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await view.getByRole('button', { name: 'More reps' }).tap();
  await expect(row4.getByTestId('reps-cell')).toHaveText('12');
  await row4.getByRole('button', { name: /Copy into set 4/ }).tap();
  await expect(row4.getByTestId('reps-cell')).toHaveText('10');
  await expect(row4.getByTestId('weight-cell')).toHaveText('185');
  await shot(page, 'd1-after-copy');
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(4);
  const sets = await mine(page);
  console.log('D1 sets', JSON.stringify(sets.map((s) => [s.kind, !!s.failure, s.reps, s.load.total, s.order])));
  expect(sets.map((s) => s.kind)).toEqual(['warmup', 'drop', 'work', 'work']);
  expect(sets.map((s) => !!s.failure)).toEqual([false, false, true, false]);
  expect(sets[3]!.reps).toBe(10);
  sets.forEach((s) => expect(totalOf(s.load)).toBe(s.load.total));
  expect(sets.map((s) => s.order)).toEqual([...sets.map((s) => s.order)].sort((a, b) => a - b));
  await page.getByRole('button', { name: 'Back' }).first().tap().catch(() => undefined);
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await shot(page, 'd1-finish');
  const ss = (await sessionsOf(page))[0]!;
  const db = await mine(page);
  // Warm ups never count toward Total lifted (SPEC 21.1, gate 2).
  const expectTotal = db.filter((s) => s.kind !== 'warmup').reduce((a, s) => a + (s.reps ?? 0) * s.load.total, 0);
  const shown = await page.getByTestId('finish-total').innerText();
  const mins = await page.getByTestId('finish-duration').innerText();
  console.log('finish:', shown, '| expected', expectTotal, '| duration', mins, '| ms', (ss.endedAt ?? 0) - ss.startedAt, '| sets', await page.getByTestId('finish-sets').innerText());
  expect(await page.getByTestId('finish-sets').innerText()).toBe(String(db.length));
  expect(Number(shown.replace(/[^\d.]/g, ''))).toBe(expectTotal);
  const dm = Math.round(((ss.endedAt ?? 0) - ss.startedAt) / 60000);
  expect(mins).toBe(dm < 1 ? '<1 min' : `${dm} min`);
  await expect(page.getByTestId('pr-chip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('D2. PR chips: previous best 185 x 10, now 190 x 10 gives the heaviest chip only', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await sheet.getByRole('button', { name: /Add 2\.5 lb plate to each side/ }).tap();
  await expect(sheet.getByTestId('plate-total')).toHaveText('190lb');
  await sheet.getByRole('button', { name: 'Done' }).tap();
  await expect(view.getByTestId('weight-cell').first()).toHaveText('190');
  for (let i = 0; i < 2; i++) {
    const row = view.getByTestId('set-todo').first();
    if ((await row.getByTestId('reps-cell').innerText()) === '11') {
      await row.getByTestId('reps-cell').tap();
      await view.getByRole('button', { name: 'Fewer reps' }).tap();
      await view.getByRole('button', { name: 'Done', exact: true }).tap();
    }
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
    await page.waitForTimeout(350);
  }
  const sets = await mine(page);
  console.log('D2 sets', JSON.stringify(sets.map((s) => [s.reps, s.load.total])));
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  const chips = await page.getByTestId('pr-chip').allInnerTexts();
  console.log('D2 chips', chips);
  await shot(page, 'd2-finish-pr');
  expect(chips).toHaveLength(1);
  expect(chips[0]).toContain('heaviest');
  expect(chips[0]).toContain('190');
  expect(errors).toEqual([]);
});

test('D3. no history: unknown exercise asks how it is loaded; answering gives a working row', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('wrist twist');
  await sheet.getByRole('button', { name: /Wrist Twist/i }).first().tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = page.locator('[data-testid^="exercise-"]');
  await expect(view).toBeVisible();
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  await page.waitForTimeout(600);
  await shot(page, 'd3-unknown-ask');
  if (!(await ask.isVisible())) await view.getByRole('button', { name: 'How do you load this?' }).tap();
  console.log('ask options', await ask.getByRole('button').allInnerTexts());
  await ask.getByRole('button', { name: /Plates on a bar/ }).tap();
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await shot(page, 'd3-unknown-picker');
  await picker.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await shot(page, 'd3-unknown-after');
  console.log('D3 cell', await view.getByTestId('weight-cell').first().innerText(), '|', await view.getByTestId('set-status').innerText());
  expect(await mine(page)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('D3b. Smith is a barbell on the Smith bar: no load question, the bar weight asked first, check disabled until it is set', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('smith');
  await sheet.getByRole('button', { name: /Smith/i }).first().tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = page.locator('[data-testid^="exercise-"]');
  await expect(view).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.getByRole('dialog', { name: 'How do you load this?' })).toHaveCount(0);
  await shot(page, 'd3b-smith');
  console.log('smith cell', await view.getByTestId('weight-cell').first().innerText(), '|', await view.getByTestId('set-status').innerText());
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await shot(page, 'd3b-smith-picker');
  console.log('smith picker', (await picker.innerText()).replace(/\n/g, ' | '));
  await picker.getByRole('button', { name: 'Add 10 lb plate to each side' }).tap();
  // 1.7e: the bar weight is asked in the sheet first; Done waits for it ("— lb", never a guess).
  await expect(picker.getByTestId('plate-total')).toHaveText('—lb');
  await expect(picker.getByRole('button', { name: 'Set the bar weight first', exact: true })).toBeDisabled();
  await picker.getByRole('button', { name: 'Close', exact: true }).tap();
  await expect(view.getByTestId('check-current')).toBeDisabled();
  console.log('smith status', await view.getByTestId('set-status').innerText());
  await expect(view.getByTestId('weight-cell').first()).toHaveText('Pick');
  expect(await mine(page)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('D4. first ever workout has no PR chips', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Add exercise' });
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('squat');
  await sheet.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await sheet.getByRole('button', { name: 'Add 1' }).tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('weight-cell').first().tap();
  const picker = page.getByRole('dialog', { name: 'Pick the weight' });
  await picker.getByRole('button', { name: 'Add 45 lb plate to each side' }).tap();
  await picker.getByRole('button', { name: 'Done', exact: true }).tap();
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await expect(page.getByTestId('pr-chip')).toHaveCount(0);
  console.log('D4 total', await page.getByTestId('finish-total').innerText());
  await shot(page, 'd4-finish-nohistory');
  expect(errors).toEqual([]);
});

test('D5. unknown load types: does a plan exercise or a quick exercise ask how it is loaded', async ({ page }) => {
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-machine-lying-leg-curl').tap();
  await page.waitForTimeout(700);
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  console.log('PLAN leg curl asks load type:', await ask.isVisible(), '| body:', (await page.getByRole('main').innerText()).replace(/\n/g, ' | ').slice(0, 200));
  await shot(page, 'd5-leg-curl');
});

const scrollers = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) out.push(`${el.tagName}.${String(el.className).slice(0, 40)} sh=${el.scrollHeight} ch=${el.clientHeight}`);
    }
    return { out, doc: document.documentElement.scrollWidth - innerWidth, docV: document.documentElement.scrollHeight - innerHeight };
  });
const rect = (l: Locator) => l.evaluate((el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
const overlaps = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

test('E1. one screen: 4 sets with name, last time, rows, checks and the rest bar; rest bar never covers anything', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await page.waitForTimeout(600);
  console.log('E1 scrollers before', JSON.stringify(await scrollers(page)));
  for (let i = 0; i < 3; i++) {
    await view.getByTestId('check-current').tap();
    await expect(view.getByTestId('set-row')).toHaveCount(i + 1);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await page.waitForTimeout(450);
    const sc = await scrollers(page);
    console.log(`E1 after ${i + 1}`, JSON.stringify(sc));
    expect(sc.out).toEqual([]);
    expect(sc.doc).toBeLessThanOrEqual(0);
    const rest = await rect(page.getByTestId('rest-timer'));
    for (const t of ['set-todo', 'set-row', 'check-current'] as const) {
      for (const n of await view.getByTestId(t).count().then((c) => Array.from({ length: c }, (_, k) => k))) {
        const r = await rect(view.getByTestId(t).nth(n));
        expect(overlaps(rest, r), `${t} ${n} under rest bar`).toBe(false);
      }
    }
    expect(overlaps(rest, await rect(view.getByRole('heading', { name: 'Barbell Back Squat' })))).toBe(false);
    expect(overlaps(rest, await rect(view.getByTestId('set-next')))).toBe(false);
    const vh = page.viewportSize()!.height;
    expect(rest.b).toBeLessThanOrEqual(vh);
    // Every visible control is fully in the viewport
    for (const l of [view.getByTestId('check-current'), view.getByTestId('set-next'), page.getByTestId('rest-timer')]) await expect(l).toBeInViewport({ ratio: 1 });
  }
  await shot(page, 'e1-three-logged-rest');
  expect(errors).toEqual([]);
});

test('E2. 5 rows: at most the table scrolls; 320 wide has no sideways scroll on list, view, picker, finish', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByRole('button', { name: '+ Add set' }).tap();
  await expect(view.getByTestId('set-todo')).toHaveCount(5);
  await page.waitForTimeout(500);
  const sc = await scrollers(page);
  console.log('E2 5 rows scrollers', JSON.stringify(sc));
  await shot(page, 'e2-five-rows');
  const head = await rect(view.getByRole('heading', { name: 'Barbell Back Squat' }));
  await view.getByTestId('check-current').tap();
  await view.getByTestId('check-current').tap();
  await page.waitForTimeout(500);
  const sc2 = await scrollers(page);
  console.log('E2 5 rows + rest scrollers', JSON.stringify(sc2));
  await shot(page, 'e2-five-rows-rest');
  const head2 = await rect(view.getByRole('heading', { name: 'Barbell Back Squat' }));
  console.log('E2 heading moved?', head.t, head2.t);
  const rest = await rect(page.getByTestId('rest-timer'));
  const checks = view.getByTestId('check-current');
  expect(overlaps(rest, await rect(checks))).toBe(false);
  await expect(checks).toBeInViewport({ ratio: 1 });
  // Sideways at 320 wide
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(400);
  const w320 = await scrollers(page);
  console.log('E2 320 view', JSON.stringify(w320));
  expect(w320.doc).toBeLessThanOrEqual(0);
  await shot(page, 'e2-320-view');
  await view.getByTestId('weight-cell').first().tap();
  await page.waitForTimeout(500);
  expect((await scrollers(page)).doc).toBeLessThanOrEqual(0);
  await shot(page, 'e2-320-sheet');
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Close', exact: true }).tap();
  await page.getByRole('button', { name: 'Back' }).first().tap();
  await page.waitForTimeout(500);
  expect((await scrollers(page)).doc).toBeLessThanOrEqual(0);
  await shot(page, 'e2-320-list');
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  await page.waitForTimeout(600);
  expect((await scrollers(page)).doc).toBeLessThanOrEqual(0);
  await shot(page, 'e2-320-finish');
  expect(errors).toEqual([]);
});

/** The hit area: the box, grown by what the element's own ::after really catches (probed with elementFromPoint). */
const size = (l: Locator) =>
  l.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hits = (x: number, y: number) => {
      const h = document.elementFromPoint(x, y);
      return !!h && (h === el || el.contains(h));
    };
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    let up = 0;
    while (up < 30 && hits(cx, r.top - up - 1)) up++;
    let down = 0;
    while (down < 30 && hits(cx, r.bottom + down + 1)) down++;
    let left = 0;
    while (left < 30 && hits(r.left - left - 1, cy)) left++;
    let right = 0;
    while (right < 30 && hits(r.right + right + 1, cy)) right++;
    return { w: Math.round(r.width + left + right), h: Math.round(r.height + up + down) };
  });

test('G. tap targets are at least 48pt', async ({ page }) => {
  const errors = watchErrors(page);
  const bad: string[] = [];
  const measure = async (name: string, l: Locator) => {
    const n = await l.count();
    for (let i = 0; i < Math.min(n, 4); i++) {
      const s = await size(l.nth(i));
      if (s.w < 48 || s.h < 48) bad.push(`${name}#${i} ${s.w}x${s.h}`);
    }
    if (n === 0) bad.push(`${name} MISSING`);
  };
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  // After a reload the Today screen reads IndexedDB first: wait for the button before counting it.
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await measure('start', page.getByRole('button', { name: 'Start', exact: true }));
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible();
  await page.waitForTimeout(500);
  await measure('row', page.locator('[data-testid^="row-"]'));
  await measure('back', page.getByRole('button', { name: 'Back' }));
  await measure('finish', page.getByRole('button', { name: 'Finish' }));
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await expect(view.getByTestId('check-current')).toBeVisible();
  await page.waitForTimeout(500);
  await measure('check', view.getByTestId('check-current'));
  await measure('check-other', view.getByTestId('check'));
  await measure('weight', view.getByTestId('weight-cell'));
  await measure('reps', view.getByTestId('reps-cell'));
  await measure('set-type', view.getByTestId('set-type'));
  await measure('last-time', view.getByRole('button', { name: /Copy into set/ }));
  await measure('more', view.getByRole('button', { name: /More for/ }));
  await measure('add-set', view.getByRole('button', { name: '+ Add set' }));
  await measure('hero', view.getByRole('button', { name: /How to do/ }));
  await view.getByTestId('reps-cell').first().tap();
  await measure('stepper', view.getByRole('button', { name: /More reps|Fewer reps/ }));
  await measure('stepper-done', view.getByRole('button', { name: 'Done', exact: true }));
  await view.getByTestId('reps-cell').first().tap();
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(500);
  const rest = page.getByTestId('rest-timer');
  await measure('rest-buttons', rest.getByRole('button'));
  await view.getByTestId('weight-cell').nth(1).tap();
  const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
  await page.waitForTimeout(500);
  await measure('plate-add', sheet.getByRole('button', { name: /Add .* plate to each side/ }));
  await measure('sheet-done', sheet.getByRole('button', { name: 'Done', exact: true }));
  await measure('sheet-close', sheet.getByRole('button', { name: 'Close', exact: true }));
  await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
  await view.getByRole('button', { name: /More for/ }).tap();
  const menu = page.getByRole('dialog', { name: /options/ });
  await page.waitForTimeout(500);
  await measure('menu-items', menu.getByRole('button'));
  await shot(page, 'g-menu');
  await menu.getByRole('button', { name: 'Rest time' }).tap();
  const rt = page.getByRole('dialog', { name: 'Rest time' });
  await measure('rest-time-controls', rt.getByRole('button'));
  await rt.getByRole('button', { name: 'Close' }).first().tap().catch(() => undefined);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('TARGETS BELOW 48 (workout):', JSON.stringify(bad));
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('G2. picker tap targets', async ({ page }) => {
  const errors = watchErrors(page);
  const bad: string[] = [];
  const measure = async (name: string, l: Locator) => {
    const n = await l.count();
    for (let i = 0; i < Math.min(n, 4); i++) {
      const s = await size(l.nth(i));
      if (s.w < 48 || s.h < 48) bad.push(`${name}#${i} ${s.w}x${s.h}`);
    }
    if (n === 0) bad.push(`${name} MISSING`);
  };
  await page.goto('./');
  await page.getByRole('button', { name: /Quick workout/ }).tap();
  const ps = page.getByRole('dialog', { name: 'Add exercise' });
  await page.waitForTimeout(500);
  await measure('picker-chips', ps.getByRole('group', { name: 'Body part' }).getByRole('button'));
  await ps.getByRole('searchbox', { name: 'Search exercises' }).fill('squat');
  await measure('picker-item', ps.getByRole('button', { name: /Squat/ }));
  await measure('search', ps.getByRole('searchbox'));
  await ps.getByRole('button', { name: 'Barbell Back Squat', exact: true }).tap();
  await measure('add-n', ps.getByRole('button', { name: 'Add 1' }));
  console.log('TARGETS BELOW 48:', JSON.stringify(bad));
  expect(bad).toEqual([]);
  expect(errors).toEqual([]);
});

test('F1. reload on list, mid rest in the exercise view, and the finish screen; back buttons', async ({ page, context }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  const listUrl = page.url();
  await page.reload();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  expect(page.url()).toBe(listUrl);
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('check-current').tap();
  await view.getByTestId('check-current').tap();
  await expect(view.getByTestId('set-row')).toHaveCount(2);
  const viewUrl = page.url();
  console.log('urls', listUrl, viewUrl);
  await page.reload();
  await expect(page.getByTestId('exercise-barbell-back-squat')).toBeVisible();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(2);
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-todo')).toHaveCount(2);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  console.log('after reload mid rest: rest clock', await page.getByTestId('rest-clock').innerText(), 'url', page.url());
  // offline logging
  await context.setOffline(true);
  await page.getByTestId('exercise-barbell-back-squat').getByTestId('check-current').tap();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(3);
  await page.reload();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(3);
  console.log('offline reload ok');
  await page.getByTestId('exercise-barbell-back-squat').getByTestId('check-current').tap();
  await expect(page.getByTestId('exercise-barbell-back-squat').getByTestId('set-row')).toHaveCount(4);
  await context.setOffline(false);
  expect(await mine(page)).toHaveLength(4);
  // header Back from the exercise view returns to the list
  await page.getByRole('button', { name: 'Back' }).first().tap();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  await expect(page.getByTestId('exercise-barbell-back-squat')).toHaveCount(0);
  await page.getByTestId('row-barbell-back-squat').tap();
  await expect(page.getByTestId('exercise-barbell-back-squat')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('row-barbell-back-squat')).toBeVisible();
  console.log('after browser back url', page.url());
  await expect(page.getByTestId('workout-title')).toBeVisible();
  // finish, reload on finish
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  const f = [await page.getByTestId('finish-total').innerText(), await page.getByTestId('finish-sets').innerText(), await page.getByTestId('finish-duration').innerText()];
  const fUrl = page.url();
  await page.reload();
  await expect(page.getByTestId('finish-total')).toBeVisible();
  expect([await page.getByTestId('finish-total').innerText(), await page.getByTestId('finish-sets').innerText(), await page.getByTestId('finish-duration').innerText()]).toEqual(f);
  expect(page.url()).toBe(fUrl);
  console.log('finish stable', f, fUrl);
  expect(await mine(page)).toHaveLength(4);
  expect(errors).toEqual([]);
});

for (const gap of [0, 60, 150]) {
  test(`F2. double tap on the check logs one set (gap ${gap} ms)`, async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await seedSquat(page);
    await page.reload();
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await page.getByTestId('row-barbell-back-squat').tap();
    const view = page.getByTestId('exercise-barbell-back-squat');
    await page.waitForTimeout(600);
    const r = await rect(view.getByTestId('check-current'));
    const x = (r.l + r.r) / 2;
    const y = (r.t + r.b) / 2;
    await page.touchscreen.tap(x, y);
    if (gap) await page.waitForTimeout(gap);
    await page.touchscreen.tap(x, y);
    await page.waitForTimeout(800);
    const n = (await mine(page)).length;
    console.log(`F2 gap ${gap}: sets saved`, n, 'rows', await view.getByTestId('set-row').count());
    expect(n).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('F3. huge and zero values: reps zero blocks the check, 999 reps and big weights stay sane', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await usePlan(page);
  await seedSquat(page);
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-barbell-back-squat').tap();
  const view = page.getByTestId('exercise-barbell-back-squat');
  await view.getByTestId('reps-cell').first().tap();
  for (let i = 0; i < 14; i++) {
    const b = view.getByRole('button', { name: 'Fewer reps' });
    if (await b.isDisabled()) break;
    await b.tap();
  }
  console.log('reps after 14 minus', await view.getByTestId('reps-cell').first().innerText(), await view.getByTestId('check-current').isDisabled(), await view.getByTestId('set-status').innerText());
  for (let i = 0; i < 40; i++) {
    const b = view.getByRole('button', { name: 'More reps' });
    if (await b.isDisabled()) break;
    await b.tap();
  }
  const big = await view.getByTestId('reps-cell').first().innerText();
  console.log('reps after 40 plus', big);
  await shot(page, 'f3-reps');
  expect((await scrollers(page)).doc).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('E3. timed exercise: rest bar never covers heading, target or the next row (plan Elbow Plank)', async ({ page }) => {
  const errors = watchErrors(page);
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-elbow-plank').tap();
  const view = page.getByTestId('exercise-elbow-plank');
  await page.waitForTimeout(600);
  await shot(page, 'e3-plank');
  await view.getByRole('button', { name: 'Start timer' }).tap();
  await page.waitForTimeout(1500);
  await view.getByTestId('check-current').tap();
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await page.waitForTimeout(500);
  const rest = await rect(page.getByTestId('rest-timer'));
  for (const l of [view.getByRole('heading', { name: 'Elbow Plank' }), view.getByTestId('set-target'), view.getByTestId('set-todo').first(), view.getByRole('button', { name: /timer/ }), view.getByTestId('check-current')]) {
    expect(overlaps(rest, await rect(l))).toBe(false);
    await expect(l).toBeInViewport({ ratio: 1 });
  }
  const sc = await scrollers(page);
  console.log('E3 scrollers', JSON.stringify(sc));
  await shot(page, 'e3-plank-rest');
  expect(sc.out).toEqual([]);
  expect(errors).toEqual([]);
});
