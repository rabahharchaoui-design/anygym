// Quick workout's deck (PLAN 3.5a, 3.5b, 3.5g): the swap (same movement pattern, sure gear, sure demo),
// pairs and circuits kept whole when a card goes, and learning (a left swipe ranks lower, a long press is
// never show). Pure. Moved out of quick.ts (code organization).
import type { Dislikes, QuickItem } from './quick';
import type { GeneratorInput } from './generator';
import type { GymKit } from './picker';
import { type Muscle, type Profile, canPair, isHeavy, liftWord } from './order';
import { type SwapData, requiresOf, supports, swapCandidates, workoutIdOf } from './swap';

/** Sure gear: the requirement is known and this gym has it (the deck never shows a maybe). */
export const sureGear = (data: SwapData, id: string, gym: GymKit): boolean => {
  const r = requiresOf(data, id);
  return r !== null && supports(r, gym);
};

/**
 * PLAN 3.5b: a superset whose partners no longer suit each other after a swap (they now share a
 * muscle, or one is a heavy lift) is done as two single moves instead (rest after every set).
 */
export function safePairs(items: readonly QuickItem[], profile: (id: string) => Profile): QuickItem[] {
  const split = new Set<number>();
  const members = new Map<number, QuickItem[]>();
  for (const it of items) if (it.group !== undefined) members.set(it.group, [...(members.get(it.group) ?? []), it]);
  for (const [g, m] of members) {
    if (m.length !== 2) continue;
    const [a, b] = m.map((it) => profile(it.id));
    if (isHeavy(a!) || isHeavy(b!) || !canPair(a!, b!)) split.add(g);
  }
  if (!split.size) return [...items];
  const single = (it: QuickItem): QuickItem => {
    const out = { ...it };
    delete out.group;
    return out;
  };
  return regroup(items.map((it) => (it.group !== undefined && split.has(it.group) ? single(it) : it)));
}

/**
 * PLAN 3.5b: groups after the deck removed an exercise: a group left with one member is a single,
 * and the groups are numbered in order again. Sets never change here (a pair already has equal sets).
 */
export function regroup(items: readonly QuickItem[]): QuickItem[] {
  const size = new Map<number, number>();
  for (const it of items) if (it.group !== undefined) size.set(it.group, (size.get(it.group) ?? 0) + 1);
  const renumber = new Map<number, number>();
  return items.map((it) => {
    if (it.group === undefined) return it;
    if ((size.get(it.group) ?? 0) < 2) {
      const { group: _g, ...rest } = it;
      void _g;
      return rest;
    }
    if (!renumber.has(it.group)) renumber.set(it.group, renumber.size);
    return { ...it, group: renumber.get(it.group)! };
  });
}

/**
 * PLAN 3.5g: the card at `index` leaves the workout (Never show with nothing to swap in) and the
 * structure stays what it was: a circuit left with two moves joins the nearest other circuit of the
 * card (the next one, else the one before), taking its rounds and rest, so the Full body circuit stays
 * circuits and never turns into "1 pair". With no other circuit, the two are a pair (regroup).
 */
export function dropItem(items: readonly QuickItem[], index: number): QuickItem[] {
  const gone = items[index];
  const rest = items.filter((_, i) => i !== index);
  if (gone?.group === undefined) return regroup(rest);
  const size = (g: number) => rest.filter((it) => it.group === g).length;
  const was = items.filter((it) => it.group === gone.group).length;
  if (was < 3 || size(gone.group) !== 2) return regroup(rest);
  const circuits = [...new Set(rest.map((it) => it.group))].filter((g): g is number => g !== undefined && g !== gone.group && size(g) >= 3);
  if (!circuits.length) return regroup(rest);
  const target = circuits.find((g) => g > gone.group!) ?? circuits[circuits.length - 1]!;
  const head = rest.find((it) => it.group === target)!;
  const moved = rest.filter((it) => it.group === gone.group).map((it) => ({ ...it, group: target, sets: head.sets, restSec: head.restSec }));
  const others = rest.filter((it) => it.group !== gone.group);
  // Members of one group stay next to each other: before the group after them, or after the one before.
  const at = target > gone.group ? others.findIndex((it) => it.group === target) : others.map((it) => it.group).lastIndexOf(target) + 1;
  return regroup([...others.slice(0, at), ...moved, ...others.slice(at)]);
}


/** Fewest left swipes first; ties keep their order (the ladder's best first). */
export function rankSoft(ids: readonly string[], soft: Readonly<Record<string, number>> | undefined): string[] {
  if (!soft) return [...ids];
  return ids
    .map((id, i) => ({ id, i, n: soft[id] ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.id);
}

export type SwapContext = {
  data: SwapData;
  gym: GymKit;
  /** A sure demo and nothing that rules it out (never list, go easy on). */
  ok: (id: string) => boolean;
  soft?: Readonly<Record<string, number>>;
  /** The ordering profile (heavy lifts stay heavy, light slots stay light). */
  profile?: (id: string) => Profile;
  /** Plain names: one option under two names is offered once (round 3, B2). */
  nameOf?: (id: string) => string;
  /** 3.5d: more ids that are taken (another card of the batch). */
  avoid?: readonly string[];
};

/**
 * The exercise a left swipe puts in: same movement pattern, this gym surely has the gear, a sure
 * demo, not already in the workout, the fewest soft dislikes first, and not one this card already
 * showed while an untried one is left. null: nothing else fits (the card stays).
 */
export function nextSwap(item: QuickItem, items: readonly QuickItem[], tried: readonly string[], ctx: SwapContext): string | null {
  const mode = item.seconds !== undefined && item.reps === undefined ? 'seconds' : 'reps';
  const exclude = items.filter((x) => x !== item).map((x) => x.id);
  const pool = swapCandidates(ctx.data, item.slot, ctx.gym, { mode, exclude: [...exclude, item.id] }).map(workoutIdOf);
  // Round 2 (P15, SPEC 7.3): a slot that is not a heavy lift never turns into one, and a conventional
  // deadlift only ever stands in for a deadlift (never a Deadlift at 10 to 12 for an RDL slot).
  const p = ctx.profile;
  const slotP = p?.(item.slot);
  const tooHeavy = (id: string) => !!p && !!slotP && ((!isHeavy(slotP) && isHeavy(p(id))) || (liftWord(p(id)) === 'deadlift' && liftWord(slotP) !== 'deadlift'));
  // Round 3 (B1, B2): each option once per slot. Never the one on the card, one already swiped away
  // or rejected (the slot's own first exercise included), or the same option under another name
  // (Leg Press and Angled Machine Leg Press are one leg press). Nothing new left: null, and the card
  // says "No other option here"; a rejected card never comes back.
  const keyOf = (id: string) => (ctx.nameOf ? optionKey(ctx.nameOf(id)) : ctx.data.sameAs(id));
  const seen = new Set([item.id, item.slot, ...tried, ...exclude, ...(ctx.avoid ?? [])].flatMap((id) => [ctx.data.sameAs(id), keyOf(id)]));
  const usable = pool.filter((id) => !seen.has(ctx.data.sameAs(id)) && !seen.has(keyOf(id)) && ctx.ok(id) && sureGear(ctx.data, id, ctx.gym) && !tooHeavy(id));
  // Two names for one option in the same ladder: the first (the ladder's best) stands for both.
  const once = usable.filter((id, i) => usable.findIndex((x) => keyOf(x) === keyOf(id)) === i);
  return rankSoft(once, ctx.soft)[0] ?? null;
}

/**
 * The option an exercise is, by its plain name: "Machine Leg Press", "Angled Machine Leg Press" and
 * "Leg Press" are the same leg press at a gym (the machine words only say how it is built).
 */
export const optionKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\b(machine|angled|lever|leverage)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The card after a swap: the slot's targets stay (sets, reps, rest), only the exercise changes. */
export function swapItem(item: QuickItem, to: string, name: string, eachSide: boolean, slotName?: string, hangs = false): QuickItem {
  // Never "Same movement as X" on X itself (round 3, B1).
  const from = slotName ?? item.name;
  const next: QuickItem = { ...item, id: to, name, why: to === item.slot || optionKey(from) === optionKey(name) ? item.why : `Same movement as ${from}`, swapped: true };
  if (eachSide) next.eachSide = true;
  else delete next.eachSide;
  // A bodyweight pull up is a reachable 5 to 8 reps, never 8 to 12 (the same as a card built with one).
  if (hangs && next.reps) next.reps = [5, 8];
  return next;
}


/** A left swipe: one more soft dislike for the exercise swapped away. */
export function learnSwap(d: Dislikes, id: string): Dislikes {
  return { ...d, soft: { ...d.soft, [id]: (d.soft?.[id] ?? 0) + 1 } };
}

/** A long press: never show it again. */
export function learnNever(d: Dislikes, id: string): Dislikes {
  return d.never?.includes(id) ? d : { ...d, never: [...(d.never ?? []), id] };
}

/** Undo of a long press. */
export function unlearnNever(d: Dislikes, id: string): Dislikes {
  return { ...d, never: (d.never ?? []).filter((x) => x !== id) };
}

/** The generator input with the learned dislikes merged in (never list joined, soft counts passed on). */
export function withDislikes(input: GeneratorInput, d: Dislikes | undefined): GeneratorInput {
  if (!d) return input;
  const never = [...new Set([...(input.never ?? []), ...(d.never ?? [])])];
  const out: GeneratorInput = { ...input };
  if (never.length) out.never = never;
  if (d.soft && Object.keys(d.soft).length) out.soft = { ...input.soft, ...d.soft };
  return out;
}

/** Muscles with logged working sets (never warm ups) in workouts started in the last 3 days. Imported workouts carry no date. */
export const RECENT_MS = 3 * 24 * 60 * 60 * 1000;
export function recentMuscles(
  sessions: readonly { id: string; startedAt: number; imported: boolean }[],
  sets: readonly { sessionId: string; exerciseId: string; kind: string }[],
  targets: (id: string) => readonly Muscle[],
  now: number,
): Muscle[] {
  const ids = new Set(sessions.filter((x) => !x.imported && x.startedAt >= now - RECENT_MS && x.startedAt <= now).map((x) => x.id));
  // Most trained first (round 3, P7: the subtitle names the main areas).
  const count = new Map<Muscle, number>();
  for (const st of sets) if (ids.has(st.sessionId) && st.kind !== 'warmup') for (const m of targets(st.exerciseId)) count.set(m, (count.get(m) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
}
