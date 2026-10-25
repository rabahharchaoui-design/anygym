import { expect, test, type Locator, type Page } from './fixtures';
import { readFileSync } from 'node:fs';

// Tester for PLAN 1.10: data fidelity of plan viewer + started workout against the JSON.

const oh = JSON.parse(readFileSync('data/plans/five-day-split.json', 'utf8'));
const six = JSON.parse(readFileSync('data/plans/six-week-volume.json', 'utf8'));

const watch = (page: Page) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
};

type Exp = { name: string; sets?: number; reps?: string; secs?: string; rest?: number; note?: string; kind: 'single' | 'pair'; warm: boolean; grp: number };
const rng = (v: unknown) => (Array.isArray(v) ? `${v[0]} to ${v[1]}` : String(v));

function expectedOh(day: any): Exp[] {
  const out: Exp[] = [];
  day.blocks.forEach((b: any, bi: number) => {
    if (b.type === 'single') {
      out.push({ name: b.exercise, sets: b.sets, reps: b.reps !== undefined ? rng(b.reps) : undefined, secs: b.seconds !== undefined ? rng(b.seconds) : undefined, rest: b.restSec, note: b.note, kind: 'single', warm: false, grp: bi });
    } else {
      for (const it of b.items) out.push({ name: it.exercise, sets: b.sets, reps: rng(it.reps), rest: b.restSec, note: it.note, kind: 'pair', warm: !!b.warmup, grp: bi });
    }
  });
  return out;
}
function expectedSix(day: any, w: number): Exp[] {
  return day.items.map((it: any, i: number) => {
    const wk = it.weeks[w];
    return { name: it.exercise, sets: wk.sets, reps: wk.reps !== undefined ? String(wk.reps) : undefined, note: it.note, kind: 'single', warm: false, grp: i, rounds: wk.rounds } as Exp;
  });
}

/** Mismatch messages comparing parsed DOM rows with expectations. */
function compare(where: string, got: { name: string; text: string; kind: string; warm: boolean; grp: string }[], exp: Exp[], opts: { sixWeek?: boolean; noteInCard?: boolean }) {
  const bad: string[] = [];
  if (got.length !== exp.length) bad.push(`${where}: count ${got.length} vs JSON ${exp.length}`);
  exp.forEach((e, i) => {
    const g = got[i];
    if (!g) return bad.push(`${where}: missing ${e.name}`);
    if (g.name !== e.name) bad.push(`${where}[${i}]: name "${g.name}" vs JSON "${e.name}"`);
    if (g.kind !== e.kind) bad.push(`${where}[${i}] ${e.name}: kind ${g.kind} vs ${e.kind}`);
    if (g.warm !== e.warm) bad.push(`${where}[${i}] ${e.name}: warmup ${g.warm} vs ${e.warm}`);
    const m = g.text.match(/(\d+) sets? × ([\d]+(?: to \d+)?)/);
    if (e.sets !== undefined && e.reps !== undefined) {
      if (!m || Number(m[1]) !== e.sets || m[2] !== e.reps) bad.push(`${where}[${i}] ${e.name}: "${m?.[0]}" vs JSON ${e.sets} sets × ${e.reps}`);
    }
    if (e.secs !== undefined) {
      if (!new RegExp(`\\b${e.secs} sec`).test(g.text)) bad.push(`${where}[${i}] ${e.name}: hold "${g.text.replace(/\n/g, ' / ')}" vs JSON ${e.secs} sec`);
      if (e.sets !== undefined && (!m || Number(m[1]) !== e.sets)) bad.push(`${where}[${i}] ${e.name}: sets "${m?.[0]}" vs ${e.sets}`);
    }
    const r = g.text.match(/(\d+) s rest/);
    if (e.rest !== undefined && Number(r?.[1]) !== e.rest) bad.push(`${where}[${i}] ${e.name}: rest "${r?.[0]}" vs JSON ${e.rest}`);
    if (e.rest === undefined && r && opts.sixWeek) bad.push(`${where}[${i}] ${e.name}: shows "${r[0]}" but JSON has no restSec${e.note ? ` (note: ${e.note})` : ''}`);
    if (e.note && opts.noteInCard !== false && !g.text.includes(e.note)) bad.push(`${where}[${i}] ${e.name}: note "${e.note}" not shown`);
    if (e.kind === 'pair' && i > 0 && exp[i - 1]!.kind === 'pair' && exp[i - 1]!.grp === e.grp && got[i - 1]!.grp !== g.grp) bad.push(`${where}[${i}] ${e.name}: not grouped with partner`);
    if (e.kind === 'pair' && i + 1 < exp.length && exp[i + 1]!.grp !== e.grp && i > 0 && exp[i - 1]!.grp !== e.grp) bad.push(`${where}[${i}] ${e.name}: pair of one`);
  });
  return bad;
}

async function readViewer(page: Page, label: RegExp) {
  return page.getByRole('region', { name: label }).evaluate((sec) => {
    const rows: any[] = [];
    sec.querySelectorAll('li[data-kind]').forEach((blk, bi) => {
      const label = blk.querySelector('p')?.textContent ?? '';
      blk.querySelectorAll('[data-testid^="plan-item-"]').forEach((it) =>
        rows.push({ name: it.children[0]?.textContent ?? '', text: (it as HTMLElement).innerText, kind: blk.getAttribute('data-kind') === 'pair' ? 'pair' : 'single', warm: blk.hasAttribute('data-warmup'), grp: String(bi), label }),
      );
    });
    return rows;
  });
}

// PLAN 1.7c: the workout opens on the day list; one row per exercise (the finisher row is not a plan block).
async function readWorkout(page: Page) {
  return page.getByRole('main').evaluate((main) => {
    const rows: any[] = [];
    main.querySelectorAll('[data-row]:not([data-testid="finisher"])').forEach((c) => {
      const g = c.closest('[data-testid="pair-group"]');
      const el = c as HTMLElement;
      rows.push({
        name: ((el.querySelector('[class*="_name_"]') as HTMLElement | null)?.innerText ?? '').trim(),
        text: el.innerText,
        kind: g ? 'pair' : 'single',
        warm: !!g && g.hasAttribute('data-warmup'),
        grp: g ? String([...main.querySelectorAll('[data-testid="pair-group"]')].indexOf(g)) : `s-${rows.length}`,
        label: g?.querySelector('p')?.textContent ?? '',
      });
    });
    return rows;
  });
}

async function putState(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(
    (p) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => rej(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('planState', 'readwrite');
          const st = tx.objectStore('planState');
          const g = st.get('active');
          g.onsuccess = () => st.put({ ...g.result, ...p });
          tx.oncomplete = () => (db.close(), res());
          tx.onerror = () => rej(tx.error);
        };
      }),
    patch,
  );
}

async function startDay(page: Page, planPath: string, dayN: number, week?: number) {
  await page.goto(`./#/plans/${planPath}`);
  await page.getByRole('button', { name: /Use this plan|Go to Today/ }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  if (week !== undefined) { await putState(page, { weekIndex: week }); await page.reload(); }
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: new RegExp(`Day ${dayN} ·`) }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await expect(page.getByTestId('workout-title')).toBeVisible();
  await page.locator('[data-row]').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
}

for (const n of [1, 2, 4]) {
  test(`fidelity: 5 day split day ${n} viewer + workout`, async ({ page }) => {
    const errors = watch(page);
    const bad: string[] = [];
    const day = oh.days[n - 1];
    await page.goto('./#/plans/five-day-split');
    const vrows = await readViewer(page, new RegExp(`^Day ${n} ·`));
    bad.push(...compare(`OH viewer d${n}`, vrows, expectedOh(day), {}));
    vrows.forEach((r: any, i: number) => {
      const e = expectedOh(day)[i];
      if (e?.kind === 'pair' && !r.label.includes('Pair: back to back')) bad.push(`OH viewer d${n} ${r.name}: pair label "${r.label}"`);
      if (e?.warm && !r.label.includes('Warm up')) bad.push(`OH viewer d${n} ${r.name}: warm up label "${r.label}"`);
    });
    await startDay(page, 'five-day-split', n);
    const rows = await readWorkout(page);
    bad.push(...compare(`OH workout d${n}`, rows, expectedOh(day), { noteInCard: false }));
    const labels = await page.locator('[data-testid="pair-group"]').evaluateAll((g) => g.map((x) => x.querySelector('p')?.textContent));
    console.log(`d${n} pair labels`, JSON.stringify(labels));
    const cur = page.locator('[data-row][data-state="next"]').first();
    console.log(`d${n} next row:`, (await cur.innerText({ timeout: 3000 }).catch(() => 'NO NEXT ROW')).replace(/\n+/g, ' / ').slice(0, 300));
    console.log(`MISMATCHES OH d${n}:\n` + bad.join('\n'));
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('fidelity: Six Week day 1 week 1 and week 4, week picker for 3 exercises', async ({ page }) => {
  const errors = watch(page);
  const bad: string[] = [];
  await page.goto('./#/plans/six-week-volume');
  for (const w of [0, 3]) {
    await page.getByRole('button', { name: `Week ${w + 1}` }).tap();
    for (const n of [1, 2, 3, 4, 5]) {
      const rows = await readViewer(page, new RegExp(`^Day ${n} ·`));
      const exp = expectedSix(six.days[n - 1], w);
      bad.push(...compare(`SIX viewer w${w + 1} d${n}`, rows, exp.filter((e: any) => e.rounds === undefined), { sixWeek: true }));
      if (n === 3) {
        const sprint = rows[0];
        console.log('d3 sprint viewer:', sprint?.text.replace(/\n/g, ' / '), 'JSON rounds', six.days[2].items[0].weeks[w].rounds);
      }
    }
  }
  const noRest = bad.filter((b) => b.includes('JSON has no restSec'));
  const other = bad.filter((b) => !b.includes('JSON has no restSec') && !/ d3\b/.test(b));
  console.log(`SIX invented rest lines: ${noRest.length}; sample: ${noRest[0]}; leg ext note: ${noRest.find((b) => b.includes('note:'))}`);
  console.log('MISMATCHES SIX other:\n' + other.join('\n'));
  expect(other).toEqual([]);
  expect(errors).toEqual([]);
});

for (const w of [0, 3]) {
  test(`fidelity: Six Week workout day 1 week ${w + 1}`, async ({ page }) => {
    const errors = watch(page);
    await startDay(page, 'six-week-volume', 1, w);
    const rows = await readWorkout(page);
    const bad = compare(`SIX workout w${w + 1} d1`, rows, expectedSix(six.days[0], w), { sixWeek: true, noteInCard: false }).filter((m) => !m.includes('JSON has no restSec'));
    console.log(`SIX workout w${w + 1}:`, rows.map((r: any) => r.text.split('\n').slice(0, 2).join(' | ')).join('\n'));
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
}

// ---- flow, honest states, one screen, tap targets, break it ----
const dbAll = (page: Page, store: string) =>
  page.evaluate(
    (name) =>
      new Promise<any[]>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const q = req.result.transaction(name, 'readonly').objectStore(name).getAll();
          q.onsuccess = () => (resolve(q.result), req.result.close());
        };
      }),
    store,
  );
const big = async (loc: Locator, what: string) => {
  const b = (await loc.boundingBox())!;
  expect(b, what).toBeTruthy();
  expect.soft(Math.min(b.width, b.height), `${what} ${JSON.stringify(b)}`).toBeGreaterThanOrEqual(47.5);
};
const vshot = async (page: Page, name: string) => {
  if (test.info().project.name !== 'iPhone 15') return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `reports/shots/1.10/v-${name}.png`, fullPage: false });
};
// Unknown load types are answered "Bodyweight": a load that is certain, so a set can be logged.
const answerAny = async (page: Page) => {
  const d = page.getByRole('dialog', { name: 'How do you load this?' });
  await page.waitForTimeout(400);
  if (await d.count()) {
    await d.getByRole('button', { name: /^Bodyweight/ }).tap();
    await expect(d).toHaveCount(0);
  }
};
/** PLAN 1.7c: open rows in order until one can be logged with one ✓, log it. */
const logOneSet = async (page: Page) => {
  const rows = page.locator('[data-row]');
  const total = await rows.count();
  for (let i = 0; i < total; i++) {
    await rows.nth(i).tap();
    await answerAny(page);
    const check = page.getByTestId('check-current');
    // A first time weight is picked, never invented: an empty bar (or what the picker starts at).
    if ((await check.count()) && !(await check.isEnabled()) && (await page.getByTestId('weight-cell').count())) {
      await page.getByTestId('weight-cell').first().tap();
      const sheet = page.getByRole('dialog', { name: 'Pick the weight' });
      const done = sheet.getByRole('button', { name: 'Done', exact: true });
      if (await done.isEnabled()) await done.tap();
      else await sheet.getByRole('button', { name: 'Close', exact: true }).tap();
      await expect(sheet).toHaveCount(0);
    }
    if ((await check.count()) && (await check.isEnabled())) {
      await check.tap();
      await expect(page.getByTestId('set-row').first()).toBeVisible();
      return;
    }
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
  }
  throw new Error('no row could be logged');
};
const finishDay = async (page: Page) => {
  await page.getByRole('button', { name: 'Finish' }).tap();
  await expect(page).toHaveURL(/\/done$/);
  // 1.7e: a day with lifts left stays up next unless you move on (this flow walks the week).
  await expect(page.getByTestId('finish-title')).toBeVisible();
  const move = page.getByRole('radio', { name: /^Next time: move on to Day/ });
  if (await move.count()) await move.tap();
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(page).toHaveURL(/#\/$/);
};
const doDay = async (page: Page, n: number) => {
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: new RegExp(`Day ${n} ·`) }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.locator('[data-row]').first().waitFor();
  await page.waitForTimeout(500);
  await logOneSet(page);
  await finishDay(page);
};

test('flow: wrap after day 5, six week to week 2, tap targets', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/plans');
  for (const l of await page.locator('a[data-testid^="plan-"]').all()) await big(l, 'plan row');
  await page.getByTestId('plan-five-day-split').tap();
  await big(page.getByRole('button', { name: 'Use this plan' }), 'Use this plan');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await big(page.getByRole('button', { name: 'Start', exact: true }), 'Start');
  await big(page.getByRole('button', { name: 'Change day' }), 'Change day');
  const dots = await page.locator('[data-testid^="week-day-"]').all();
  for (const d of dots) console.log('week dot', JSON.stringify(await d.boundingBox()));
  await page.getByRole('button', { name: 'Change day' }).tap();
  for (const b of await page.getByRole('dialog', { name: 'Change day' }).getByRole('button').all()) await big(b, 'change day sheet row');
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 5 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page).toHaveURL(/#\/workout\//);
  await page.locator('[data-row]').first().waitFor();
  await page.waitForTimeout(500);
  await logOneSet(page);
  await finishDay(page);
  console.log('sessions', JSON.stringify((await dbAll(page, 'sessions')).map((x) => [x.planId, x.dayId, x.endedAt])), JSON.stringify(await dbAll(page, 'planState')));
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 · Legs \(hamstring focus\)/);
  console.log('after d5 states', JSON.stringify(await Promise.all([1, 2, 3, 4, 5].map((n) => page.getByTestId(`week-day-${n}`).getAttribute('data-state')))));
  expect(errors).toEqual([]);
});

test('flow: six week all days of week 1 -> Week 2 of 6', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watch(page);
  await page.goto('./#/plans/six-week-volume');
  for (const c of await page.getByRole('group', { name: 'Week' }).getByRole('button').all()) await big(c, 'week chip');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('week-label')).toHaveText('Week 1 of 6');
  for (const n of [1, 2, 3, 4, 5]) {
    await doDay(page, n);
    console.log(`after d${n}:`, await page.getByTestId('week-label').innerText(), await page.getByTestId('day-card-title').innerText());
  }
  await expect(page.getByTestId('week-label')).toHaveText('Week 2 of 6');
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 1 · Quads/);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.getByTestId('row-front-squat').tap();
  await answerAny(page);
  await expect(page.getByTestId('exercise-front-squat').getByTestId('set-target')).toHaveText('Set 1 of 5 · 7 reps');
  expect(errors).toEqual([]);
});

test('honest: no img, unknown asks once, timed Hold, one screen exercise view on plan targets', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.locator('[data-row]').first().waitFor();
  await expect(page.getByRole('main').locator('img')).toHaveCount(0);
  const back = async () => {
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await expect(page.getByTestId('arrival-guard')).toHaveCount(0);
  };
  await expect(page.getByTestId('row-static-quadricep-stretch')).toContainText('45 sec');
  await page.getByTestId('row-static-quadricep-stretch').tap();
  const stretch = page.getByTestId('exercise-static-quadricep-stretch');
  await expect(stretch).toContainText('Hold');
  await expect(stretch.getByTestId('hold-cell')).toHaveText(['45 sTap to start']);
  await expect(stretch.getByRole('button', { name: 'Start timer' })).toBeVisible();
  await back();
  // plank target seconds
  await page.getByTestId('row-elbow-plank').tap();
  const plank = page.getByTestId('exercise-elbow-plank');
  console.log('plank view:', (await plank.innerText()).replace(/\n+/g, ' / '));
  await expect(plank).toContainText('Hold');
  await expect(plank.getByTestId('hold-cell').first()).toContainText('1:00'); // m:ss from a minute on (1.7e)
  await back();
  // squat: known (barbell), never asked
  await page.getByTestId('row-barbell-back-squat').tap();
  const ask = page.getByRole('dialog', { name: 'How do you load this?' });
  const squat = page.getByTestId('exercise-barbell-back-squat');
  await expect(squat.getByTestId('set-target')).toBeVisible();
  await page.waitForTimeout(400);
  console.log('squat view:', (await squat.innerText()).replace(/\n+/g, ' / ').slice(0, 400), 'asked', await ask.count());
  await expect(ask).toHaveCount(0);
  await back();
  // leg press: a plate loaded machine by the hand mapped list (PLAN 1.7c), never asked either
  await page.getByTestId('row-angled-machine-leg-press').tap();
  const press = page.getByTestId('exercise-angled-machine-leg-press');
  await expect(press.getByTestId('set-target')).toBeVisible();
  await page.waitForTimeout(400);
  await expect(ask).toHaveCount(0);
  await expect(press.getByTestId('set-status')).toContainText('starting weight');
  console.log('press view:', (await press.innerText()).replace(/\n+/g, ' / ').slice(0, 500));
  // one screen rule on SE: the exercise view never scrolls
  const sh = await press.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  console.log('press view', JSON.stringify(sh));
  expect.soft(sh.sh - sh.ch).toBeLessThanOrEqual(1);
  await vshot(page, 'card-plan-target');
  await page.reload();
  await press.waitFor();
  await page.waitForTimeout(500);
  await expect(ask).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('break: double tap Use this plan and Start; switch plan mid workout; reload on viewer; offline', async ({ page, context }) => {
  const errors = watch(page);
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).dblclick();
  await page.waitForTimeout(500);
  expect((await dbAll(page, 'planState')).length).toBe(1);
  await page.getByRole('button', { name: 'Start', exact: true }).dblclick();
  await page.waitForTimeout(1000);
  const sess = await dbAll(page, 'sessions');
  console.log('sessions after double Start', sess.length);
  expect(sess.length).toBe(1);
  await page.locator('[data-row]').first().waitFor();
  await page.getByTestId('row-barbell-back-squat').tap();
  await answerAny(page);
  // First time: pick the first weight (an empty bar), then one ✓.
  await page.getByTestId('weight-cell').first().tap();
  await page.getByRole('dialog', { name: 'Pick the weight' }).getByRole('button', { name: 'Done' }).tap();
  await page.getByTestId('check-current').tap();
  await expect(page.getByTestId('set-row')).toHaveCount(1);
  await page.waitForTimeout(600);
  // switch plan mid workout via URL (tab bar hidden in workout)
  await page.goto('./#/plans/six-week-volume');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page).toHaveURL(/#\/$/);
  console.log('today after switch:', await page.locator('main').innerText().then((t) => t.replace(/\n+/g, ' / ').slice(0, 300)));
  const sets = await dbAll(page, 'sets');
  const sess2 = await dbAll(page, 'sessions');
  console.log('sessions', sess2.map((s) => ({ end: s.endedAt, plan: s.planId, day: s.dayId })), 'sets', sets.length);
  expect(sess2.length).toBe(1);
  expect(sets.length).toBe(1);
  // resume active workout?
  const resume = page.getByRole('button', { name: /Resume|Continue/ });
  console.log('resume buttons', await resume.count());
  if (await resume.count()) {
    await resume.first().tap();
    await expect(page).toHaveURL(/#\/workout\//);
    await page.getByTestId('row-barbell-back-squat').tap();
    await expect(page.getByTestId('exercise-barbell-back-squat')).toContainText(/Set 2 of 4/);
  }
  // reload viewer
  await page.goto('./#/plans/six-week-volume');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Six Week Volume Builder' })).toBeVisible();
  await context.setOffline(true);
  await page.reload().catch(() => {});
  await page.waitForTimeout(500);
  console.log('offline viewer heading', await page.getByRole('heading', { name: 'Six Week Volume Builder' }).count());
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

for (const where of ['viewer', 'today']) {
  test(`break: monkey 60s on the plan ${where}`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watch(page);
    await page.goto('./#/plans/six-week-volume');
    if (where === 'today') {
      await page.getByRole('button', { name: 'Use this plan' }).tap();
      await expect(page).toHaveURL(/#\/$/);
    }
    const base = page.url();
    const vp = page.viewportSize()!;
    let seed = where === 'today' ? 99 : 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const end = Date.now() + 60_000;
    let leftWorkout = 0;
    while (Date.now() < end) {
      const x = Math.floor(rnd() * vp.width), y = Math.floor(rnd() * vp.height), r = rnd();
      try {
        if (r < 0.6) await page.touchscreen.tap(x, y);
        else if (r < 0.9) { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(Math.floor(rnd() * vp.width), Math.floor(rnd() * vp.height), { steps: 4 }); await page.mouse.up(); }
        else await page.mouse.wheel(0, (rnd() - 0.5) * 900);
      } catch {}
      if (page.url().includes('/workout/')) { leftWorkout++; await page.goto(base); }
      else if (!page.url().startsWith(base.split('#')[0]!)) await page.goto(base);
      await page.waitForTimeout(40);
    }
    for (let i = 0; i < 4 && (await page.getByRole('dialog').count()); i++) await page.keyboard.press('Escape');
    await page.goto('./#/');
    await page.waitForTimeout(500);
    console.log(where, 'monkey left to workout', leftWorkout, 'sessions', (await dbAll(page, 'sessions')).length, 'planState', JSON.stringify(await dbAll(page, 'planState')));
    await expect(page.getByRole('main')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('shots: plans, both viewers, today day card, workout pair', async ({ page }) => {
  await page.goto('./#/plans');
  await vshot(page, 'plans');
  await page.goto('./#/plans/five-day-split');
  await vshot(page, 'viewer-split5');
  await page.getByRole('region', { name: /^Day 2/ }).scrollIntoViewIfNeeded();
  await vshot(page, 'viewer-split5-day2');
  await page.goto('./#/plans/six-week-volume');
  await vshot(page, 'viewer-sixweek');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible(); // 1.7e: the screen changes on the next frame
  await vshot(page, 'today-sixweek');
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await vshot(page, 'today-split5');
  await page.getByRole('button', { name: 'Change day' }).tap();
  await vshot(page, 'change-day');
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 2 ·/ }).tap();
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await page.locator('[data-row]').first().waitFor();
  await page.waitForTimeout(500);
  await vshot(page, 'workout-pair-top');
  await page.getByTestId('pair-group').nth(1).scrollIntoViewIfNeeded();
  await vshot(page, 'workout-pair-2');
});

// Regression for a real bug: after a fresh app load, picking a day in Change day must update the card and Start must open that day.
test('change day works on a fresh app load (not only right after Use this plan)', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/plans/five-day-split');
  await page.getByRole('button', { name: 'Use this plan' }).tap();
  await expect(page.getByTestId('day-card-title')).toBeVisible(); // 1.7e: the screen changes on the next frame
  await page.reload();
  await expect(page.getByTestId('day-card-title')).toBeVisible();
  await page.getByRole('button', { name: 'Change day' }).tap();
  await page.getByRole('dialog', { name: 'Change day' }).getByRole('button', { name: /Day 4 ·/ }).tap();
  await expect(page.getByTestId('day-card-title')).toHaveText(/^Day 4 · Legs \(quad focus\)/);
  await page.getByRole('button', { name: 'Start', exact: true }).tap();
  await expect(page.getByTestId('workout-title')).toHaveText('Day 4 · Legs (quad focus)');
  expect(errors).toEqual([]);
});
