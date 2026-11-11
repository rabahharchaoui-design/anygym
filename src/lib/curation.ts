// Swipe to curate, many lefts (PLAN 3.5f). Pure. Every left pulls the next best move from a deep
// ranked pool: the same movement pattern at this gym first (the ladder's order, fewest lefts first),
// then the close patterns (generatorRules FALLBACK: legs stay legs, pushes stay pushes) of the same
// size of lift. After 3 lefts on one slot the deck offers "Show me 6": up to six of the pool at once,
// never padded. At the true end the deck says so. Lefts rank a move lower every time (never a ban);
// 3 lefts on the same move in 3 different workouts ask once "Hide it for good?".
// The pool is built only from the swap ladders (SWAP_DATA), so a candidate move is in it only after
// it is approved on this phone (data/candidateGate.ts): it deepens by itself as approvals arrive.
import { FALLBACK } from './generatorRules';
import { isCompound } from './order';
import type { Dislikes, QuickItem } from './quick';
import { type SwapContext, optionKey, swapOptions } from './quickDeck';
import { patternOf } from './swap';

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
  const same = swapOptions(item, items, tried, ctx).map((id) => ({ id, close: false }));
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
