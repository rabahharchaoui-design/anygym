import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import { dbAll, dbPut, seedFinished, usePlan, watchErrors, bar185 } from './workout-helpers';
import { card, DUMBBELLS, longPress, pastIntake, PROFILE, swipe } from './helpers/quick';

// PLAN 3.5a verifier (independent of the builder's tests): reads data/*.json itself.
const patterns = JSON.parse(readFileSync('data/patterns.json', 'utf8')) as {
  patterns: Record<string, { candidates: { id: string; planId?: string; requires: string[][] }[] }>;
  planExercises: Record<string, { pattern: string | null; requires: string[][] | null }>;
};
const map = JSON.parse(readFileSync('data/exercise-map.json', 'utf8')) as { planId: string; match: string; catalogId: string | null }[];

function facts(id: string): { pattern: string | null; requires: string[][] | null } {
  const row = patterns.planExercises[id];
  if (row) return row;
  for (const [pattern, l] of Object.entries(patterns.patterns)) for (const c of l.candidates) if (c.id === id || c.planId === id) return { pattern, requires: c.requires };
  return { pattern: null, requires: null };
}
function sureDemo(id: string): boolean {
  return map.some((e) => (e.planId === id || e.catalogId === id) && (e.match === 'exact' || e.match === 'variant') && !!e.catalogId);
}
const doable = (req: string[][] | null, eq: string[]) => req !== null && req.every((g) => g.some((x) => eq.includes(x)));

type Seen = { id: string; name: string; why: string; sets: string };
const project = () => test.info().project.name.replace(/ /g, '-');
const shot = async (page: Page, name: string) => { await page.waitForTimeout(700); await page.screenshot({ path: `reports/shots/3.5a/verify/${name}-${project()}.png` }); };

async function gymEquipment(page: Page) {
  return (await dbAll<{ isActive: boolean; equipment: string[] }>(page, 'gyms')).find((g) => g.isActive)!.equipment;
}
async function walk(page: Page, keep = true, shots = false): Promise<Seen[]> {
  const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
  const out: Seen[] = [];
  for (let i = 0; i < total; i++) {
    await expect(card(page).locator('p').first()).toContainText(`${i + 1} of ${total}`);
    out.push({
      id: (await card(page).getAttribute('data-exercise'))!,
      name: (await page.getByTestId('deck-name').textContent())!,
      sets: (await page.getByTestId('deck-sets').textContent())!,
      why: (await card(page).locator('p').last().textContent())!,
    });
    if (shots) { await page.waitForTimeout(450); await card(page).screenshot({ path: `reports/shots/3.5a/verify/demo-${out[i]!.id}-${project()}.png` }); }
    if (keep) await page.getByTestId('deck-keep').tap();
  }
  return out;
}

test.describe('3.5a verify', () => {
  test('1. Today card only after intake; old picker flow kept', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.getByTestId('day-card-title').or(page.getByRole('button', { name: /Quick workout/ })).first()).toBeVisible();
    await expect(page.getByTestId('build-card')).toHaveCount(0);
    await shot(page, 'today-no-intake');
    await pastIntake(page);
    await expect(page.getByTestId('build-card')).toContainText("Got 30 min? I'll build it");
    await shot(page, 'today-intake');
    const old = page.getByRole('button', { name: /Quick workout/ });
    // Round 2 (B7): the picker first flow is the quieter "Build my own" row (SPEC 20.3's words).
    await expect(old).toContainText('Build my own');
    const b = (await old.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(48);
    await old.tap();
    await expect(page.getByRole('dialog', { name: 'Add exercise' })).toBeVisible({ timeout: 8000 });
    expect(errors).toEqual([]);
  });

  test('2. chips: nearest to intake minutes, 30 from the Today card', async ({ page }) => {
    const errors = watchErrors(page);
    for (const [mins, want] of [[10, 15], [20, 15], [25, 30], [38, 45], [52, 45], [53, 60], [90, 60], [45, 45]] as const) {
      await pastIntake(page);
      await dbPut(page, { profile: [{ ...PROFILE, intake: { ...PROFILE.intake, minutes: mins } }] });
      await page.goto('./#/quick');
      await page.reload();
      await expect(page.getByTestId(`min-${want}`), `intake ${mins}`).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[aria-pressed="true"]')).toHaveCount(1);
    }
    // No minutes in the intake: 30.
    await dbPut(page, { profile: [{ ...PROFILE, intake: { goal: 'muscle', goals: ['muscle'], experience: '1_2y' } }] });
    await page.reload();
    await expect(page.getByTestId('min-30')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid^="min-"]')).toHaveCount(4);
    await dbPut(page, { profile: [PROFILE] });
    await page.goto('./');
    await page.getByTestId('build-card').tap();
    await expect(page.getByTestId('min-30')).toHaveAttribute('aria-pressed', 'true');
    await shot(page, 'chips-from-card');
    // Odd values never break it.
    for (const v of ['0', '-5', 'abc', '99999999999', '']) {
      await page.goto(`./#/quick?min=${v}`);
      await page.reload();
      await expect(page.locator('[aria-pressed="true"]')).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });

  test('3a. full gym and dumbbell gym: every exercise sure demo + gear; images saved', async ({ page }) => {
    // Round 2: three gyms, every card of every concept: more than 30 s on the slower Android projects.
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    for (const eq of [undefined, DUMBBELLS, ['dumbbells', 'adjustable_bench', 'flat_bench', 'kettlebells']]) {
      await pastIntake(page, eq);
      const equipment = await gymEquipment(page);
      await page.goto('./#/quick?min=45');
      await page.reload();
      await expect(page.locator('[data-concept]').first()).toBeVisible();
      const n = await page.locator('[data-concept]').count();
      const tag = eq ? (eq.length === 2 ? 'db' : 'dbk') : 'full';
      await shot(page, `concepts-${tag}`);
      for (let c = 0; c < n; c++) {
        await page.locator('[data-concept]').nth(c).tap();
        const title = await page.getByRole('heading').first().textContent();
        const seen = await walk(page, true, tag === 'dbk' && project() === 'iPhone-SE');
        const pats = new Set<string>();
        for (const s of seen) {
          const f = facts(s.id);
          expect.soft(f.requires, `${tag}/${title}: ${s.id} gear known`).not.toBeNull();
          expect.soft(doable(f.requires, equipment), `${tag}/${title}: ${s.id} needs ${JSON.stringify(f.requires)} have ${equipment}`).toBe(true);
          expect.soft(sureDemo(s.id), `${tag}/${title}: ${s.id} sure demo`).toBe(true);
          pats.add(String(f.pattern));
        }
        console.log(`${tag} | ${title} | ${seen.map((s) => `${s.name} [${s.id}] ${s.sets}`).join(' ; ')}`);
        await page.getByRole('button', { name: 'Back to the workouts' }).tap();
      }
    }
    expect(errors).toEqual([]);
  });

  test('3b. plan + fresh concepts are true', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    const dayTitle = (await page.getByTestId('day-card-title').textContent())!;
    await dbPut(page, { profile: [PROFILE] });
    // Chest and triceps trained yesterday; legs trained 5 days ago (not recent).
    await seedFinished(page, { 'barbell-incline-bench-press': [{ reps: 10, load: bar185 }, { reps: 10, load: bar185 }] }, 1);
    const old = await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] }, 5);
    expect(old).toBeTruthy();
    await page.reload();
    await page.getByTestId('build-card').tap();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    const ids = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => e.getAttribute('data-concept')));
    console.log('plan day on Today:', dayTitle, '| concepts:', ids.join(','));
    expect(ids).toContain('plan');
    expect(ids).toContain('fresh');
    await shot(page, 'concepts-plan-fresh');
    const planTitle = await page.locator('[data-concept="plan"]').textContent();
    console.log('plan card:', planTitle);
    const fresh = page.locator('[data-concept="fresh"]');
    console.log('fresh card:', await fresh.textContent());
    await expect(fresh).toContainText("Hit what's fresh");
    await fresh.tap();
    await shot(page, 'deck-fresh-first');
    const seen = await walk(page);
    console.log('fresh items:', seen.map((s) => `${s.name} (${s.why})`).join(' ; '));
    for (const s of seen) {
      expect.soft(s.why, s.id).not.toMatch(/chest|triceps|front delt|shoulder/i);
      expect.soft(s.id).not.toMatch(/bench|press|fly|dip|tricep|pushdown/i);
    }
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    await page.locator('[data-concept="plan"]').tap();
    const planSeen = await walk(page, true);
    console.log('plan items:', planSeen.map((s) => `${s.name} ${s.sets}`).join(' ; '));
    for (const s of planSeen) expect.soft(sureDemo(s.id), `plan ${s.id} demo`).toBe(true);
    await shot(page, 'plan-ready');
    expect(errors).toEqual([]);
  });

  test('3c. no plan, no recent: no plan or fresh card; fewer than 3 is the empty state', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick?min=30');
    await page.reload();
    const ids = await page.locator('[data-concept]').evaluateAll((els) => els.map((e) => e.getAttribute('data-concept')));
    expect(ids).not.toContain('plan');
    expect(ids).not.toContain('fresh');
    // 1 item gym: only kettlebells
    await pastIntake(page, ['kettlebells']);
    await page.goto('./#/quick?min=30');
    await page.reload();
    await expect(page.getByTestId('quick-empty').or(page.locator('[data-concept]').first())).toBeVisible();
    console.log('kettlebell gym concepts:', await page.locator('[data-concept]').count());
    await pastIntake(page, []);
    await page.goto('./#/quick?min=30');
    await page.reload();
    await expect(page.getByTestId('quick-empty')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pick exercises myself' })).toBeVisible();
    await shot(page, 'empty');
    expect(errors).toEqual([]);
  });

  test('4. deck: swap keeps pattern, never + Undo additive, start carries sets reps rest', async ({ page }) => {
    test.setTimeout(90_000);
    const errors = watchErrors(page);
    await pastIntake(page);
    await dbPut(page, { profile: [{ ...PROFILE, dislikes: { soft: { 'pre-soft': 2 }, never: ['pre-never'] } }] });
    await seedFinished(page, { 'barbell-back-squat': [{ reps: 10, load: bar185 }] }, 9);
    const hist0 = { sets: (await dbAll(page, 'sets')).length, sessions: (await dbAll(page, 'sessions')).length };
    await page.goto('./#/quick?min=45');
    await page.reload();
    await page.locator('[data-concept]').first().tap();
    const equipment = await gymEquipment(page);
    // Buttons first.
    const a0 = (await card(page).getAttribute('data-exercise'))!;
    await page.getByTestId('deck-swap').tap();
    await expect(card(page)).not.toHaveAttribute('data-exercise', a0);
    const a1 = (await card(page).getAttribute('data-exercise'))!;
    expect.soft(facts(a1).pattern, `${a0} -> ${a1}`).toBe(facts(a0).pattern);
    // swipe left x3 on the same card: each stays in pattern, doable, sure demo
    let prev = a1;
    for (let i = 0; i < 3; i++) {
      await swipe(page, -260);
      await expect.poll(async () => card(page).getAttribute('data-exercise')).not.toBe(prev);
      const now = (await card(page).getAttribute('data-exercise'))!;
      expect.soft(facts(now).pattern, `${prev} -> ${now}`).toBe(facts(a0).pattern);
      expect.soft(doable(facts(now).requires, equipment), now).toBe(true);
      expect.soft(sureDemo(now), now).toBe(true);
      prev = now;
    }
    await shot(page, 'deck-swapped');
    const soft = async () => (await dbAll<{ id: string; dislikes?: { soft?: Record<string, number>; never?: string[] } }>(page, 'profile')).find((p) => p.id === 'me')!.dislikes!;
    await expect.poll(async () => (await soft()).soft?.[a0]).toBe(1);
    expect((await soft()).soft?.['pre-soft']).toBe(2);
    // Keep the card, then long press the next one.
    await page.getByTestId('deck-keep').tap();
    await expect(card(page).locator('p').first()).toContainText('2 of');
    await page.waitForTimeout(600);
    const victim = (await card(page).getAttribute('data-exercise'))!;
    await longPress(page);
    await expect(page.getByText("Won't show it again")).toBeVisible();
    await shot(page, 'never-toast');
    await expect.poll(async () => (await soft()).never).toEqual(expect.arrayContaining(['pre-never', victim]));
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect.poll(async () => (await soft()).never).toEqual(['pre-never']);
    expect((await soft()).soft?.['pre-soft']).toBe(2);
    // The eye button
    await page.getByTestId('deck-never').tap();
    await expect.poll(async () => (await soft()).never).toContain(victim);
    // keep through to the end
    const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
    const final: Seen[] = [];
    for (let guard = 0; guard < 20; guard++) {
      if (await page.getByRole('heading', { name: 'Ready to go' }).isVisible()) break;
      final.push({ id: (await card(page).getAttribute('data-exercise'))!, name: '', why: '', sets: (await page.getByTestId('deck-sets').textContent())! });
      // Round 2: wait for this Keep to land (the next card, or Ready to go) before the next tap, so a
      // tap never races the last card's flight on a slow phone.
      const was = await card(page).locator('p').first().textContent();
      await page.getByTestId('deck-keep').tap();
      await expect(async () => {
        if (await page.getByRole('heading', { name: 'Ready to go' }).isVisible()) return;
        expect(await card(page).locator('p').first().textContent()).not.toBe(was);
      }).toPass();
    }
    await expect(page.getByRole('heading', { name: 'Ready to go' })).toBeVisible();
    await shot(page, 'ready');
    const rows = await page.getByTestId('ready-list').locator('li').allTextContents();
    console.log('ready list:', rows.join(' | '), 'total at start', total);
    expect((await soft()).never).not.toContain('pre-never-gone');
    // Double tap Start workout: one session.
    await page.getByTestId('quick-start').dblclick();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const sessions = await dbAll<{ id: string; endedAt?: number; exerciseIds: string[]; targets: Record<string, { sets: number; reps?: unknown; restSec: number }> }>(page, 'sessions');
    const live = sessions.filter((x) => x.endedAt === undefined);
    expect(live).toHaveLength(1);
    expect(sessions.length).toBe(hist0.sessions + 1);
    expect((await dbAll(page, 'sets')).length).toBe(hist0.sets);
    const s = live[0]!;
    console.log('session targets:', JSON.stringify(s.targets));
    expect(s.exerciseIds.length).toBe(rows.length);
    expect(s.exerciseIds).not.toContain(victim);
    for (const id of s.exerciseIds) {
      expect(s.targets[id]!.sets).toBeGreaterThan(0);
      expect(s.targets[id]!.restSec).toBeGreaterThan(0);
    }
    // The first exercise view shows the deck's sets.
    const firstRows = await page.getByRole('list', { name: 'Sets' }).getByRole('listitem').count();
    expect(firstRows).toBe(s.targets[s.exerciseIds[0]!]!.sets);
    expect(rows[0]).toContain(String(s.targets[s.exerciseIds[0]!]!.sets));
    // Dislikes still intact after start.
    expect((await soft()).soft?.['pre-soft']).toBe(2);
    expect(errors).toEqual([]);
  });

  test('4b. plan concept starts the plan day and counts for the plan', async ({ page }) => {
    const errors = watchErrors(page);
    await usePlan(page);
    await dbPut(page, { profile: [PROFILE] });
    const before = await dbAll<{ id: string; nextDayIndex?: number }>(page, 'planState');
    await page.reload();
    await page.getByTestId('build-card').tap();
    await page.locator('[data-concept="plan"]').tap();
    await page.getByTestId('deck-swap').tap();
    await page.getByTestId('quick-start').tap();
    await expect(page.getByTestId('check-current')).toBeVisible();
    const s = (await dbAll<{ endedAt?: number; planId?: string; dayIndex?: number; trim?: unknown; exerciseIds: string[]; swaps?: unknown }>(page, 'sessions')).filter((x) => x.endedAt === undefined);
    expect(s).toHaveLength(1);
    console.log('plan session:', JSON.stringify(s[0]), 'planState before', JSON.stringify(before));
    expect(s[0]!.planId).toBe('five-day-split');
    // Do every set the (trimmed) day holds, then finish: it counts for the plan.
    const live = s[0] as unknown as { id: string; exerciseIds: string[]; targets: Record<string, { sets: number }> };
    const SETS: Record<string, number> = { 'barbell-back-squat': 4, 'angled-machine-leg-press': 3, 'machine-lying-leg-curl': 2, 'barbell-straight-leg-romanian-deadlift': 3 };
    const rows: unknown[] = [];
    let order = 0;
    for (const id of live.exerciseIds) for (let k = 0; k < SETS[id]!; k++) rows.push({ id: `v-${id}-${k}`, sessionId: live.id, exerciseId: id, order: order++, kind: 'work', uncertain: false, reps: 8, load: bar185 });
    await dbPut(page, { sets: rows });
    await page.reload();
    await page.getByRole('button', { name: 'Back to the list' }).tap();
    await page.getByRole('button', { name: 'Finish', exact: true }).tap();
    await expect(page.getByTestId('finish-title')).toBeVisible();
    await shot(page, 'plan-finish');
    console.log('finish:', await page.getByTestId('finish-title').textContent(), '|', await page.getByTestId('finish-next').textContent());
    const after = await dbAll<{ nextDayIndex: number; doneDays: number[]; partial?: Record<string, number> }>(page, 'planState');
    console.log('planState after', JSON.stringify(after));
    expect(after[0]!.nextDayIndex === 1 || after[0]!.doneDays.includes(0)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('5. frame timing p90 over swipe, springs and flings', async ({ page, browserName }, info) => {
    test.skip(browserName !== 'webkit' || !info.project.name.startsWith('iPhone'));
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick?min=45');
    await page.reload();
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    await page.waitForTimeout(500);
    const runs: number[] = [];
    for (let trial = 0; trial < 3; trial++) {
      await page.evaluate(() => {
        const w = window as unknown as { __f: number[]; __s: boolean };
        w.__f = [];
        w.__s = false;
        const loop = (t: number) => {
          w.__f.push(t);
          if (!w.__s) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      await swipe(page, 90, { steps: 30, slow: true, release: false });
      await page.mouse.up();
      await page.waitForTimeout(500);
      await swipe(page, trial % 2 ? 280 : -280, { steps: 30, slow: true });
      await page.waitForTimeout(600);
      const d = await page.evaluate(() => {
        const w = window as unknown as { __f: number[]; __s: boolean };
        w.__s = true;
        return w.__f.slice(1).map((t, i) => t - w.__f[i]!);
      });
      const sorted = [...d].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.9)]!;
      runs.push(p90);
      console.log(`trial ${trial}: frames ${d.length} median ${sorted[Math.floor(sorted.length / 2)]!.toFixed(1)} p90 ${p90.toFixed(1)} max ${sorted[sorted.length - 1]!.toFixed(1)}`);
    }
    for (const p of runs) expect(p).toBeLessThan(34);
    expect(errors).toEqual([]);
  });

  test('6. break it: double taps, reload mid deck, offline start, back', async ({ page, context }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick?min=45');
    await page.reload();
    await page.locator('[data-concept]').first().dblclick();
    await expect(card(page)).toBeVisible();
    const total = Number((await page.getByTestId('curate-meta').textContent())!.match(/^(\d+)/)![1]);
    await page.getByTestId('deck-keep').dblclick();
    await page.waitForTimeout(500);
    const pos = await card(page).locator('p').first().textContent();
    console.log('after double tap Keep:', pos, 'of', total);
    // reload mid deck: nothing created, back at the choose screen without stuck state
    await page.reload();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    expect((await dbAll(page, 'sessions')).filter((x) => (x as { endedAt?: number }).endedAt === undefined)).toHaveLength(0);
    // back mid action
    await page.locator('[data-concept]').first().tap();
    await page.getByTestId('deck-swap').tap();
    await page.getByRole('button', { name: 'Back to the workouts' }).tap();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    // offline start
    // Round 2: offline only once the service worker holds the app, or an offline reload has nothing to load.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
      await page.reload();
      await expect(page.locator('[data-concept]').first()).toBeVisible();
    }
    await page.locator('[data-concept]').first().tap();
    await context.setOffline(true);
    await page.getByTestId('quick-start').dblclick();
    await expect(page.getByTestId('check-current')).toBeVisible();
    expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).filter((x) => x.endedAt === undefined)).toHaveLength(1);
    // reload mid workout keeps it
    await page.reload();
    await expect(page.getByTestId('check-current')).toBeVisible();
    await context.setOffline(false);
    // go back to Today, open build card again: the active workout is not duplicated
    await page.goto('./#/quick?min=45');
    await page.reload();
    await page.locator('[data-concept]').first().tap();
    await page.getByTestId('quick-start').tap();
    await page.waitForTimeout(500);
    expect((await dbAll<{ endedAt?: number }>(page, 'sessions')).filter((x) => x.endedAt === undefined)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('7. layout: 48 pt targets, 130%, fits', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick?min=45');
    await page.reload();
    await expect(page.locator('[data-concept]').first()).toBeVisible();
    const sizes: Record<string, string> = {};
    const measure = async (label: string, sel: string) => {
      const loc = page.locator(sel);
      const n = await loc.count();
      for (let i = 0; i < n; i++) {
        const b = await loc.nth(i).boundingBox();
        if (!b) continue;
        sizes[`${label}${n > 1 ? i : ''}`] = `${Math.round(b.width)}x${Math.round(b.height)}`;
        expect.soft(b.height, `${label} height`).toBeGreaterThanOrEqual(48);
        expect.soft(b.width, `${label} width`).toBeGreaterThanOrEqual(44);
      }
    };
    await measure('chip', '[data-testid^="min-"]');
    await measure('concept', '[data-concept]');
    await measure('myself', '[data-testid="pick-myself"]');
    await measure('back', 'button[aria-label^="Back"]');
    await shot(page, 'choose');
    await page.locator('[data-concept]').first().tap();
    await measure('keep', '[data-testid="deck-keep"]');
    await measure('swap', '[data-testid="deck-swap"]');
    await measure('never', '[data-testid="deck-never"]');
    await measure('start', '[data-testid="quick-start"]');
    await shot(page, 'deck');
    console.log('target sizes', JSON.stringify(sizes));
    // 130% text (round 2: every size read first, then scaled once, the way iOS grows text; scaling
    // inside the loop compounded inherited sizes to 1.3 per level and overstated it).
    await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('body *')).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
      for (const { el, size } of els) el.style.fontSize = `${size * 1.3}px`;
    });
    await page.waitForTimeout(300);
    await shot(page, 'deck-130');
    const vh = page.viewportSize()!.height;
    for (const id of ['deck-keep', 'deck-swap', 'quick-start']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      console.log('130%', id, JSON.stringify(b), 'vh', vh, 'visible', await page.getByTestId(id).isVisible());
      expect.soft(b.y + b.height, `${id} in view at 130%`).toBeLessThanOrEqual(vh + 1);
    }
    const k = (await page.getByTestId('deck-keep').boundingBox())!;
    const st = (await page.getByTestId('quick-start').boundingBox())!;
    expect.soft(k.y + k.height <= st.y + 1, `Keep/Swap hidden behind Start as is at 130% (keep bottom ${k.y + k.height}, Start top ${st.y})`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('3.5a verify reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('5b. fades, never tilts, through drag, fling and button', async ({ page }) => {
    const errors = watchErrors(page);
    await pastIntake(page);
    await page.goto('./#/quick?min=45');
    await page.reload();
    await page.locator('[data-concept]').first().tap();
    await expect(card(page)).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { __t: string[]; __o: string[]; __s: boolean };
      w.__t = [];
      w.__o = [];
      w.__s = false;
      const loop = () => {
        const el = document.querySelector('[data-testid="deck-card"]');
        if (el) {
          const cs = getComputedStyle(el);
          w.__t.push(cs.transform);
          w.__o.push(cs.opacity);
        }
        if (!w.__s) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await swipe(page, 120, { steps: 20, slow: true, release: false });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await swipe(page, -280, { steps: 20, slow: true });
    await page.waitForTimeout(500);
    await page.getByTestId('deck-keep').tap();
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __t: string[]; __o: string[]; __s: boolean };
      w.__s = true;
      return { t: w.__t, o: w.__o };
    });
    const tilted = r.t.filter((t) => t !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(t));
    console.log('reduced: transforms sampled', r.t.length, 'tilted', tilted.length, 'min opacity', Math.min(...r.o.map(Number)));
    expect(tilted).toEqual([]);
    expect(Math.min(...r.o.map(Number))).toBeLessThan(0.9);
    expect(errors).toEqual([]);
  });
});
