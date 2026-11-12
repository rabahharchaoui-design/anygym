import { expect, test, type Page } from './fixtures';
import { checkCurrent, dbAll, dbPut, exerciseView, loggedRows, quickWith, usePlan, watchErrors } from './workout-helpers';
import { pastIntake } from './helpers/quick';

// Tester checks for PLAN 3.5d (independent of tests/quick-3.5d.spec.ts).
const SHOT = 'reports/shots/3.5d-verify';
const DAY = 86_400_000;
const BAR185 = { kind: 'barbell', unit: 'lb', total: 185, barWeight: 45, perSide: [45, 25] };
const proj = () => test.info().project.name.replace(/ /g, '-');
async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/${name}-${proj()}.png` });
}

async function seedHistory(page: Page, experience: string | null) {
  await page.goto('./');
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const startedAt = Date.now() - 3 * DAY;
  await dbPut(page, {
    sessions: [{ id: 'seed-s1', gymId: gym.id, startedAt, endedAt: startedAt + 3_600_000, imported: false, exerciseIds: ['barbell-back-squat'] }],
    sets: [0, 1, 2].map((i) => ({ id: `seed-s1-${i}`, sessionId: 'seed-s1', exerciseId: 'barbell-back-squat', order: i, kind: 'work', reps: 10 - i, load: BAR185, uncertain: false })),
    profile: [{ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 1, ...(experience ? { intake: { experience } } : {}) }],
  });
}

for (const exp of ['1_2y', '3y']) {
  test(`check 2 and 3: last time by work set, finish counts work sets (${exp})`, async ({ page }) => {
    const errors = watchErrors(page);
    await seedHistory(page, exp);
    await quickWith(page, [['back squat', 'Barbell Back Squat']]);
    const view = exerciseView(page, 'barbell-back-squat');
    const todo = view.getByTestId('set-todo');
    await expect(todo.first().getByTestId('weight-cell')).toHaveText('45');
    const n = await todo.count();
    const lastOf = (i: number) => todo.nth(i).getByRole('button', { name: /last time/i }).innerText();
    const before = await Promise.all(Array.from({ length: n }, (_, i) => lastOf(i)));
    const warm = before.filter((x) => x === '–').length;
    expect(warm, `warm up rows ${before}`).toBeGreaterThan(0);
    expect(before.slice(warm)).toEqual(['185 × 10', '185 × 9', '185 × 8']);
    const t0 = Date.now();
    for (let i = 1; i <= warm; i++) {
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(i);
      // a warm up row: no rest timer
      await page.waitForTimeout(250);
      await expect(page.getByTestId('rest-timer')).toHaveCount(0);
    }
    for (let i = 0; i < 3; i++) {
      await expect(todo.nth(0).getByRole('button', { name: /last time/i })).toHaveText(['185 × 10', '185 × 9', '185 × 8'][i]!);
      await checkCurrent(view).tap();
      await expect(loggedRows(view)).toHaveCount(warm + i + 1);
    }
    // 3.5g: the finished warm ups fold into one row (still in the table, hidden): read every row's text.
    const logged = await Promise.all(Array.from({ length: warm + 3 }, (_, i) => loggedRows(view).nth(i).locator('button[aria-label$="Edit"] span').first().evaluate((el) => (el.textContent ?? '').trim())));
    expect(logged).toEqual([...Array(warm).fill('–'), '185 × 10', '185 × 9', '185 × 8']);
    await expect(page.getByTestId('rest-timer')).toBeVisible();
    await shot(page, `lasttime-${exp}`);
    // Finish: counts work sets only.
    await page.getByRole('button', { name: /Finish/ }).first().tap().catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, `finish-${exp}`);
    const body = await page.locator('body').innerText();
    // db: sets of this session by kind
    const sets = (await dbAll<{ sessionId: string; kind: string }>(page, 'sets')).filter((s) => s.sessionId !== 'seed-s1');
    console.log(`INFO ${exp} warm=${warm} dbsets=${sets.length} work=${sets.filter((s) => s.kind === 'work').length}\n${body.slice(0, 400).replace(/\n/g, ' | ')}`);
    void t0;
    expect(errors).toEqual([]);
  });
}

test('check 2: a lift without warm ups (new lifter) lines last time up by row', async ({ page }) => {
  await seedHistory(page, 'new');
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const todo = view.getByTestId('set-todo');
  await expect(todo.first().getByRole('button', { name: /last time/i })).toBeVisible();
  await expect(todo.first().getByTestId('weight-cell')).not.toHaveText('45');
  const n = await todo.count();
  const l = await Promise.all(Array.from({ length: n }, (_, i) => todo.nth(i).getByRole('button', { name: /last time/i }).innerText()));
  console.log('INFO new lifter last time', l);
  expect(l[0]).toBe('185 × 10');
  await checkCurrent(view).tap();
  await expect(loggedRows(view)).toHaveCount(1);
  await expect(todo.nth(0).getByRole('button', { name: /last time/i })).toHaveText('185 × 9');
  await shot(page, 'lasttime-new');
});

test('check 3: a plan day warm up exercise keeps its rest, a work set starts rest', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await usePlan(page);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await shot(page, 'plan-daylist');
  const warm = page.getByText('Warm up', { exact: true }).first();
  const hasWarm = (await warm.count()) > 0;
  console.log('INFO plan has warm up label', hasWarm);
  if (hasWarm) {
    const row = page.locator('li').filter({ has: page.locator('[data-testid^="row-"]') }).first();
    // open first row after the warm up label
    const rows = page.locator('[data-testid^="row-"]');
    await rows.first().tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    void row;
    const bodyTxt = await page.getByRole('main').innerText();
    console.log('INFO first exercise', bodyTxt.slice(0, 200).replace(/\n/g, ' | '));
    await page.getByTestId('check-current').tap();
    await page.waitForTimeout(400);
    console.log('INFO rest timer after first-row set count', await page.getByTestId('rest-timer').count());
    await shot(page, 'plan-first-set');
  }
  expect(errors).toEqual([]);
});

test('check 3: the plan warm up block (day 2) keeps its rest after a set', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await usePlan(page);
  const before = (await dbAll<{ nextDayIndex: number; doneDays: number[] }>(page, 'planState'))[0]!;
  await dbPut(page, { planState: [{ ...before, nextDayIndex: 1, doneDays: [0] }] });
  await page.reload();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await shot(page, 'plan-warm-daylist');
  const rows = page.locator('[data-testid^="row-"]');
  await rows.first().tap();
  await expect(page.getByTestId('check-current')).toBeVisible();
  console.log('INFO warm view', (await page.getByRole('main').innerText()).slice(0, 160).replace(/\n/g, ' | '));
  await page.getByTestId('check-current').tap();
  await page.waitForTimeout(500);
  const rest = await page.getByTestId('rest-timer').count();
  console.log('INFO plan warm block rest-timer count', rest);
  await shot(page, 'plan-warm-set');
  expect(errors).toEqual([]);
});

test('check 10: swapping Barbell Incline Bench Press offers a sure machine press first', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await pastIntake(page);
  await page.goto('./#/quick?min=45');
  await page.reload();
  await expect(page.locator('[data-concept="strength"]')).toBeVisible();
  await page.locator('[data-concept="strength"]').tap();
  const card = page.getByTestId('deck-card');
  let guard = 0;
  while ((await card.getAttribute('data-exercise')) !== 'barbell-incline-bench-press' && guard++ < 8) {
    await page.getByTestId('deck-keep').tap();
    await page.waitForTimeout(500);
  }
  expect(await card.getAttribute('data-exercise')).toBe('barbell-incline-bench-press');
  const seen: string[] = [];
  let ended = '';
  for (let i = 0; i < 6; i++) {
    const prev = await card.getAttribute('data-exercise');
    await page.getByTestId('deck-swap').tap();
    let moved = false;
    for (let k = 0; k < 30 && !moved; k++) {
      await page.waitForTimeout(100);
      if ((await card.getAttribute('data-exercise')) !== prev) moved = true;
      else if ((await page.getByTestId('swap-label').textContent()) === 'No other option here') break;
    }
    if (!moved) {
      ended = 'No other option here';
      break;
    }
    seen.push((await card.getAttribute('data-exercise'))!);
    await shot(page, `swap-${i}`);
    await page.waitForTimeout(2400);
  }
  console.log('INFO swap offered', seen.join(', '), '| ended:', ended);
  expect(seen.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

async function openQuick(page: Page, m: number) {
  await page.goto(`./#/quick?min=${m}`);
  await expect(page.locator('[data-concept]').first()).toBeVisible();
}

test('check 4 and 6: names, no note, meta line at 100% and 130%', async ({ page }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  for (const m of [15, 30, 45, 60]) {
    await openQuick(page, m);
    const txt = await page.getByRole('main').innerText();
    expect(txt, `quick ${m}`).not.toMatch(/superset|finisher/i);
    await expect(page.getByTestId('quick-fewer')).toHaveCount(0);
    const chips = await page.getByTestId('style-chip').allTextContents();
    console.log('INFO', m, 'chips', chips.join('|'), 'titles', (await page.getByTestId('concept-title').allTextContents()).join('|'), 'meta', (await page.getByTestId('concept-meta').allTextContents()).join(' // '));
  }
  // meta line at 100% and 130%
  await openQuick(page, 30);
  for (const pct of ['100%', '130%']) {
    await page.evaluate((p) => (document.documentElement.style.fontSize = p), pct);
    await page.waitForTimeout(300);
    const bad = await page.getByTestId('concept-meta').evaluateAll((els) =>
      els.flatMap((e) => {
        // every line must not start with a dot; "~T min" kept together
        const out: string[] = [];
        const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        const rects: { t: string; top: number }[] = [];
        let n: Node | null;
        while ((n = w.nextNode())) {
          const t = n.textContent ?? '';
          for (let i = 0; i < t.length; i++) {
            const r = document.createRange();
            r.setStart(n, i);
            r.setEnd(n, i + 1);
            const b = r.getClientRects()[0];
            if (b && t[i]!.trim()) rects.push({ t: t[i]!, top: Math.round(b.top) });
          }
        }
        const tops = [...new Set(rects.map((x) => x.top))];
        for (const top of tops) {
          const line = rects.filter((x) => x.top === top).map((x) => x.t).join('');
          if (line.startsWith('·')) out.push(`dot first: ${line}`);
        }
        const full = rects.map((x) => x.t).join('');
        // "~28 min" stays on one line; the dot before it may end the line above (a dot never starts one: checked above).
        const m = full.match(/~\d+min/);
        if (m) {
          const start = full.indexOf(m[0]);
          const ts = new Set(rects.slice(start, start + m[0].length).map((x) => x.top));
          if (ts.size > 1) out.push(`split: ${full}`);
        }
        return out;
      }),
    );
    expect(bad, pct).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, `meta-${pct}`);
  }
  expect(errors).toEqual([]);
});

test('check 5: More ideas tap, highlight, double tap, reduced motion', async ({ page }) => {
  const errors = watchErrors(page);
  await pastIntake(page);
  await openQuick(page, 30);
  const more = page.getByTestId('more-ideas');
  const chips0 = await more.locator('button[data-key]').count();
  const cards0 = await page.locator('[data-concept]').count();
  const keys0 = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
  const chip = more.locator('button[data-key]').first();
  const key = (await chip.getAttribute('data-key'))!;
  const label = await chip.innerText();
  await chip.scrollIntoViewIfNeeded();
  await chip.dblclick().catch(async () => {
    await chip.tap();
    await chip.tap({ timeout: 500 }).catch(() => {});
  });
  await page.waitForTimeout(400);
  const card = page.locator(`[data-concept][data-key="${key}"]`);
  await expect(card).toHaveCount(1);
  console.log('INFO more label', label.replace(/\n/g, ' '), '| title', await card.getByTestId('concept-title').innerText(), '| why', await card.getByTestId('concept-why').innerText());
  expect(await page.locator('[data-concept]').count()).toBe(cards0);
  const keys1 = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
  console.log('INFO keys', keys0.join(','), '->', keys1.join(','));
  expect(keys1.filter((k, i) => k !== keys0[i])).toEqual([key]);
  expect(await more.locator('button[data-key]').count(), 'one chip leaves (the replaced card may return as a chip)').toBeLessThanOrEqual(chips0);
  await expect(more.locator(`button[data-key="${key}"]`)).toHaveCount(0);
  const b = (await card.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  await shot(page, 'more-after');
  expect(errors).toEqual([]);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('check 5: reduced motion disables the highlight', async ({ page }) => {
    await pastIntake(page);
    await openQuick(page, 30);
    const chip = page.getByTestId('more-ideas').locator('button[data-key]').first();
    const key = (await chip.getAttribute('data-key'))!;
    await chip.tap();
    const card = page.locator(`[data-concept][data-key="${key}"]`);
    await page.waitForTimeout(250);
    const anim = await card.evaluate((e) => getComputedStyle(e).animationName);
    console.log('INFO reduced-motion animation-name on flashed card:', anim, 'data-flash', await card.getAttribute('data-flash'));
    expect(anim).not.toMatch(/cardGlow/);
  });
});

test('check 9: Next in the pair, bottom bar with the rest bar, never over a set row', async ({ page }) => {
  test.setTimeout(120_000);
  await pastIntake(page);
  await page.goto('./#/quick?min=30');
  const pump = page.locator('[data-concept="pump"]');
  await expect(pump).toBeVisible();
  const n = Number(((await pump.getByTestId('concept-meta').textContent()) ?? '').match(/^(\d+) exercises/)?.[1] ?? 0);
  await pump.tap();
  for (let k = 0; k < n; k++) await page.getByTestId('deck-keep').tap();
  await page.getByTestId('quick-start').tap();
  type S = { endedAt?: number; exerciseIds: string[] };
  await expect.poll(async () => (await dbAll<S>(page, 'sessions')).some((x) => x.endedAt === undefined)).toBe(true);
  await expect(page).toHaveURL(/#\/workout\//);
  const sess = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
  const start = Date.now() - 6 * DAY;
  const loadOf = (id: string) => (/^single-arm/.test(id) ? { kind: 'single', unit: 'lb', total: 30 } : /dumbbell|kettlebell/.test(id) ? { kind: 'dumbbell_each', unit: 'lb', total: 20 } : /^barbell|^hip-thrust|^deadlift|^overhead-press/.test(id) ? { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } : { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 });
  await dbPut(page, {
    sessions: [{ id: 'seed-loads', gymId, startedAt: start, endedAt: start + 3_000_000, imported: false, exerciseIds: sess.exerciseIds }],
    sets: sess.exerciseIds.map((id, i) => ({ id: `seed-loads-${i}`, sessionId: 'seed-loads', exerciseId: id, order: i, kind: 'work', uncertain: false, reps: 10, load: loadOf(id) })),
  });
  await page.reload();
  await expect(checkCurrent(page)).toBeVisible();
  await checkCurrent(page).tap();
  const next = page.getByTestId('group-next');
  await expect(next).toBeVisible();
  await page.waitForTimeout(600);
  const nb = (await next.boundingBox())!;
  const vh = page.viewportSize()!.height;
  const check = (await page.getByTestId('check-current').count()) ? await page.getByTestId('check-current').boundingBox({ timeout: 1000 }) : null;
  const rows = await page.getByTestId('set-todo').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  const rest = page.getByTestId('rest-timer');
  const rb = (await rest.count()) ? await rest.boundingBox({ timeout: 1000 }) : null;
  console.log('INFO next box', JSON.stringify(nb), 'vh', vh, 'rest', JSON.stringify(rb), 'lastRowBottom', Math.max(0, ...rows), 'check', JSON.stringify(check));
  expect(nb.height).toBeGreaterThanOrEqual(48);
  if (rb) expect(nb.y + nb.height).toBeLessThanOrEqual(rb.y + 1);
  const view = page.getByRole('main');
  // The button never covers a set row: look at all row boxes against it.
  const overlap = await page.locator('[data-testid="set-todo"], [data-testid="set-row"]').evaluateAll((els, n) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > n.y && r.top < n.y + n.height && r.height > 0; }).length, nb);
  console.log('INFO rows under the button (before scroll)', overlap);
  await shot(page, 'pair-next');
  void view;
});


// ---- Recheck round 2 ----
test('r2 check 3: 3 warm ups + 3 work sets count 3 on the header, finish tiles, toast, history list and detail, Today in progress', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await seedHistory(page, '3y');
  await quickWith(page, [['back squat', 'Barbell Back Squat']]);
  const view = exerciseView(page, 'barbell-back-squat');
  const todo = view.getByTestId('set-todo');
  await expect(todo.first()).toBeVisible();
  const n = await todo.count();
  const lasts = await Promise.all(Array.from({ length: n }, (_, i) => todo.nth(i).getByRole('button', { name: /last time/i }).innerText()));
  const warm = lasts.filter((x) => x === '–').length;
  for (let i = 1; i <= warm + 3; i++) {
    await checkCurrent(view).tap();
    await expect(loggedRows(view)).toHaveCount(i);
    await page.waitForTimeout(150);
  }
  const hdr = await page.getByRole('main').innerText();
  console.log('INFO warm rows', warm, 'header text', hdr.slice(0, 300).replace(/\n/g, ' | '));
  // live header: leave the exercise view to the workout list
  await page.goBack();
  await page.waitForTimeout(600);
  const list = await page.getByRole('main').innerText();
  const live = list.match(/(\d+) sets?/g);
  console.log('INFO live header counts', JSON.stringify(live));
  await shot(page, 'r2-live-header');
  // Today in progress
  await page.goto('./');
  await page.waitForTimeout(800);
  const today = await page.locator('body').innerText();
  console.log('INFO today', JSON.stringify(today.match(/[^\n]*\b\d+ sets?\b[^\n]*/g)));
  await shot(page, 'r2-today-progress');
  await page.getByRole('button', { name: /Resume|Continue/i }).first().tap().catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Finish/ }).first().tap();
  await page.waitForTimeout(900);
  await shot(page, 'r2-finish');
  const tile = await page.getByTestId('finish-sets').innerText();
  const finishText = await page.locator('body').innerText();
  console.log('INFO finish tile', JSON.stringify(tile), '| saved line', JSON.stringify(finishText.match(/Workout saved[^\n]*/)?.[0]));
  expect(tile).toMatch(/3/);
  expect(tile).not.toMatch(/6/);
  const done = page.getByRole('button', { name: /^Done|Save|Close/i }).first();
  await done.tap().catch(() => {});
  await page.waitForTimeout(900);
  const toast = await page.locator('body').innerText();
  console.log('INFO toast', JSON.stringify(toast.match(/Workout saved[^\n]*/)?.[0]));
  expect(toast).not.toMatch(/saved · 6 sets/);
  await shot(page, 'r2-toast');
  // history list + detail
  await page.goto('./#/history');
  await page.waitForTimeout(800);
  const hist = await page.getByRole('main').innerText();
  console.log('INFO history list', JSON.stringify(hist.match(/[^\n]*\b\d+ sets?\b[^\n]*/g)));
  await shot(page, 'r2-history-list');
  expect(errors).toEqual([]);
});

test('r2 check 3b: drop and failure sets count, warm ups do not (seeded finished sessions)', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  const L = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
  await expect.poll(async () => (await dbAll(page, 'gyms')).length).toBeGreaterThan(0);
  const gym = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!;
  const mk = (id: string, daysAgo: number, kinds: string[]) => {
    const start = Date.now() - daysAgo * DAY;
    return {
      s: { id, gymId: gym.id, startedAt: start, endedAt: start + 3_000_000, imported: false, exerciseIds: ['barbell-back-squat'] },
      sets: kinds.map((kind, i) => ({ id: `${id}-${i}`, sessionId: id, exerciseId: 'barbell-back-squat', order: i, kind, reps: 8, load: L, uncertain: false })),
    };
  };
  const a = mk('r2-a', 3, ['warmup', 'warmup', 'warmup', 'work', 'work', 'work']);
  const b = mk('r2-b', 2, ['warmup', 'work', 'work', 'drop', 'failure']);
  await dbPut(page, { sessions: [a.s, b.s], sets: [...a.sets, ...b.sets] });
  await page.goto('./#/history');
  await page.waitForTimeout(900);
  const hist = await page.getByRole('main').innerText();
  console.log('INFO history list', JSON.stringify(hist.match(/[^\n]*\b\d+ sets?\b[^\n]*/g)));
  await shot(page, 'r2-history-seeded');
  expect(hist).toMatch(/\b3 sets\b/);
  expect(hist).toMatch(/\b4 sets\b/);
  expect(hist).not.toMatch(/\b(6|5) sets\b/);
  for (const [i, want] of [[0, /4 sets/], [1, /3 sets/]] as const) {
    await page.goto('./#/history');
    await page.waitForTimeout(500);
    await page.getByRole('main').getByText(/\b\d+ sets?\b/).nth(i).tap({ timeout: 5000 });
    await page.waitForTimeout(700);
    const meta = await page.getByTestId('history-meta').innerText();
    console.log('INFO detail', i, JSON.stringify(meta), 'history-set rows', await page.getByTestId('history-set').count());
    expect(meta).toMatch(want);
  }
  expect(errors).toEqual([]);
});

test('r2 check 7: pair dock leaves every bottom control reachable (scroll to the end)', async ({ page }) => {
  test.setTimeout(120_000);
  await pastIntake(page);
  await page.goto('./#/quick?min=30');
  const pump = page.locator('[data-concept="pump"]');
  await expect(pump).toBeVisible();
  const n = Number(((await pump.getByTestId('concept-meta').textContent()) ?? '').match(/^(\d+) exercises/)?.[1] ?? 0);
  await pump.tap();
  for (let k = 0; k < n; k++) await page.getByTestId('deck-keep').tap();
  await page.getByTestId('quick-start').tap();
  type S = { endedAt?: number; exerciseIds: string[] };
  await expect.poll(async () => (await dbAll<S>(page, 'sessions')).some((x) => x.endedAt === undefined)).toBe(true);
  await expect(page).toHaveURL(/#\/workout\//);
  const sess = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
  const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
  const start = Date.now() - 6 * DAY;
  const loadOf = (id: string) => (/^single-arm/.test(id) ? { kind: 'single', unit: 'lb', total: 30 } : /dumbbell|kettlebell/.test(id) ? { kind: 'dumbbell_each', unit: 'lb', total: 20 } : /^barbell|^hip-thrust|^deadlift|^overhead-press/.test(id) ? { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } : { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 });
  await dbPut(page, {
    sessions: [{ id: 'seed-loads', gymId, startedAt: start, endedAt: start + 3_000_000, imported: false, exerciseIds: sess.exerciseIds }],
    sets: sess.exerciseIds.map((id, i) => ({ id: `seed-loads-${i}`, sessionId: 'seed-loads', exerciseId: id, order: i, kind: 'work', uncertain: false, reps: 10, load: loadOf(id) })),
  });
  await page.reload();
  await expect(checkCurrent(page)).toBeVisible();
  await checkCurrent(page).tap();
  const next = page.getByTestId('group-next');
  await expect(next).toBeVisible();
  await page.waitForTimeout(700);
  const report = async (label: string) => {
    const info = await page.evaluate(() => {
      const anchor = (document.querySelector('[data-testid="group-next"]') ?? document.querySelector('[data-testid="rest-timer"]') ?? document.querySelector('main'))!;
      const scrollers: HTMLElement[] = [];
      for (let e: HTMLElement | null = document.querySelector('main'); e; e = e.parentElement) {
        const oy = getComputedStyle(e).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) scrollers.push(e);
      }
      for (const sc of scrollers) sc.scrollTop = sc.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
      const vh = window.innerHeight;
      const bars = ['group-next', 'rest-timer'].map((t) => document.querySelector(`[data-testid="${t}"]`)).filter(Boolean) as HTMLElement[];
      const barBoxes = bars.map((d) => { const r = d.closest('[class*=groupDock]')?.getBoundingClientRect() ?? d.getBoundingClientRect(); return { t: d.dataset.testid, top: Math.round(r.top), h: Math.round(r.height) }; });
      const top = Math.min(...barBoxes.map((b) => b.top), vh);
      const ctrls = Array.from(document.querySelectorAll('main button, main a, main input, main [role=button]')).filter((e) => !bars.some((d) => d.contains(e) || e.contains(d)) && !e.closest('[class*=groupDock]') && !e.closest('[data-testid=rest-timer]')) as HTMLElement[];
      const visible = ctrls.filter((e) => e.getBoundingClientRect().height > 0);
      const covered = visible.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > top + 1; }).map((e) => `${e.dataset.testid ?? e.textContent?.trim().slice(0, 20)} bottom=${Math.round(e.getBoundingClientRect().bottom)}`);
      const lastEl = visible.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      const pb = scrollers.map((sc) => `${sc.tagName}.${String(sc.className).slice(0, 30)} padBottom=${getComputedStyle(sc).paddingBottom} scrollTop=${Math.round(sc.scrollTop)}/${sc.scrollHeight - sc.clientHeight}`);
      const main = document.querySelector('main') as HTMLElement;
      return { vh, barBoxes, dockTop: Math.round(top), covered, scrollers: pb, mainPadBottom: getComputedStyle(main).paddingBottom, lastBottom: lastEl ? Math.round(lastEl.getBoundingClientRect().bottom) : null, lastName: lastEl?.dataset.testid ?? lastEl?.textContent?.trim().slice(0, 25), anchor: (anchor as HTMLElement).dataset.testid, restHeight: getComputedStyle(document.documentElement).getPropertyValue('--rest-height') };
    });
    console.log('INFO', label, JSON.stringify(info));
    return info;
  };
  const r1 = await report('next bar only');
  await page.waitForTimeout(400);
  await shot(page, 'r2-pair-dock-end');
  expect(r1.covered, 'controls covered by the dock after scrolling to the end').toEqual([]);
  // reach both bars: log the partner's set while the rest bar runs, if the app allows
  await next.tap();
  await page.waitForTimeout(500);
  await checkCurrent(page).tap().catch(() => {});
  await page.waitForTimeout(700);
  console.log('INFO second step: rest bars', await page.getByTestId('rest-timer').count(), 'group-next', await page.getByTestId('group-next').count());
  const r2 = await report(`after partner (rest ${await page.getByTestId('rest-timer').count()}, next ${await page.getByTestId('group-next').count()})`);
  await shot(page, 'r2-pair-dock-both');
  expect(r2.covered).toEqual([]);
});
