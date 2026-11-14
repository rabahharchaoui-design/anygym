import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { focusFacts } from '../../data/focus';
import { profileFor } from '../../data/order';
import { equipmentPreset } from '../../db/gyms';
import { FOCUS_PICKS, type ExperienceId, type FocusPickId, type GoalId } from '../intake/options';
import { type GeneratorInput } from '../generator';
import { estimateDayMinutes } from '../plans';
import { canPair, easyOnAvoids, heaviestOf, isCompound } from '../order';
import { requiresOf, supports } from '../swap';
import { SWAP_DATA } from '../../data/patterns';
import { resolveNextDay, advanceRotation } from '../plan/schedule';
import { TIRED_MS } from '../quickWhy';
import { normalizeFocusPicks } from '../plan/focus';
import { maxSetsFor } from '../generatorRules';
import { vi as viTimeout } from 'vitest';
// PLAN 3.6u: a heavy test file (slowest test about 400 ms on a laptop; the GitHub runner is six to eight times
// slower). An explicit limit sized for the runner, never a retry.
viTimeout.setConfig({ testTimeout: 30_000 });

const atomic: FocusPickId[] = ['upper_chest', 'lats', 'upper_back', 'lower_back', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves', 'posture', 'grip', 'mobility'];
const exp: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
const full = equipmentPreset('full', 'lb');
function verify(input: GeneratorInput) {
  const result = generate(input);
  expect(generate(input)).toEqual(result);
  if (!result.ok) { expect(result.reason).toBeTruthy(); expect(result.moves).toBeLessThan(3); return; }
  const plan = definitionPlan(result.plan)!;
  expect(plan).toBeDefined();
  const report = result.applied.focusReport!;
  expect(plan.focusReport).toEqual(report.priorities.length ? report : undefined);
  expect(report.spent).toBeLessThanOrEqual(report.budget);
  expect(report.budget).toBeLessThanOrEqual(12);
  const baseline = generate({ ...input, focus: [], focusPicks: [] });
  const counts = new Map<string, number>();
  const pickCounts = new Map<string, number>();
  const focused = new Set<string>();
  const cap = maxSetsFor(input.experience, input.goals.includes('comeback'));
  for (const [index, day] of plan.days.entries()) {
    const minutes = estimateDayMinutes(day);
    expect(minutes).toBe(result.applied.minutes[index]);
    if (input.minutes! < 75 && baseline.ok && baseline.applied.minutes[index]! <= input.minutes!) expect(minutes, `focus added time to day ${index}`).toBeLessThanOrEqual(input.minutes!);
    const all = day.blocks.flatMap((b) => b.items).map((i) => profileFor(i.exerciseId));
    const heavy = heaviestOf(all);
    for (const block of day.blocks) {
      if (block.warmup) continue;
      const ps = block.items.map((i) => profileFor(i.exerciseId));
      if (block.kind === 'pair') expect(canPair(ps[0]!, ps[1]!, new Set(heavy ? [heavy.id] : []))).toBe(true);
      for (const item of block.items) {
        const p = profileFor(item.exerciseId);
        const req = requiresOf(SWAP_DATA, item.exerciseId);
        expect(req, item.exerciseId).not.toBeNull();
        expect(supports(req!, input.gym), item.exerciseId).toBe(true);
        expect(easyOnAvoids(input.easyOn, p)).toBe(false);
        expect(input.never ?? []).not.toContain(item.exerciseId);
        expect(block.sets!).toBeGreaterThan(0);
        expect(block.sets!).toBeLessThanOrEqual(cap);
        const facts = focusFacts(item.exerciseId, p);
        if (p.role !== 'lift') continue;
        for (const muscle of facts.muscles) counts.set(muscle, (counts.get(muscle) ?? 0) + block.sets!);
        for (const id of facts.picks) pickCounts.set(id, (pickCounts.get(id) ?? 0) + block.sets!);
        if (facts.picks.some((p) => input.focusPicks?.includes(p))) for (const muscle of facts.muscles) focused.add(muscle);
      }
    }
    // Helpers and small muscles are never pre-tired before a later compound needs them.
    for (const [i, p] of all.entries()) if (!isCompound(p) && p.role === 'lift') {
      for (const q of all.slice(i + 1)) if (isCompound(q)) expect(p.targets.some((m) => q.helpers.includes(m)), `${p.id} before ${q.id}`).toBe(false);
    }
  }
  // Two complete, dated rotations. If all days are blocked, wait until the first is eligible.
  const footprints = plan.days.map((d) => [...new Set(d.blocks.filter((b) => !b.warmup).flatMap((b) => b.items).flatMap((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' ? p.targets : []; }))]);
  let at = Date.UTC(2026, 0, 5, 12);
  let position = { nextDayIndex: 0, doneDays: [] as number[], pendingDayIndices: footprints.map((_, i) => i) };
  const trained: Record<string, number> = {};
  const visited: number[] = [];
  for (let n = 0; n < footprints.length * 2; n++) {
    let next = resolveNextDay({ state: position, days: footprints, trained, now: at });
    if (next.dayIndex === null) { at = next.eligibleAt!; next = resolveNextDay({ state: position, days: footprints, trained, now: at }); }
    expect(next.dayIndex).not.toBeNull();
    for (const muscle of footprints[next.dayIndex!]!) {
      if (trained[muscle] !== undefined) expect(at - trained[muscle]!).toBeGreaterThanOrEqual(TIRED_MS);
      trained[muscle] = at;
    }
    visited.push(next.dayIndex!);
    position = { ...position, ...advanceRotation({ ...position, pendingDayIndices: next.pendingDayIndices }, footprints.length, next.dayIndex!) };
    at += 24 * 60 * 60 * 1000;
  }
  for (let n = 0; n < visited.length; n += footprints.length) expect(new Set(visited.slice(n, n + footprints.length)).size).toBe(footprints.length);
  for (const muscle of focused) expect(counts.get(muscle), muscle).toBeLessThanOrEqual(20);
  // Extra means above the same intake with no picks: recounted here on the two built plans.
  const basePicks = new Map<string, number>();
  if (baseline.ok) for (const day of definitionPlan(baseline.plan)!.days) for (const block of day.blocks) if (!block.warmup) for (const item of block.items) {
    const p = profileFor(item.exerciseId);
    if (p.role === 'lift') for (const id of focusFacts(item.exerciseId, p).picks) basePicks.set(id, (basePicks.get(id) ?? 0) + block.sets!);
  }
  for (const p of report.priorities) {
    expect(p.total, p.id).toBe(pickCounts.get(p.id) ?? 0);
    if (p.id !== 'mobility') expect(p.extra, p.id).toBe(Math.max(0, p.total - (basePicks.get(p.id) ?? 0)));
    expect(p.shortfall).toBe(p.state === 'short');
  }
}

describe('600 seeded intakes, stratified over every 0–11 pick count, 2–6 days and minute choice', () => {
  for (let count = 0; count <= 11; count++) for (const days of [2, 3, 4, 5, 6]) for (const minutes of [20, 30, 45, 60, 75]) for (const limited of [false, true]) {
    const seed = count * 250 + days * 31 + minutes * 17 + Number(limited);
    let rng = seed + 1;
    const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
    const ranked = [...atomic]; // Shuffle with a seeded Fisher–Yates, independent of engine sort.
    for (let i = ranked.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [ranked[i], ranked[j]] = [ranked[j]!, ranked[i]!]; }
    const kit = limited ? equipmentPreset(seed % 2 ? 'hotel' : 'none', 'lb') : full;
    it(`seed ${seed}: ${count} picks, ${days} days, ${minutes} min, ${limited ? 'limited' : 'full'}`, () => verify({
      goals: [goals[seed % goals.length]!], experience: exp[seed % exp.length]!, days, minutes,
      focusPicks: ranked.slice(0, count), scheduleStyle: 'flexible', gym: kit,
      never: ['barbell-back-squat'], easyOn: seed % 3 === 0 ? ['lower_back'] : [],
    }));
  }
});

it('supports every stable pick, and the maximum non-overlapping selection, without false counts', () => {
  const all = [...new Set(FOCUS_PICKS.map((p) => p.id))];
  for (const id of all) verify({ goals: ['muscle'], experience: '3y', days: 4, minutes: 60, gym: full, focusPicks: [id] });
  verify({ goals: ['muscle'], experience: 'new', days: 6, minutes: 30, gym: full, focusPicks: normalizeFocusPicks(atomic) });
});
it('keeps different priority order and explanations in generated identity', () => {
  const a: GeneratorInput = { goals: ['muscle'], days: 3, minutes: 30, gym: full, focusPicks: ['lats', 'biceps', 'quads', 'abs', 'side_delts'] };
  const x = generate(a), y = generate({ ...a, focusPicks: [...a.focusPicks!].reverse() });
  expect(x.ok && y.ok && x.plan.id !== y.plan.id).toBe(true);
});
