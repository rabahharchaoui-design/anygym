import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, seedFinished, shotOn, watchErrors } from './workout-helpers';
import { card, pastIntake, PROFILE } from './helpers/quick';
import { readFileSync } from 'node:fs';

// Tester checks for PLAN 3.5b (independent of tests/quick-3.5b.spec.ts).
const SHOT = 'reports/shots/3.5b-verify';
const STACK = { kind: 'stack', unit: 'lb', total: 50 };
const HOTEL = ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'];
const CHIPS = [15, 30, 45, 60];

async function shot(page: Page, name: string) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/${name}-${test.info().project.name.replace(/ /g, '-')}.png` });
}
async function open(page: Page, m = 30) {
  await page.goto(`./#/quick?min=${m}`);
  await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
  await expect(page.locator('[data-concept]').first().or(page.getByTestId('quick-nofit')).or(page.getByRole('heading', { name: /Not enough here/ })).first()).toBeVisible();
}
const read = (page: Page) =>
  page.locator('[data-concept]').evaluateAll((els) =>
    els.map((e) => ({
      id: e.getAttribute('data-concept')!,
      title: e.querySelector('[data-testid="concept-title"]')?.textContent ?? '',
      chip: e.querySelector('[data-testid="style-chip"]')?.textContent ?? '',
      why: e.querySelector('[data-testid="concept-why"]')?.textContent ?? '',
      meta: e.querySelector('[data-testid="concept-meta"]')?.textContent ?? '',
      gearLabel: e.querySelector('[data-testid="concept-gear"]')?.getAttribute('aria-label') ?? '',
      gearIcons: Array.from(e.querySelectorAll('[data-testid="concept-gear"] svg[data-art]')).map((s) => s.getAttribute('data-art')),
      dots: e.querySelectorAll('[data-testid="effort"] > span').length,
      dotsOn: e.querySelectorAll('[data-testid="effort"] > span[data-on]').length,
      map: e.querySelectorAll('[data-testid="mini-map"]').length,
      h: e.getBoundingClientRect().height,
    })),
  );
const minOf = (meta: string) => Number(meta.match(/~(\d+) min/)![1]);
const countOf = (meta: string) => Number(meta.match(/^(\d+)/)![1]);

async function setGym(page: Page, equipment: string[]) {
  await pastIntake(page, equipment);
}
async function seedHistory(page: Page) {
  // chest-free history: triceps yesterday, back/biceps 4 days ago.
  await seedFinished(page, { 'cable-tricep-pushdown': [{ reps: 10, load: STACK }] }, 1);
  const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
  const start = Date.now() - 4 * 86_400_000;
  await dbPut(page, {
    sessions: [{ id: 'seed-4d', gymId, startedAt: start, endedAt: start + 3_000_000, imported: false, exerciseIds: ['cable-seated-close-grip-row', 'cable-single-arm-bicep-curl'] }],
    sets: [
      { id: 'seed-4d-0', sessionId: 'seed-4d', exerciseId: 'cable-seated-close-grip-row', order: 0, kind: 'work', uncertain: false, reps: 10, load: STACK },
      { id: 'seed-4d-1', sessionId: 'seed-4d', exerciseId: 'cable-single-arm-bicep-curl', order: 1, kind: 'work', uncertain: false, reps: 10, load: STACK },
    ],
  });
}
async function usePlanSeed(page: Page) {
  await dbPut(page, { planState: [{ id: 'active', planId: 'five-day-split', startedAt: Date.now() - 86_400_000 * 7, weekIndex: 0, nextDayIndex: 1, doneDays: [0] }] });
}


/** Gives these exercises a finished session in the past (right load kinds), so a set can be logged without the weight wheel. */
async function seedLoads(page: Page, ids: string[]) {
  const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
  const start = Date.now() - 6 * 86_400_000;
  // 3.5b round 4 (M6): the pump now opens on a main lift (Hip Thrust, a barbell lift without "barbell" in its id).
  const loadOf = (id: string) => (/^dumbbell|^kettlebell/.test(id) ? { kind: 'dumbbell_each', unit: 'lb', total: 20 } : /^barbell|^hip-thrust|^deadlift|^overhead-press/.test(id) ? { kind: 'barbell', unit: 'lb', total: 95, barWeight: 45, perSide: [25] } : { kind: 'stack', unit: 'lb', total: 50, stackValue: 50 });
  await dbPut(page, {
    sessions: [{ id: 'seed-loads', gymId, startedAt: start, endedAt: start + 3_000_000, imported: false, exerciseIds: ids }],
    sets: ids.map((id, i) => ({ id: `seed-loads-${i}`, sessionId: 'seed-loads', exerciseId: id, order: i, kind: 'work', uncertain: false, reps: 10, load: loadOf(id) })),
  });
  await page.reload();
}

test.describe('verify 3.5b', () => {
  test('1 diversity: full gym with plan and history, then without', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await seedHistory(page);
    await page.reload();
    await open(page, 30);
    const none = await read(page);
    console.log('NO PLAN', JSON.stringify(none.map((c) => [c.id, c.chip, c.why, c.meta])));
    expect(none.some((c) => c.id === 'plan')).toBe(false);
    expect(none[0]!.id).toBe('fresh');
    await usePlanSeed(page);
    await page.reload();
    await open(page, 30);
    const cs = await read(page);
    console.log('WITH PLAN', JSON.stringify(cs.map((c) => [c.id, c.title, c.chip, c.why, c.meta, c.gearLabel])));
    expect(cs).toHaveLength(4);
    expect(cs[0]!.id).toBe('plan');
    expect(cs[0]!.title).toMatch(/Your plan, short/);
    expect(cs[1]!.id).toBe('fresh');
    expect(cs[1]!.title).toMatch(/Hit what.s fresh/);
    expect(new Set(cs.map((c) => c.id)).size).toBe(4);
    await shot(page, 'full-plan-history-30');
    expect(errors).toEqual([]);
  });

  test('3/4 density, richer cards across presets and chips', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const gyms: Record<string, string[] | undefined> = { full: undefined, dumbbell: ['dumbbells', 'adjustable_bench'], hotel: HOTEL };
    const out: string[] = [];
    for (const [gn, eq] of Object.entries(gyms)) {
      await setGym(page, eq as string[]);
      await open(page, 30);
      for (const m of CHIPS) {
        await page.getByTestId(`min-${m}`).tap();
        await expect(page.getByTestId(`min-${m}`)).toHaveAttribute('aria-pressed', 'true');
        await page.waitForTimeout(150);
        const cs = await read(page);
        out.push(`${gn} ${m}: ${cs.map((c) => `${c.id}[${c.chip}|${c.meta}|dots${c.dotsOn}/${c.dots}|map${c.map}|gear:${c.gearLabel}|${c.why}]`).join('  ')}`);
        for (const c of cs) {
          expect(minOf(c.meta), `${gn} ${m} ${c.id} over`).toBeLessThanOrEqual(m + (c.id === 'plan' ? 2 : 0));
          expect(c.dots).toBe(3);
          expect(c.map).toBe(1);
          expect(c.h).toBeGreaterThan(80);
          // gear icons only from the gym
          for (const g of c.gearIcons) if (eq) expect(eq, `${gn} gear ${g}`).toContain(g);
        }
        if (m === 30 && gn === 'dumbbell') await shot(page, 'dumbbell-30');
        if (m === 30 && gn === 'hotel') await shot(page, 'hotel-30');
        if (m === 60 && gn === 'hotel') await shot(page, 'hotel-60');
        if (m === 60 && gn === 'full') await shot(page, 'full-60');
      }
    }
    console.log(out.join('\n'));
    expect(errors).toEqual([]);
  });

  test('3b start a 30 min card: day list shows same minutes, groups, sets/reps/rest carried', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await open(page, 30);
    const cs = await read(page);
    const pump = page.locator('[data-concept="pump"]');
    const meta = (await pump.getByTestId('concept-meta').textContent())!;
    const n = countOf(meta);
    await pump.tap();
    await expect(card(page)).toBeVisible();
    for (let k = 0; k < n; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${n}`);
      await page.getByTestId('deck-keep').tap();
    }
    const lines = await page.getByTestId('ready-list').locator('li').allTextContents();
    console.log('READY', lines.join(' || '));
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const ss = (await dbAll<{ id: string; endedAt?: number; targets: Record<string, { sets: number; restSec: number; pair?: { group: number; size: number } }>; exerciseIds: string[] }>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    console.log('TARGETS', JSON.stringify(ss.targets));
    expect(ss.exerciseIds).toHaveLength(n);
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    await expect(page.getByTestId('workout-meta')).toContainText(`~${minOf(meta)} min`);
    const groups = new Set(Object.values(ss.targets).filter((t) => t.pair).map((t) => t.pair!.group));
    await expect(page.getByTestId('pair-group')).toHaveCount(groups.size);
    await shot(page, 'daylist-pump-30');
    expect(cs.length).toBe(4);
    expect(errors).toEqual([]);
  });

  test('5 fold, More ideas swap + diversity, SE 130%', async ({ page }, info) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await seedHistory(page);
    await usePlanSeed(page);
    await page.reload();
    await open(page, 30);
    const vh = page.viewportSize()!.height;
    const blocks = [];
    for (const l of await page.locator('[data-concept]').all()) blocks.push((await l.boundingBox())!);
    const more = page.getByTestId('more-ideas');
    await expect(more).toBeVisible();
    const mb = (await more.boundingBox())!;
    const myself = (await page.getByTestId('pick-myself').boundingBox())!;
    console.log(`${info.project.name} vh=${vh} cards end ${blocks[3]!.y + blocks[3]!.height} more y=${mb.y} end=${mb.y + mb.height} myself y=${myself.y} bottom=${myself.y + myself.height}`);
    expect(myself.y).toBeGreaterThanOrEqual(mb.y + mb.height - 1);
    await shot(page, 'fold-30');
    const chips = more.locator('button');
    for (const b of await chips.all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(47.5);
    const before = await read(page);
    const target = (await chips.first().getAttribute('data-testid'))!.replace('more-', '');
    await chips.first().tap();
    await expect(page.locator(`[data-concept="${target}"]`)).toBeVisible();
    const after = await read(page);
    // 3.5b round 4 (M12): the new idea takes one card's place (card 4, or the one it is too close to);
    // the plan and fresh cards stay.
    const changed = after.map((c, i) => (c.id === before[i]!.id ? -1 : i)).filter((i) => i !== -1);
    expect(changed).toHaveLength(1);
    expect(['plan', 'fresh']).not.toContain(before[changed[0]!]!.id);
    await shot(page, 'after-swap-30');
    await page.getByTestId('pick-myself').scrollIntoViewIfNeeded();
    await shot(page, 'bottom-30');
    if (info.project.name === 'iPhone SE') {
      for (const pct of ['100%', '130%']) {
        await page.evaluate((p) => (document.documentElement.style.fontSize = p), pct);
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        const bx = [];
        for (const l of await page.locator('[data-concept]').all()) bx.push((await l.boundingBox())!);
        for (let i = 1; i < bx.length; i++) expect(bx[i]!.y).toBeGreaterThanOrEqual(bx[i - 1]!.y + bx[i - 1]!.height - 1);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.getByRole('main').evaluate((m) => (m.scrollTop = 0)).catch(() => undefined);
        await shot(page, `se-${pct}-top`);
        await page.getByTestId('pick-myself').scrollIntoViewIfNeeded();
        await shot(page, `se-${pct}-bottom`);
      }
    }
    expect(errors).toEqual([]);
  });

  test('6 inclusive: beginner and Go easy on; hotel and dumbbell: all four chips', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [label, eq, intake] of [
      ['beginner-full', undefined, { experience: 'new' }],
      ['easyon-full', undefined, { experience: '3y', easyOn: ['knees'] }],
      ['beginner-hotel', HOTEL, { experience: 'new' }],
    ] as const) {
      await pastIntake(page, eq as string[] | undefined);
      await dbPut(page, { profile: [{ ...PROFILE, intake: { ...PROFILE.intake, ...intake } }] });
      await page.reload();
      await open(page, 30);
      for (const m of CHIPS) {
        await page.getByTestId(`min-${m}`).tap();
        await page.waitForTimeout(150);
        const cs = await read(page);
        const easy = cs.find((c) => c.id === 'easy');
        console.log(label, m, cs.map((c) => `${c.id}:${c.chip}`).join(' '));
        expect(easy, `${label} ${m} easy`).toBeDefined();
        expect(easy!.chip).toBe('Low impact');
        if (label === 'easyon-full' && m === 30) console.log('easy line', easy!.why);
      }
      await shot(page, `inclusive-${label}`);
    }
    expect(errors).toEqual([]);
  });

  test('7 honesty: home and outdoors empty state; hotel card count', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [label, eq] of [['home', []], ['outdoors', []], ['hotel', HOTEL]] as const) {
      await pastIntake(page, eq as string[]);
      await open(page, 30);
      if (label !== 'hotel') {
        expect(await page.locator('[data-concept]').count()).toBe(0);
        await expect(page.getByRole('heading', { name: /Not enough here/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Pick exercises myself' })).toBeVisible();
        await shot(page, `honest-${label}`);
        continue;
      }
      for (const m of CHIPS) {
        await page.getByTestId(`min-${m}`).tap();
        await page.waitForTimeout(150);
        const n = await page.locator('[data-concept]').count();
        console.log(label, m, 'cards', n, (await page.locator('main').innerText()).replace(/\n+/g, ' / ').slice(0, 220));
      }
      await shot(page, `honest-${label}`);
    }
    expect(errors).toEqual([]);
  });

  test('2 rotation through the UI: shown set remembered; two finished circuit workouts push circuit down', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await open(page, 30);
    const first = (await read(page)).map((c) => c.id);
    await page.waitForTimeout(500);
    const prof = (await dbAll<{ quickIdeas?: { shown: string[] } }>(page, 'profile'))[0]!;
    console.log('FIRST', first.join(','), 'REMEMBERED', JSON.stringify(prof.quickIdeas));
    expect(prof.quickIdeas?.shown).toEqual(first);
    await page.reload();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    const second = (await read(page)).map((c) => c.id);
    console.log('SECOND', second.join(','));
    expect([...second].sort()).not.toEqual([...first].sort());
    // two finished circuit quick workouts with logged sets
    const gymId = (await dbAll<{ id: string; isActive: boolean }>(page, 'gyms')).find((g) => g.isActive)!.id;
    const mk = (i: number) => ({ id: `qc-${i}`, gymId, startedAt: Date.now() - (i + 5) * 86_400_000, endedAt: Date.now() - (i + 5) * 86_400_000 + 1_800_000, imported: false, quickStyle: 'circuit', exerciseIds: ['crunch'] });
    await dbPut(page, {
      sessions: [mk(1), mk(2)],
      sets: [1, 2].map((i) => ({ id: `qc-${i}-0`, sessionId: `qc-${i}`, exerciseId: 'crunch', order: 0, kind: 'work', uncertain: false, reps: 10, load: { kind: 'bodyweight' } })),
    });
    await dbPut(page, { profile: [{ ...prof, quickIdeas: { shown: [] } }] });
    await page.reload();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    const third = (await read(page)).map((c) => c.id);
    console.log('THIRD (circuit done x2)', third.join(','));
    expect(third[0]).not.toBe('circuit');
    expect(errors).toEqual([]);
  });

  test('9 break it: double tap a card, reload mid deck, offline, rapid chips', async ({ page, context }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await open(page, 30);
    for (let i = 0; i < 6; i++) await page.getByTestId(`min-${CHIPS[i % 4]}`).tap({ noWaitAfter: true });
    await open(page, 30);
    await page.getByTestId('min-30').tap();
    await page.locator('[data-concept]').first().dblclick();
    await expect(card(page)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Quick workout' })).toBeVisible();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    const sessionsBefore = (await dbAll(page, 'sessions')).length;
    await context.setOffline(true);
    await page.locator('[data-concept]').nth(1).tap();
    await expect(card(page)).toBeVisible();
    await page.goBack();
    await context.setOffline(false);
    expect((await dbAll(page, 'sessions')).length).toBe(sessionsBefore);
    expect(errors).toEqual([]);
  });

  // ---------------------------------------------------------------- round 2
  test('R2-1 five day split day 2 on the full gym at 15, 30, 60; start the 30 min plan card', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    await usePlanSeed(page);
    await page.reload();
    await open(page, 30);
    for (const m of [15, 30, 45, 60]) {
      await page.getByTestId(`min-${m}`).tap();
      await expect(page.getByTestId(`min-${m}`)).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(250);
      const cs = await read(page);
      const first = page.locator('[data-concept]').first();
      const short = await first.getByTestId('concept-short').allTextContents();
      console.log(`R2 plan ${m}: ${cs[0]!.id} "${cs[0]!.title}" ${cs[0]!.meta} why="${cs[0]!.why}" short=${JSON.stringify(short)}`);
      expect(cs[0]!.id).toBe('plan');
      const mn = minOf(cs[0]!.meta);
      expect(mn).toBeLessThanOrEqual(m);
      if (m === 30) expect(countOf(cs[0]!.meta)).toBeGreaterThanOrEqual(5);
      if (mn < m - 2) expect(short.length).toBe(1);
      else expect(short.length).toBe(0);
      await shot(page, `r2-plan-${m}`);
    }
    await page.getByTestId('min-30').tap();
    await page.waitForTimeout(250);
    const plan = page.locator('[data-concept="plan"]');
    const meta = (await plan.getByTestId('concept-meta').textContent())!;
    const n = countOf(meta);
    // 3.5b round 4 (M9): the line says "pairs" now (was "supersets").
    const supers = Number(meta.match(/(\d+) (?:supersets?|pairs?)/)?.[1] ?? 0);
    await plan.tap();
    await expect(card(page)).toBeVisible();
    for (let k = 0; k < n; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${n}`);
      await page.getByTestId('deck-keep').tap();
    }
    const lines = await page.getByTestId('ready-list').locator('li').allTextContents();
    console.log('R2 READY', lines.join(' || '));
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const ss = (await dbAll<{ endedAt?: number; targets: Record<string, { sets: number; restSec: number; pair?: { group: number } }>; exerciseIds: string[] }>(page, 'sessions')).find((x) => x.endedAt === undefined);
    console.log('R2 SESSION', JSON.stringify(ss));
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    await expect(page.getByTestId('workout-meta')).toContainText(`~${minOf(meta)} min`);
    await expect(page.getByTestId('pair-group')).toHaveCount(supers);
    const rows = await page.locator('[data-testid^="row-"]').allInnerTexts();
    console.log('R2 DAYLIST', rows.map((r) => r.replace(/\n+/g, ' / ')).join(' || '));
    console.log('R2 META', await page.getByTestId('workout-meta').innerText());
    await shot(page, 'r2-plan-daylist-30');
    expect(errors).toEqual([]);
  });

  test('R2-4 rest timer: first member of a pair starts none, second starts the group rest; plan pairs rest every set', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    await open(page, 30);
    const pump = page.locator('[data-concept="pump"]');
    const meta = (await pump.getByTestId('concept-meta').textContent())!;
    const n = countOf(meta);
    await pump.tap();
    for (let k = 0; k < n; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${n}`);
      await page.getByTestId('deck-keep').tap();
    }
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    type S = { endedAt?: number; exerciseIds: string[]; targets: Record<string, { sets: number; restSec: number; pair?: { group: number; size: number } }> };
    const s = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    const first = s.exerciseIds[0]!;
    const t0 = s.targets[first]!;
    console.log('R2-4 first member', first, JSON.stringify(t0), 'second', s.exerciseIds[1], JSON.stringify(s.targets[s.exerciseIds[1]!]));
    expect(t0.pair?.size).toBeGreaterThanOrEqual(2);
    await seedLoads(page, s.exerciseIds);
    await page.getByTestId('check-current').tap();
    await page.waitForTimeout(700);
    const afterFirst = await page.getByTestId('rest-timer').count();
    console.log('R2-4 rest timer after first member:', afterFirst);
    await shot(page, 'r2-pump-after-first-member');
    // 3.5b round 4 (M7, M8): the next member is a button under the table, never over a row.
    await shotOn(page, '3.5b/round4', 'pair-after-first-member', ['iPhone 15', 'iPhone SE']);
    const next = (await page.getByTestId('group-next').boundingBox())!;
    const rowsBottom = await page.locator('[aria-label="Sets"] > li').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
    expect(next.y).toBeGreaterThanOrEqual(rowsBottom - 1);
    expect(afterFirst).toBe(0);
    // the partner is one tap away on the chip: open it, and log it.
    // 3.5b round 4 (M7): the partner is the "Next in the pair: X" button under the set table (was a pill).
    await page.getByTestId('group-next').tap();
    await expect(page.getByTestId(`exercise-${s.exerciseIds[1]}`)).toBeVisible();
    console.log('R2-4 now on', s.exerciseIds[1]);
    await page.getByTestId('check-current').tap();
    await page.waitForTimeout(700);
    const afterSecond = await page.getByTestId('rest-timer').count();
    const clock = afterSecond ? await page.getByTestId('rest-clock').innerText() : '';
    console.log('R2-4 rest timer after second member:', afterSecond, clock, 'group rest', t0.restSec);
    await shot(page, 'r2-pump-after-second-member');
    expect(afterSecond).toBe(1);
    expect(errors).toEqual([]);
  });

  test('R2-4b curated Classic 5 Day Split day 2 pair: rest after every set', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await usePlanSeed(page);
    await page.goto('./');
    await expect(page.getByTestId('day-card-title')).toBeVisible();
    console.log('R2-4b today', await page.getByTestId('day-card-title').innerText());
    await page.getByRole('button', { name: 'Start', exact: true }).tap();
    await expect(page.getByTestId('workout-title')).toBeVisible();
    const pairs = await page.getByTestId('pair-group').count();
    console.log('R2-4b pair groups on curated day list', pairs);
    await shot(page, 'r2-curated-daylist');
    if (pairs) {
      const ids = (await dbAll<{ endedAt?: number; exerciseIds: string[] }>(page, 'sessions')).find((x) => x.endedAt === undefined)!.exerciseIds;
      await seedLoads(page, ids);
      await page.getByTestId('pair-group').first().locator('[data-testid^="row-"]').first().tap();
      await expect(page.getByTestId('check-current')).toBeVisible();
      await page.getByTestId('check-current').tap();
      await page.waitForTimeout(700);
      const t = await page.getByTestId('rest-timer').count();
      console.log('R2-4b rest timer after first member of curated pair:', t);
      expect(t).toBe(1);
    }
    expect(errors).toEqual([]);
  });

  test('R2-5 short reason lines on hotel and dumbbell cards', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [gn, eq] of [['hotel', HOTEL], ['dumbbell', ['dumbbells', 'adjustable_bench']]] as const) {
      await pastIntake(page, eq as string[]);
      await open(page, 30);
      for (const m of CHIPS) {
        await page.getByTestId(`min-${m}`).tap();
        await page.waitForTimeout(250);
        for (const c of await page.locator('[data-concept]').all()) {
          const meta = (await c.getByTestId('concept-meta').textContent())!;
          const short = await c.getByTestId('concept-short').allTextContents();
          const under = m - minOf(meta);
          console.log(`R2-5 ${gn} ${m} ${await c.getAttribute('data-concept')} ${meta} under=${under} short=${JSON.stringify(short)}`);
          if (under > 2) expect(short).toHaveLength(1);
          else expect(short).toHaveLength(0);
        }
        if (m === 60) await shot(page, `r2-short-${gn}-60`);
      }
    }
    expect(errors).toEqual([]);
  });

  test('R2-6 fresh why line from a seeded history', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await seedHistory(page);
    await page.reload();
    await open(page, 45);
    const cs = await read(page);
    const f = cs.find((c) => c.id === 'fresh');
    console.log('R2-6 fresh', f?.why, f?.meta);
    expect(f).toBeDefined();
    await shot(page, 'r2-fresh-45');
    expect(errors).toEqual([]);
  });

  test('R2-3 heavy lifts: strength card and plan legs day, no group, long rest in the started workout', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    await open(page, 60);
    const strength = page.locator('[data-concept="strength"]');
    await expect(strength).toBeVisible();
    const meta = (await strength.getByTestId('concept-meta').textContent())!;
    const n = countOf(meta);
    await strength.tap();
    for (let k = 0; k < n; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${n}`);
      await page.getByTestId('deck-keep').tap();
    }
    const lines = await page.getByTestId('ready-list').locator('li').allTextContents();
    console.log('R2-3 READY', lines.join(' || '));
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    type S = { endedAt?: number; exerciseIds: string[]; targets: Record<string, { sets: number; restSec: number; pair?: unknown }> };
    const s = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    console.log('R2-3 TARGETS', JSON.stringify(Object.entries(s.targets).map(([id, t]) => [id, t.sets, t.restSec, !!t.pair])));
    for (const t of Object.values(s.targets)) expect(t.pair).toBeUndefined();
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    await expect(page.getByTestId('pair-group')).toHaveCount(0);
    console.log('R2-3 DAYLIST', (await page.locator('[data-testid^="row-"]').allInnerTexts()).map((r) => r.replace(/\n+/g, ' / ')).join(' || '));
    await shot(page, 'r2-strength-daylist-60');
    expect(errors).toEqual([]);
  });
});


// ---- Round 4 recheck (tester) ----
const R4 = 'reports/shots/3.5b-verify/round4';
type PatEntry = { id: string; requires?: string[][] | null; planId?: string };
const PATS = JSON.parse(readFileSync('data/patterns.json', 'utf8')) as { patterns: Record<string, { candidates: PatEntry[] }> };
const CATNAME = new Map((JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { exercises: { id: string; name: string }[] }).exercises.map((e) => [e.id, e.name]));
const PLANNAME = new Map((JSON.parse(readFileSync('data/plan-exercises.json', 'utf8')) as { id: string; name: string }[]).map((e) => [e.id, e.name]));
const PLANPAT = (JSON.parse(readFileSync('data/patterns.json', 'utf8')) as { planExercises: Record<string, { pattern: string | null; requires: string[][] | null }> }).planExercises;
/** Everything the data knows about an exercise name: its patterns and gear alternatives. */
function lookup(name: string) {
  const out: { pattern: string; requires: string[][] | null | undefined }[] = [];
  for (const [pat, v] of Object.entries(PATS.patterns))
    for (const c of v.candidates) {
      const n = c.planId && PLANNAME.get(c.planId) ? PLANNAME.get(c.planId) : CATNAME.get(c.id);
      if (n === name || CATNAME.get(c.id) === name) out.push({ pattern: pat, requires: c.requires });
    }
  for (const [pid, v] of Object.entries(PLANPAT)) if (PLANNAME.get(pid) === name) out.push({ pattern: v.pattern ?? '-', requires: v.requires });
  return out;
}
const gearOk = (req: string[][] | null | undefined, eq: string[]) => !req || req.length === 0 || req.every((g) => g.some((id) => eq.includes(id)));
const ALL_GEAR = ['barbell_rack', 'dumbbells', 'adjustable_bench', 'cable_station', 'leg_press', 'smith_machine', 'pull_up_bar', 'dip_station', 'treadmill', 'bike'];

type Inspected = { id: string; title: string; chip: string; meta: string; short: string; names: string[]; demo: boolean[]; ready: string[] };
async function inspectAll(page: Page, m: number): Promise<Inspected[]> {
  if (!(await page.getByTestId(`min-${m}`).count())) await open(page, m);
  await page.getByTestId(`min-${m}`).tap();
  await expect(page.getByTestId(`min-${m}`)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(250);
  return inspectAllNoOpen(page);
}
const fmt = (label: string, m: number, xs: Inspected[]) =>
  xs.map((x) => `${label} ${m}min | ${x.id} "${x.title}" ${x.meta} short=${JSON.stringify(x.short)} :: ${x.ready.join(' ; ')} :: demo=${x.demo.map((d) => (d ? 1 : 0)).join('')}`).join('\n');

test.describe('verify 3.5b round 4', () => {
  test('C1 hotel, no history: cards, lists, demos, gear, reason line, more ideas, 30/45/60', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await pastIntake(page, HOTEL);
    for (const m of [30, 45, 60]) {
      const xs = await inspectAll(page, m);
      console.log(fmt('C1 hotel', m, xs));
      await open(page, m);
      console.log(`C1 hotel ${m} more-ideas count`, await page.getByTestId('more-ideas').count(), 'fewer:', await page.getByTestId('quick-fewer').allTextContents(), 'main:', (await page.locator('main').innerText()).replace(/\n+/g, ' / ').slice(0, 600));
      await shotOn(page, '3.5b-verify/round4', `hotel-${m}`, ['iPhone 15', 'iPhone SE']);
      for (const x of xs) {
        expect(x.demo.every(Boolean), `${m} ${x.id} demos`).toBe(true);
        for (const nm of x.names) {
          const hits = lookup(nm);
          expect(hits.length, `${m} ${x.id} unresolved ${nm}`).toBeGreaterThan(0);
          expect(hits.some((h) => gearOk(h.requires, HOTEL)), `${m} ${x.id} gear for ${nm}`).toBe(true);
        }
        const under = m - minOf(x.meta);
        if (under > 2) expect.soft(x.short, `${m} ${x.id} should have reason`).not.toBe('');
        else expect.soft(x.short, `${m} ${x.id} should not have reason`).toBe('');
      }
    }
    expect(errors).toEqual([]);
  });

  for (const [joint, bad] of [
    ['knees', /leg press|leg extension|squat|lunge|step-up|jump|split/i],
    ['lower_back', /good morning|deadlift|hyperextension|back extension|bent.over|stiff|romanian|swing/i],
    ['shoulders', /overhead press|military|shoulder press|arnold|push press|upright|behind/i],
  ] as const) {
    test(`C2 beginner, ${joint} Go easy on, full gym: every card at 15/30/60 and after More ideas swaps`, async ({ page }) => {
      test.setTimeout(420_000);
      const errors = watchErrors(page);
      await pastIntake(page);
      await dbPut(page, { profile: [{ ...PROFILE, intake: { ...PROFILE.intake, experience: 'new', easyOn: [joint] } }] });
      await page.reload();
      const seen: Inspected[] = [];
      for (const m of [15, 30, 60]) {
        const xs = await inspectAll(page, m);
        console.log(fmt(`C2 ${joint}`, m, xs));
        seen.push(...xs);
        const ids = xs.map((x) => x.id);
        expect(ids, `${m} strength offered`).not.toContain('strength');
        if (m === 30) {
          const pos = ids.indexOf('easy');
          console.log(`C2 ${joint} easy position`, pos, ids.join(','));
          expect(pos === 0 || (pos === 1 && ids[0] === 'plan'), `easy first ${ids}`).toBe(true);
        }
      }
      // More ideas swaps at 30: take every idea offered, one after another
      await page.getByTestId('min-30').tap();
      await page.waitForTimeout(250);
      for (let i = 0; i < 4; i++) {
        const keys = await page.getByTestId('more-ideas').locator('button').evaluateAll((b) => b.map((x) => x.getAttribute('data-testid')!));
        console.log(`C2 ${joint} more chips`, keys.join(','));
        expect(keys.join()).not.toContain('more-strength');
        if (!keys.length) break;
        await page.getByTestId(keys[0]!).tap();
        await page.waitForTimeout(250);
        const xs = await inspectAllNoOpen(page);
        console.log(fmt(`C2 ${joint} after ${keys[0]}`, 30, xs));
        seen.push(...xs);
      }
      const hits = seen.flatMap((x) => x.names.filter((n) => bad.test(n)).map((n) => `${x.id}:${n}`));
      console.log(`C2 ${joint} flagged`, JSON.stringify([...new Set(hits)]));
      expect(hits).toEqual([]);
      await shotOn(page, '3.5b-verify/round4', `beginner-${joint}-30`, ['iPhone 15']);
      expect(errors).toEqual([]);
    });
  }

  test('C3 full gym experienced, no history: circuit legs and compound opener, strength 60, pump pairs', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    await dbPut(page, { profile: [{ ...PROFILE, intake: { ...PROFILE.intake, experience: '3y' } }] });
    await page.reload();
    const out: Record<number, Inspected[]> = {};
    for (const m of [15, 30, 45, 60]) {
      out[m] = await inspectAll(page, m);
      console.log(fmt('C3 full', m, out[m]!));
    }
    for (const m of [15, 30, 45, 60]) {
      const ci = out[m]!.find((x) => x.id === 'circuit');
      if (ci) {
        const pats = ci.names.map((n) => lookup(n).map((h) => h.pattern));
        console.log(`C3 circuit ${m} patterns`, JSON.stringify(ci.names.map((n, i) => [n, pats[i]])));
        expect(pats.some((p) => p.some((x) => ['squat', 'hinge', 'lunge', 'glutes'].includes(x))), `circuit ${m} leg`).toBe(true);
      }
      const pu = out[m]!.find((x) => x.id === 'pump');
      if (pu) {
        const calves = pu.names.filter((n) => lookup(n).some((h) => h.pattern === 'calves'));
        expect(calves.length, `pump ${m} calves ${calves}`).toBeLessThanOrEqual(1);
      }
    }
    const st = out[60]!.find((x) => x.id === 'strength')!;
    console.log('C3 strength 60', st.meta, st.names.length, 'short=', st.short);
    expect(st.names.length).toBeGreaterThanOrEqual(4);
    expect(st.names.length).toBeLessThanOrEqual(5);
    expect(st.short).toBe('');
    // pump why lines (muscle naming) on the deck, 30
    await page.getByTestId('min-30').tap();
    await page.waitForTimeout(250);
    const pumpN = countOf((await page.locator('[data-concept="pump"]').getByTestId('concept-meta').textContent())!);
    await page.locator('[data-concept="pump"]').tap();
    const whys: string[] = [];
    for (let k = 0; k < pumpN; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${pumpN}`);
      whys.push(`${await page.getByTestId('deck-name').textContent()} => ${await card(page).locator('p').last().textContent()}`);
      await page.getByTestId('deck-keep').tap();
      await page.waitForTimeout(80);
    }
    console.log('C3 pump deck whys', JSON.stringify(whys));
    await shotOn(page, '3.5b-verify/round4', 'full-experienced-30', ['iPhone 15']);
    expect(errors).toEqual([]);
  });
});

async function inspectAllNoOpen(page: Page): Promise<Inspected[]> {
  const cs = await read(page);
  const out: Inspected[] = [];
  const url = page.url();
  for (const c0 of cs) {
    const loc = page.locator(`[data-concept="${c0.id}"]`);
    if (!(await loc.count())) {
      console.log('INSPECT card gone after back:', c0.id);
      continue;
    }
    const c = (await read(page)).find((x) => x.id === c0.id)!;
    const short = (await loc.getByTestId('concept-short').allTextContents()).join('|');
    const n = countOf(c.meta);
    await loc.tap();
    const names: string[] = [];
    const demo: boolean[] = [];
    for (let k = 0; k < n; k++) {
      await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${n}`);
      names.push((await page.getByTestId('deck-name').textContent())!);
      demo.push((await card(page).locator('[data-demo]').count()) > 0);
      await page.getByTestId('deck-keep').tap();
    }
    await expect(page.getByTestId('ready-list').locator('li').first()).toBeVisible();
    const ready = await page.getByTestId('ready-list').locator('li').allTextContents();
    out.push({ id: c.id, title: c.title, chip: c.chip, meta: c.meta, short, names, demo, ready: ready.map((r) => r.replace(/\s+/g, ' ')) });
    // back to the same list: the shown set is kept by the app after the swap, so reopen the deck route
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
  }
  void url;
  return out;
}


const dbClear = (page: Page, stores: string[]) =>
  page.evaluate(
    (names) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const have = names.filter((n) => db.objectStoreNames.contains(n));
          const tx = db.transaction(have, 'readwrite');
          for (const n of have) tx.objectStore(n).clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    stores,
  );

async function startPump(page: Page, m = 30) {
  await open(page, m);
  const pump = page.locator('[data-concept="pump"]');
  const meta = (await pump.getByTestId('concept-meta').textContent())!;
  const n = countOf(meta);
  await pump.tap();
  const names: string[] = [];
  for (let k = 0; k < n; k++) {
    await expect(card(page).locator('p').first()).toContainText(`${k + 1} of ${n}`);
    names.push((await page.getByTestId('deck-name').textContent())!);
    await page.getByTestId('deck-keep').tap();
  }
  return { n, names, meta };
}

test.describe('verify 3.5b round 4 part 2', () => {
  test('C4 vocabulary: pairs and rounds, no superset; meta line keeps ~T min on one line @matrix', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    const seenWords: string[] = [];
    for (const m of [15, 30, 45, 60]) {
      await open(page, m);
      const txt = await page.locator('main').innerText();
      const hits = txt.match(/.{0,30}super.?set.{0,20}/gi) ?? [];
      const pairs = txt.match(/\b\d+ pairs?\b/gi) ?? [];
      const rounds = txt.match(/\b\d+ rounds?\b/gi) ?? [];
      console.log(`C4 list ${m}: superset-hits=${JSON.stringify(hits)} pairs=${JSON.stringify(pairs)} rounds=${JSON.stringify(rounds)} titles=${JSON.stringify(await page.getByTestId('concept-title').allTextContents())}`);
      seenWords.push(...hits);
      // ~T min on one line
      const bad = await page.locator('[data-testid="concept-meta"]').evaluateAll((els) =>
        els.flatMap((e) => Array.from(e.children).map((c) => ({ t: c.textContent!, lines: Math.round(c.getClientRects().length), h: c.getBoundingClientRect().height })).filter((p) => /min/.test(p.t) && (p.lines > 1 || p.h > 26))),
      );
      console.log(`C4 ${m} min-part wraps`, JSON.stringify(bad));
      expect(bad).toEqual([]);
      if (m === 15 || m === 30) await shotOn(page, '3.5b-verify/round4', `vocab-list-${m}`, ['iPhone 15', 'iPhone SE']);
    }
    // deck + ready + day list
    const { names } = await startPump(page, 30);
    const ready = await page.getByTestId('ready-list').innerText();
    console.log('C4 ready list text', JSON.stringify(ready.replace(/\s+/g, ' ')), 'curate', await page.getByTestId('curate-meta').allTextContents().catch(() => []));
    console.log('C4 ready body', JSON.stringify((await page.locator('main').innerText()).replace(/\s+/g, ' ')));
    seenWords.push(...((await page.locator('main').innerText()).match(/super.?set/gi) ?? []));
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    await expect(page.getByTestId('pair-group').first()).toBeVisible();
    const day = await page.locator('main').innerText();
    console.log('C4 daylist', JSON.stringify(day.replace(/\s+/g, ' ')), 'pair-group', JSON.stringify(await page.getByTestId('pair-group').allInnerTexts()));
    seenWords.push(...(day.match(/super.?set/gi) ?? []));
    await shotOn(page, '3.5b-verify/round4', 'vocab-daylist', ['iPhone 15', 'iPhone SE']);
    console.log('C4 superset words seen:', JSON.stringify(seenWords), 'names', names.length);
    expect.soft(seenWords, 'the word superset shows somewhere').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('C5 inside a started pair: no per row rest text, one header, only Next button highlighted, below rows', async ({ page }) => {
    test.setTimeout(150_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    const { n } = await startPump(page, 30);
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    type S = { endedAt?: number; exerciseIds: string[]; targets: Record<string, { sets: number; restSec: number; pair?: { group: number; size: number } }> };
    const sess = (await dbAll<S>(page, 'sessions')).find((x) => x.endedAt === undefined)!;
    const first = sess.exerciseIds[0]!;
    console.log('C5 targets', JSON.stringify(sess.targets[first]), 'n', n);
    await seedLoads(page, sess.exerciseIds);
    const view = page.getByTestId(`exercise-${first}`);
    await expect(view).toBeVisible();
    const before = (await view.innerText()).replace(/\n+/g, ' / ');
    console.log('C5 view text before logging:', before);
    const rest = before.match(/[^/]*\brest\b[^/]*/gi) ?? [];
    console.log('C5 rest mentions in the exercise view', JSON.stringify(rest));
    const rows = page.locator('[aria-label="Sets"] > li');
    console.log('C5 rows', await rows.count(), 'row texts', JSON.stringify((await rows.allInnerTexts()).map((r) => r.replace(/\n+/g, ' '))));
    const rowRest = await rows.evaluateAll((els) => els.filter((e) => /rest|\d+\s*s\b|\d:\d\d/i.test(e.textContent ?? '')).map((e) => e.textContent));
    console.log('C5 rows that mention rest', JSON.stringify(rowRest));
    expect(rowRest).toEqual([]);
    expect(rest.length, `rest header lines ${JSON.stringify(rest)}`).toBeLessThanOrEqual(1);
    // highlight: which elements look "current/primary"
    const hi = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll('[data-current], [data-active], [aria-current], [data-primary]'))) out.push(`${el.tagName}[${el.getAttributeNames().filter((a) => a.startsWith('data-') || a.startsWith('aria-')).join(',')}] ${(el.textContent ?? '').slice(0, 30)}`);
      return out;
    });
    console.log('C5 highlighted-ish elements', JSON.stringify(hi));
    await page.getByTestId('check-current').tap();
    await page.waitForTimeout(700);
    await shotOn(page, '3.5b-verify/round4', 'c5-after-first-member', ['iPhone 15', 'iPhone SE']);
    expect(await page.getByTestId('rest-timer').count(), 'no rest after the first member').toBe(0);
    const next = page.getByTestId('group-next');
    await expect(next).toBeVisible();
    const nb = (await next.boundingBox())!;
    const lastRow = await rows.evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
    const vh = page.viewportSize()!.height;
    console.log(`C5 next button y=${nb.y} h=${nb.height} bottom=${nb.y + nb.height} rowsBottom=${lastRow} vh=${vh} tabbar`, await page.locator('nav').count());
    console.log('C5 view text after first member:', (await page.getByTestId(`exercise-${first}`).innerText()).replace(/\n+/g, ' / ').slice(0, 400));
    expect(nb.y).toBeGreaterThanOrEqual(lastRow - 1);
    expect(nb.height).toBeGreaterThanOrEqual(47.5);
    // no row overlap: every row's box is above the button
    // rows highlighted: capture the computed background of rows vs the button
    const style = await page.evaluate(() => {
      const bg = (el: Element | null) => (el ? getComputedStyle(el).backgroundColor + '|' + getComputedStyle(el).borderColor + '|' + getComputedStyle(el).boxShadow : null);
      const rs = Array.from(document.querySelectorAll('[aria-label="Sets"] > li')).map(bg);
      return { rows: rs, next: bg(document.querySelector('[data-testid="group-next"]')) };
    });
    console.log('C5 styles', JSON.stringify(style));
    await next.tap();
    await expect(page.getByTestId(`exercise-${sess.exerciseIds[1]}`)).toBeVisible();
    await page.getByTestId('check-current').tap();
    await page.waitForTimeout(700);
    expect(await page.getByTestId('rest-timer').count(), 'rest starts after the second member').toBe(1);
    await shotOn(page, '3.5b-verify/round4', 'c5-after-second-member', ['iPhone 15', 'iPhone SE']);
    console.log('C5 rest clock after second member', await page.getByTestId('rest-clock').innerText(), 'second view text', (await page.getByTestId(`exercise-${sess.exerciseIds[1]}`).innerText()).replace(/\n+/g, ' / ').slice(0, 300));
    await page.getByRole('button', { name: /Back to the list|Back/ }).first().tap();
    await expect(page.getByTestId('pair-group').first()).toBeVisible();
    console.log('C5 daylist pair headers', JSON.stringify((await page.getByTestId('pair-group').allInnerTexts()).map((t) => t.split('\n').filter(Boolean).slice(0, 2).join(' | '))), 'targets rest', JSON.stringify(Object.values(sess.targets).map((t) => t.restSec)));
    await shotOn(page, '3.5b-verify/round4', 'c5-daylist', ['iPhone 15', 'iPhone SE']);
    expect(errors).toEqual([]);
  });

  test('C6 minute chips at 130% do not clip @matrix', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await open(page, 30);
    for (const pct of ['100%', '130%']) {
      await page.evaluate((p) => (document.documentElement.style.fontSize = p), pct);
      await page.waitForTimeout(300);
      const info = await page.locator('[data-testid^="min-"]').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { id: e.getAttribute('data-testid'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), clipW: e.scrollWidth > e.clientWidth + 1, clipH: e.scrollHeight > e.clientHeight + 1, text: e.textContent, right: Math.round(r.right) };
        }),
      );
      const vw = page.viewportSize()!.width;
      console.log(`C6 ${test.info().project.name} ${pct} vw=${vw}`, JSON.stringify(info));
      for (const c of info) {
        expect(c.clipW, `${c.id} clipped wide`).toBe(false);
        expect(c.clipH, `${c.id} clipped tall`).toBe(false);
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.right).toBeLessThanOrEqual(vw);
        expect(c.h).toBeGreaterThanOrEqual(47.5);
      }
      for (let i = 0; i < info.length; i++)
        for (let j = i + 1; j < info.length; j++) {
          const a = info[i]!, b = info[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shotOn(page, '3.5b-verify/round4', `chips-${pct}`, ['iPhone SE', 'Galaxy compact', 'iPhone 15']);
    }
    expect(errors).toEqual([]);
  });

  test('C7 start from a deck writes one session; reload during Start leaves a whole workout or none', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    type S = { id: string; endedAt?: number; exerciseIds: string[]; targets: Record<string, { sets: number }> };
    const results: string[] = [];
    // double tap Start: exactly one session
    let { n } = await startPump(page, 30);
    const start = page.getByTestId('quick-start');
    await start.dblclick().catch(() => start.tap({ clickCount: 2 } as never));
    await page.waitForTimeout(1200);
    let ss = await dbAll<S>(page, 'sessions');
    console.log('C7 after double tap sessions', ss.length, ss.map((x) => x.exerciseIds.length));
    expect(ss.length).toBe(1);
    expect(ss[0]!.exerciseIds).toHaveLength(n);
    for (const delay of [0, 0, 5, 15, 40, 90, 200]) {
      await dbClear(page, ['sessions', 'sets']);
      await page.goto('./');
      ({ n } = await startPump(page, 30));
      await page.getByTestId('quick-start').tap({ noWaitAfter: true });
      if (delay) await page.waitForTimeout(delay);
      await page.reload();
      await page.waitForTimeout(1500);
      ss = await dbAll<S>(page, 'sessions');
      const sets = await dbAll<{ sessionId: string }>(page, 'sets');
      const whole = ss.length === 1 && ss[0]!.exerciseIds.length === n && ss[0]!.exerciseIds.every((id) => (ss[0]!.targets[id]?.sets ?? 0) > 0);
      const r = `delay=${delay} sessions=${ss.length} ex=${ss.map((x) => x.exerciseIds.length).join(',')} sets=${sets.length} whole=${whole} url=${page.url().split('#')[1]}`;
      results.push(r);
      console.log('C7', r);
      expect(ss.length === 0 || whole, r).toBe(true);
      expect(ss.length, r).toBeLessThanOrEqual(1);
      // never stuck: the app answers
      await expect(page.locator('main')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
