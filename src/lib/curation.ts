// Swipe to curate, many lefts (PLAN 3.5f). Pure. Every left pulls the next best move from a deep
// ranked pool: the same movement pattern at this gym first (the ladder's order, fewest lefts first),
// then the close patterns (generatorRules FALLBACK: legs stay legs, pushes stay pushes) of the same
// size of lift. After 3 lefts on one slot the deck offers "Show me 6": up to six of the pool at once,
// never padded. At the true end the deck says so. Lefts rank a move lower every time (never a ban);
// 3 lefts on the same move in 3 different workouts ask once "Hide it for good?".
// The pool is built only from the swap ladders (SWAP_DATA), so a candidate move is in it only after
// it is approved on this phone (data/candidateGate.ts): it deepens by itself as approvals arrive.
// Round 3 (B1): the same pattern part is exactly Replace's list (swap.ts swapCandidates, the same
// gym check, no sure demo asked for): a move without a sure demo is offered with its honest "No demo
// for this one yet", never a borrowed photo. Only moves already in the workout, already shown on this
// card, hidden (never) or ruled out by Go easy on are left out.
import { FALLBACK } from './generatorRules';
import { isCompound, isHeavy, liftWord } from './order';
import type { Dislikes, QuickItem } from './quick';
import { type SwapContext, optionKey, rankSoft, swapOptions } from './quickDeck';
import { patternOf, swapCandidates, workoutIdOf } from './swap';

/** Lefts on one slot before "Show me 6" is offered, and how many it shows at most. */
export const SHOW_SIX_AFTER = 3;
export const SHOW_SIX = 6;
/** The honest end of a slot's pool. */
export const END_LINE = 'That is every move your gym has for this';
/** Different workouts a move was swiped away in before "Hide it for good?" is asked (once). */
export const HIDE_ASK_AFTER = 3;

/** One move of a slot's pool; `close`: not the slot's own movement pattern, the closest the gym has. */
export type Option = { id: string; close: boolean };

/**
 * The slot's whole ranked pool, best first: every move of the same pattern this gym surely has, then
 * the close patterns' moves that are the same size of lift (a big lift for a big lift, a small move
 * for a small one), each option once, never one the card already showed. Empty: the true end.
 */
export function swapPool(item: QuickItem, items: readonly QuickItem[], tried: readonly string[], ctx: SwapContext): Option[] {
  const same = replaceOptions(item, items, tried, ctx).map((id) => ({ id, close: false }));
  const pattern = patternOf(ctx.data, item.slot);
  const p = ctx.profile;
  if (!pattern || !p) return same;
  const slotP = p(item.slot);
  const keyOf = (id: string) => (ctx.nameOf ? optionKey(ctx.nameOf(id)) : ctx.data.sameAs(id));
  const seen = new Set(same.map((o) => keyOf(o.id)));
  const close: Option[] = [];
  for (const near of FALLBACK[pattern]) {
    for (const id of swapOptions(item, items, tried, ctx, near)) {
      if (seen.has(keyOf(id)) || isCompound(p(id)) !== isCompound(slotP)) continue;
      seen.add(keyOf(id));
      close.push({ id, close: true });
    }
  }
  return [...same, ...close];
}

/**
 * Round 3 (B1): Replace's own list for this card's slot (swapCandidates: same pattern, this gym can do
 * it, the same way of counting), minus moves already in the workout, already shown on this card, the
 * same option under another name, and what ctx.ok rules out (never, Go easy on). Moves of the slot's
 * size come first (a light slot's heavy lifts last, never left out), then the fewest lefts first.
 */
export function replaceOptions(item: QuickItem, items: readonly QuickItem[], tried: readonly string[], ctx: SwapContext): string[] {
  const { data } = ctx;
  const from = patternOf(data, item.slot) ? item.slot : item.id;
  const mode = item.seconds !== undefined && item.reps === undefined ? 'seconds' : 'reps';
  const exclude = items.filter((x) => x !== item).map((x) => x.id);
  const listed = swapCandidates(data, from, ctx.gym, { mode, exclude: [item.id, item.slot, ...exclude] }).map(workoutIdOf);
  const keyOf = (id: string) => (ctx.nameOf ? optionKey(ctx.nameOf(id)) : data.sameAs(id));
  const seen = new Set([item.id, item.slot, ...tried, ...exclude, ...(ctx.avoid ?? [])].flatMap((id) => [data.sameAs(id), keyOf(id)]));
  const usable = listed.filter((id) => !seen.has(data.sameAs(id)) && !seen.has(keyOf(id)) && ctx.ok(id));
  const once = usable.filter((id, i) => usable.findIndex((x) => keyOf(x) === keyOf(id)) === i);
  const p = ctx.profile;
  const slotP = p?.(item.slot);
  const bigger = (id: string) => !!p && !!slotP && ((!isHeavy(slotP) && isHeavy(p(id))) || (liftWord(p(id)) === 'deadlift' && liftWord(slotP) !== 'deadlift'));
  return rankSoft([...once.filter((id) => !bigger(id)), ...once.filter(bigger)], ctx.soft);
}

/** "Show me 6": the next options of the pool, at most six, never padded. */
export const sixOf = (pool: readonly Option[]): Option[] => pool.slice(0, SHOW_SIX);

/**
 * A left swipe on `id` in the workout `workout` (a key for this deck visit or this session): one
 * more soft dislike (it ranks lower from now on), and the workout is remembered for the move (each
 * workout once, at most HIDE_ASK_AFTER). `ask`: this left is the one that makes it 3 different
 * workouts and the question was never asked for this move; it is marked asked right away, so the
 * question comes once whatever the answer.
 */
export function learnLeft(d: Dislikes, id: string, workout: string): { dislikes: Dislikes; ask: boolean } {
  const before = d.lefts?.[id] ?? [];
  const seen = before.includes(workout) ? before : [...before, workout].slice(-HIDE_ASK_AFTER);
  const ask = seen.length >= HIDE_ASK_AFTER && !before.includes(workout) && !d.asked?.includes(id) && !d.never?.includes(id);
  const dislikes: Dislikes = { ...d, soft: { ...d.soft, [id]: (d.soft?.[id] ?? 0) + 1 }, lefts: { ...d.lefts, [id]: seen } };
  if (ask) dislikes.asked = [...(d.asked ?? []), id];
  return { dislikes, ask };
}
