// PLAN 3.6f, counted independently: this file reads the PLAN text, not the focus module. It maps
// each focus option to the reviewed primary muscles itself, counts the sets of the built plan, and
// compares with the same intake built without focus picks.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { musclesForCatalog, musclesForPlan } from '../../data/muscles';
import { profileFor } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { equipmentPreset } from '../../db/gyms';
import { focusFit } from '../intake/focusFit';
import { FOCUS_PARTS, FOCUS_PICKS, type ExperienceId, type FocusPickId, type GoalId } from '../intake/options';
import type { GeneratorInput } from '../generator';
import { easyOnAvoids, isCompound, type Muscle } from '../order';
import { estimateDayMinutes, type Plan } from '../plans';
import { requiresOf, supports } from '../swap';

type T = { muscle: string; label: string };
const named = (l: string) => (t: T) => t.label.toLowerCase() === l;
const mus = (...m: string[]) => (t: T) => m.includes(t.muscle);
/** Each option, as the PLAN names it, against the reviewed primary muscles. */
const SRC: Record<string, (t: T) => boolean> = {
  chest: mus('chest'), upper_chest: named('upper chest'), back: mus('lats', 'middle back', 'lower back'), lats: mus('lats'), upper_back: mus('middle back'), lower_back: mus('lower back'),
  shoulders: (t) => t.label.toLowerCase().endsWith('delts'), front_delts: named('front delts'), side_delts: named('side delts'), rear_delts: named('rear delts'),
  arms: mus('biceps', 'triceps', 'forearms'), biceps: mus('biceps'), triceps: mus('triceps'), forearms: mus('forearms'), grip: mus('forearms'),
  core: mus('abdominals', 'obliques'), abs: mus('abdominals'), obliques: mus('obliques'), glutes: mus('glutes'),
  legs: mus('quadriceps', 'hamstrings', 'calves'), quads: mus('quadriceps'), hamstrings: mus('hamstrings'), calves: mus('calves'),
  posture: (t) => t.muscle === 'middle back' || t.label.toLowerCase() === 'rear delts',
};
/** The single muscles under an option: the 20 set limit is per muscle, never per area. */
const partsOf = (p: FocusPickId): string[] => (p === 'posture' ? ['upper_back', 'rear_delts'] : p === 'grip' ? ['forearms'] : p === 'glutes' ? ['glutes'] : p === 'chest' ? ['chest'] : (FOCUS_PARTS as Record<string, readonly { id: string }[]>)[p]?.map((x) => x.id) ?? [p]);
/** The order rule's own muscle words (SPEC 22), for "focused moves go earlier". */
const ORDER: Record<string, Muscle[]> = {
  chest: ['chest'], upper_chest: ['chest'], back: ['back'], lats: ['back'], upper_back: ['back'], lower_back: ['lower back'], shoulders: ['front delts', 'side delts', 'rear delts'], front_delts: ['front delts'], side_delts: ['side delts'], rear_delts: ['rear delts'],
  arms: ['biceps', 'triceps', 'forearms'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearms'], grip: ['forearms'], core: ['abs'], abs: ['abs'], glutes: ['glutes'], legs: ['quads', 'hamstrings', 'calves'], quads: ['quads'], hamstrings: ['hamstrings'], calves: ['calves'], posture: ['back', 'rear delts'],
};
const primary = (id: string): T[] => (profileFor(id).role === 'lift' ? ((musclesForPlan(id) ?? musclesForCatalog(id))?.primary ?? []) : []);
type Move = { id: string; sets: number; prim: T[] };
const movesOf = (plan: Plan): Move[][] => plan.days.map((d) => d.blocks.filter((b) => !b.warmup).flatMap((b) => b.items.map((it) => ({ id: it.exerciseId, sets: b.sets!, prim: primary(it.exerciseId) }))));
const setsFor = (ms: Move[][], on: (t: T) => boolean) => ms.flat().reduce((n, m) => n + (m.prim.some(on) ? m.sets : 0), 0);
const footprint = (plan: Plan) => plan.days.map((d) => new Set(d.blocks.filter((b) => !b.warmup).flatMap((b) => b.items).flatMap((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' ? p.targets : []; })));
const exps: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
const goals: GoalId[] = ['muscle', 'strength', 'health', 'fat_loss', 'comeback'];
const ALL = [...new Set(FOCUS_PICKS.map((p) => p.id))].filter((p) => p !== 'balance') as FocusPickId[];
const childOf = (a: FocusPickId, b: FocusPickId) => a !== b && ((FOCUS_PARTS as Record<string, readonly { id: string }[]>)[a]?.some((x) => x.id === b) ?? false);
const build = (input: GeneratorInput) => { const r = generate(input); return r.ok ? { r, plan: definitionPlan(r.plan)! } : null; };

export const tally = { n: 0, built: 0, withPicks: 0, needLine: 0, offered: 0, maxMuscle: 0, order: 0, noMove: new Set<string>(), byMin: {} as Record<number, number>, byDays: {} as Record<number, number>, extra: {} as Record<number, { n: number; min: number; max: number; sum: number; line: number }> };

function check(count: number, days: number, minutes: number, rep: number) {
  const seed = count * 1000 + days * 100 + minutes + rep * 7919;
  let rng = seed + 1;
  const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
  const pool = [...ALL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  // `count` picks that stand on their own: never an area together with one of its parts.
  const picks: FocusPickId[] = [];
  for (const p of pool) { if (picks.length >= count) break; if (!picks.some((q) => childOf(p, q) || childOf(q, p))) picks.push(p); }
  expect(picks.length).toBe(count);
  const gym = equipmentPreset(rep === 2 ? (seed % 2 ? 'hotel' : 'none') : 'full', 'lb');
  const input: GeneratorInput = {
    goals: [goals[seed % 5]!], experience: exps[(seed >> 2) % 5]!, days, minutes, focusPicks: picks, scheduleStyle: rep ? 'flexible' : 'fixed', gym,
    never: ['barbell-bicep-curl', 'hip-thrust', 'dumbbell-lateral-raise'], love: ['cable-tricep-pushdown', 'leg-extension'], easyOn: seed % 3 === 0 ? ['lower_back'] : seed % 3 === 1 ? ['knees'] : [],
  };
  tally.n++;
  const f = build(input), b = build({ ...input, focusPicks: [] });
  expect(!!f, 'focus picks never decide whether a plan can be built').toBe(!!b);
  if (!f || !b) return;
  tally.built++;
  const m = movesOf(f.plan), mb = movesOf(b.plan);
  const hard = picks.filter((p) => p !== 'mobility');
  const report = f.r.applied.focusReport!;
  const label = `${JSON.stringify(picks)} ${days} days ${minutes} min rep ${rep}`;

  if (!count) { expect(f.plan.days).toEqual(b.plan.days); expect(f.plan.focusReport).toBeUndefined(); return; }
  tally.withPicks++;

  // The budget, from the PLAN text: 4 each for 1 or 2, 3 each for 3 or 4, then 12 shared by rank.
  const asked = report.priorities.filter((p) => p.id !== 'mobility').map((p) => p.requested);
  expect(report.priorities.map((p) => p.id)).toEqual(picks);
  if (hard.length <= 2) expect(asked).toEqual(hard.map(() => 4));
  else if (hard.length <= 4) expect(asked).toEqual(hard.map(() => 3));
  else {
    expect(asked.slice(0, 2).every((n) => n === 3 || n === 4), label).toBe(true);
    expect(asked.slice(2).every((n) => n <= 2), label).toBe(true);
    expect(asked.slice(2).every((n, i, all) => i === 0 || n <= all[i - 1]!), 'a lower rank never gets more').toBe(true);
    expect(asked.reduce((x, y) => x + y, 0)).toBe(12);
  }
  expect(report.budget).toBe(asked.reduce((x, y) => x + y, 0));
  expect(report.spent).toBeLessThanOrEqual(report.budget);

  // Extra sets, counted on the built plans: all focused work against the same intake without picks.
  const any = (t: T) => hard.some((p) => SRC[p]!(t));
  const extra = setsFor(m, any) - setsFor(mb, any);
  expect(extra, `total extra ${label}`).toBeLessThanOrEqual(12);
  const s = (tally.extra[count] ??= { n: 0, min: 99, max: -99, sum: 0, line: 0 });
  s.n++; s.min = Math.min(s.min, extra); s.max = Math.max(s.max, extra); s.sum += extra;

  // Never above 20 hard sets a week on a focused muscle. Fewer than without picks only to respect that limit.
  for (const p of hard) for (const part of partsOf(p)) {
    const sets = setsFor(m, SRC[part]!);
    tally.maxMuscle = Math.max(tally.maxMuscle, sets);
    expect(sets, `${part} ${label}`).toBeLessThanOrEqual(20);
  }
  for (const p of report.priorities) {
    if (p.id === 'mobility') continue;
    // The number the plan shows is the number of sets in the plan.
    expect(p.total, `${p.id} ${label}`).toBe(setsFor(m, SRC[p.id]!));
    expect(p.extra).toBeLessThanOrEqual(p.requested);
  }
  for (const [i, d] of f.plan.days.entries()) for (const line of d.focusWhy ?? []) {
    const hit = report.priorities.find((p) => p.id !== 'mobility' && line.toLowerCase().includes(`${FOCUS_PICKS.find((x) => x.id === p.id)!.label.toLowerCase()}${p.id === 'posture' ? ':' : ' work:'}`));
    if (line.startsWith('Mobility')) continue;
    expect(hit, line).toBeDefined();
    expect(line).toContain(`${setsFor(m, SRC[hit!.id]!)} sets`);
    expect(m[i]!.some((x) => x.prim.some(SRC[hit!.id]!)), `${line} on a day that trains it`).toBe(true);
    expect(line.endsWith(rep ? `per ${days}-workout rotation` : 'a week')).toBe(true);
  }

  const fa = footprint(f.plan), ba = footprint(b.plan);
  const focusTargets = new Set(hard.flatMap((p) => ORDER[p] ?? []));
  for (const [i, d] of f.plan.days.entries()) {
    // Inside the session minutes, through the one time estimate.
    const mins = estimateDayMinutes(d);
    expect(mins).toBe(f.r.applied.minutes[i]);
    if (minutes < 75) expect(mins, `day ${i + 1} ${label}`).toBeLessThanOrEqual(Math.max(minutes, estimateDayMinutes(b.plan.days[i]!)));
    // The 48 hour rule: focus never makes two days in a row share a muscle that they did not share before.
    const j = (i + 1) % fa.length;
    if (j !== i && ![...ba[i]!].some((x) => ba[j]!.has(x))) expect([...fa[i]!].filter((x) => fa[j]!.has(x)), `days ${i + 1} and ${j + 1} ${label}`).toEqual([]);
    // Never want, go easy on, equipment.
    const blocks = d.blocks.filter((x) => !x.warmup);
    for (const it of blocks.flatMap((x) => x.items)) {
      expect(input.never).not.toContain(it.exerciseId);
      expect(easyOnAvoids(input.easyOn, profileFor(it.exerciseId)), it.exerciseId).toBe(false);
      expect(supports(requiresOf(SWAP_DATA, it.exerciseId)!, gym), it.exerciseId).toBe(true);
    }
    // Focused moves go earlier: once the big lifts are done, no small focused move waits behind an unfocused one.
    const info = blocks.map((x) => { const ps = x.items.map((it) => profileFor(it.exerciseId)).filter((p) => p.role === 'lift'); return { lift: ps.length > 0, big: ps.some(isCompound), tier: Math.min(...ps.map((p) => p.tier)), focused: ps.some((p) => p.targets.some((t) => focusTargets.has(t))) }; });
    const small = info.slice(info.findLastIndex((x) => x.big) + 1).filter((x) => x.lift && x.tier <= 3);
    const firstOther = small.findIndex((x) => !x.focused);
    if (firstOther >= 0 && small.slice(firstOther).some((x) => x.focused)) { tally.order++; }
  }
  // A loved move the plan had without picks is still there with them.
  const ids = (ms: Move[][]) => new Set(ms.flat().map((x) => x.id));
  for (const id of input.love!) if (ids(mb).has(id) && b.r.applied.loved.includes(id)) expect(ids(m).has(id), `${id} ${label}`).toBe(true);

  // Honest shortfall: extra work that did not fit is said, with a tap only when it really helps.
  const short = report.priorities.filter((p) => p.id !== 'mobility' && p.requested > 0 && p.extra < Math.max(1, p.requested - 1) && !p.atLimit);
  // "No sure move" is only said when the plan really has none.
  for (const p of report.priorities) if (p.noMove) { expect(setsFor(m, SRC[p.id]!), `${p.id} ${label}`).toBe(0); tally.noMove.add(p.id); }
  // "Already at 20" is only said when a muscle that pick's moves train really is at 20 (the app counts lats and upper back as one back).
  const group = (t: T) => (t.label.toLowerCase().endsWith('delts') ? t.label.toLowerCase() : t.muscle === 'lats' || t.muscle === 'middle back' ? 'back' : t.muscle);
  for (const p of report.priorities) if (p.atLimit) {
    const groups = new Set(m.flat().filter((x) => x.prim.some(SRC[p.id]!)).flatMap((x) => x.prim.map(group)));
    expect([...groups].some((g) => setsFor(m, (t) => group(t) === g) >= 20), `${p.id} at the limit ${label}`).toBe(true);
  }
  const rebuild = (a: { days?: number; minutes?: number }) => build({ ...input, days: a.days!, minutes: a.minutes! })?.r.applied.focusReport;
  const fit = focusFit({ days: days as 2, minutes: minutes as 20 }, report, rebuild);
  if (short.length) expect(fit, label).not.toBeNull();
  if (short.some((p) => !p.noMove)) { tally.needLine++; s.line++; tally.byMin[minutes] = (tally.byMin[minutes] ?? 0) + 1; tally.byDays[days] = (tally.byDays[days] ?? 0) + 1; if (fit!.days || fit!.minutes) tally.offered++; }
  if (fit) expect(fit.line.length).toBeGreaterThan(10);
}

describe('900 seeded intakes: every pick count 0 to 11, days 2 to 6, every minutes choice', () => {
  for (let count = 0; count <= 11; count++) for (const days of [2, 3, 4, 5, 6]) it(`${count} picks, ${days} days`, () => {
    for (const minutes of [20, 30, 45, 60, 75]) for (let rep = 0; rep < 3; rep++) check(count, days, minutes, rep);
  });
  it('covered the whole matrix and stayed inside the PLAN numbers', () => {
    expect(tally.n).toBe(900);
    expect(tally.built).toBeGreaterThan(750);
    expect(tally.withPicks).toBeGreaterThan(700);
    console.log(JSON.stringify({ ...tally, noMove: [...tally.noMove] }));
    expect(tally.maxMuscle).toBeLessThanOrEqual(20);
    expect(tally.order).toBe(0);
  });
});
