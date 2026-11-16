// Coach tips, the frequency check (SPEC 22 rule 7, PLAN 3.4a, 3.7b): a major muscle group with only
// one real session a week gets its own exercise added on another day of the same half. Pure.
import type { Plan, PlanBlock, PlanDay, PlanItem } from './plans';
import { itemTarget } from './plans';
import { isCompound, type Muscle } from './order';
import { FREQ_SETS, SESSION_SETS, halfOf, hardSets, insertLift, isMainLift, listWords, mapDays, totalSets, type Found, type ProfileOf } from './coachTipsRead';

const MAJOR: ReadonlyArray<{ word: string; muscles: Muscle[]; upper: boolean }> = [
  { word: 'chest', muscles: ['chest'], upper: true },
  { word: 'back', muscles: ['back'], upper: true },
  { word: 'shoulders', muscles: ['front delts', 'side delts', 'rear delts'], upper: true },
  { word: 'quads', muscles: ['quads'], upper: false },
  { word: 'hamstrings', muscles: ['hamstrings'], upper: false },
  { word: 'glutes', muscles: ['glutes'], upper: false },
];


/** PLAN 3.7b: a group's hard sets on a day, each set once (an overhead press trains front and side shoulders: 3 sets, not 6). */
function groupSets(day: PlanDay, muscles: readonly Muscle[], profile: ProfileOf): number {
  let n = 0;
  for (const b of day.blocks) {
    if (b.warmup) continue;
    for (const it of b.items) {
      const p = profile(it.exerciseId);
      if (p.role === 'lift' && p.targets.some((m) => muscles.includes(m))) n += itemTarget(b, it, 0).sets;
    }
  }
  return n;
}

/** Days between two day indexes, around the week. */
const apart = (a: number, b: number, n: number) => Math.min(Math.abs(a - b), n - Math.abs(a - b));

export function frequency(plan: Plan, profile: ProfileOf): Found | null {
  if (plan.days.length < 3) return null;
  const sets = plan.days.map((d) => hardSets(d, profile));
  const halves = plan.days.map((d) => halfOf(d, profile));
  const adds: Array<{ word: string; light: boolean; to: number; item: PlanItem; block: PlanBlock }> = [];
  const added = new Map<number, Set<string>>();
  for (const major of MAJOR) {
    const group = plan.days.map((d) => groupSets(d, major.muscles, profile));
    const trained = group.map((n, i) => (n >= SESSION_SETS ? i : -1)).filter((i) => i >= 0);
    if (trained.length !== 1) continue;
    // PLAN 3.7b: "one session a week" is said only when no other day trains the group at all (side, front and rear
    // shoulders are one group). With lighter work on another day (a side raise day next to the press day) it is
    // "one full session", the truth, and the why says what full means.
    const light = group.filter((n) => n > 0).length > 1;
    const home = trained[0]!;
    const half = major.upper ? 'upper' : 'lower';
    const options = plan.days
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => i !== home && halves[i] === half)
      .sort((a, b) => Number(apart(a.i, home, plan.days.length) <= 1) - Number(apart(b.i, home, plan.days.length) <= 1) || totalSets(sets[a.i]!) - totalSets(sets[b.i]!) || a.i - b.i);
    const target = options[0];
    if (!target) continue;
    const there = new Set([...target.d.blocks.flatMap((b) => b.items.map((it) => it.exerciseId)), ...(added.get(target.i) ?? [])]);
    // The plan's own exercise for it, from its home day: the first big lift, else the first one.
    const candidates = plan.days[home]!.blocks
      .filter((b) => isMainLift(b, profile))
      .flatMap((b) => b.items.map((item) => ({ b, item, p: profile(item.exerciseId) })))
      .filter(({ p, item }) => p.role === 'lift' && p.targets.some((m) => major.muscles.includes(m)) && !there.has(item.exerciseId));
    const pick = candidates.find((c) => isCompound(c.p)) ?? candidates[0];
    if (!pick) continue;
    adds.push({ word: major.word, light, to: target.d.n, item: pick.item, block: freqBlock(pick.b, pick.item) });
    added.set(target.i, new Set([...(added.get(target.i) ?? []), pick.item.exerciseId]));
  }
  if (!adds.length) return null;
  const words = adds.map((a) => a.word);
  const full = adds.some((a) => a.light);
  const days = [...new Set(adds.map((a) => a.to))].sort((a, b) => a - b);
  return {
    tip: {
      id: 'freq',
      title: `${listWords(words).replace(/^./, (c) => c.toUpperCase())} ${words.length === 1 && !words[0]!.endsWith('s') ? 'gets' : 'get'} one ${full ? 'full session' : 'session'} a week`,
      why: `${full ? `Muscles grow best with about two full sessions a week (${SESSION_SETS} sets or more).` : 'Muscles grow best trained about twice a week.'} ${freqAdds(adds.map((a) => itemTarget(a.block, a.block.items[0]!, 0).sets))}`,
      days,
      detail: adds.map((a) => `${a.item.name} → Day ${a.to}`),
    },
    apply: (p) => {
      let out = p;
      for (const a of adds) out = mapDays(out, [a.to], (day) => insertLift(day, a.block, profile));
      return out;
    },
  };
}

/**
 * PLAN 3.7b: what Apply adds, said exactly, from the blocks it inserts: one exercise is "it", several
 * are "each" only when all get the same sets (else each count is on the detail lines alone).
 */
export function freqAdds(sets: readonly number[]): string {
  const n = sets[0]!;
  const count = `${n} ${n === 1 ? 'set' : 'sets'}`;
  if (sets.length === 1) return `Adds ${count} of it on another day, same split.`;
  return sets.every((x) => x === n) ? `Adds ${count} of each on another day, same split.` : `Adds ${sets.length} exercises on other days, same split.`;
}

/** The copy a frequency tip adds: the exercise alone, FREQ_SETS sets, the plan's reps and rest, no note. */
function freqBlock(b: PlanBlock, it: PlanItem): PlanBlock {
  const item: PlanItem = { ...it };
  delete item.note;
  if (item.weeks) item.weeks = item.weeks.map((w) => ({ ...w, sets: Math.min(w.sets, FREQ_SETS) }));
  const out: PlanBlock = { kind: 'single', items: [item], sets: FREQ_SETS };
  if (b.restSec !== undefined) out.restSec = b.restSec;
  return out;
}
