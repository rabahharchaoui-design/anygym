// The diversity rule and the rotation of the 4 cards.
import type { StyleId } from './types';

/** The rotation's own order (cards 3 and 4 walk it, the least recently shown and done first). */
export const STYLE_ORDER: readonly StyleId[] = ['circuit', 'pump', 'strength', 'armsAbs', 'easy', 'cardioCore', 'mobility'];

// ---------------------------------------------------------------- diversity and rotation

/**
 * The diversity rule (G, PLAN 3.5b round 2: the strict reading): two cards may share at most half
 * the primary muscles of either one (shared × 2 ≤ the smaller card's count). A card with no sure
 * primary muscle cannot show it is different: never next to another. Under this rule some gyms can
 * only fill 3 cards honestly (chooseBatch shows 3 then, never a near copy).
 */
export function diverse(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const m of a) if (b.has(m)) shared++;
  return 2 * shared <= Math.min(a.size, b.size);
}

export type Pickable = { id: string; primary: ReadonlySet<string> };

export type BatchInput<T extends Pickable> = {
  plan: T | null;
  /** "Hit what's fresh", variants in order (the first that keeps the cards diverse). */
  fresh: readonly T[];
  styles: ReadonlyMap<StyleId, readonly T[]>;
  /** Styles of the last 2 quick workouts done (logged sets), latest first. */
  done: readonly string[];
  /** The card ids shown last time, in order. */
  lastShown: readonly string[];
  /** Beginner or Go easy on: one Easy start (Low impact) card always. */
  needEasy: boolean;
  max?: number;
};

export type Batch<T> = {
  cards: T[];
  more: T[];
  /** Where each More ideas card goes: the card it replaces (or cards.length: it is added). */
  moreAt: number[];
  /** Card 4, the one a More ideas card replaces when it is diverse from all the others. */
  swapAt: number;
};

export const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Styles least recently done first, then the ones not shown last time, then the rotation order. */
export function rankStyles(available: readonly StyleId[], done: readonly string[], lastShown: readonly string[]): StyleId[] {
  return [...available].sort((a, b) => Number(done.includes(a)) - Number(done.includes(b)) || Number(lastShown.includes(a)) - Number(lastShown.includes(b)) || STYLE_ORDER.indexOf(a) - STYLE_ORDER.indexOf(b));
}

/**
 * The 4 cards: the plan day first (when a plan is active), then "Hit what's fresh" (when there are
 * logged sets), then styles in rotation, each kept only when it is diverse from every card before it.
 * Beginners and Go easy on always get an Easy start; a style done in the last 2 quick workouts never
 * leads the styles; the same 4 never show twice in a row while another diverse 4 exists.
 */
export function chooseBatch<T extends Pickable>(input: BatchInput<T>): Batch<T> {
  const max = input.max ?? 4;
  const okWith = (c: T, others: readonly T[]) => others.every((o) => o === c || diverse(c.primary, o.primary));
  const fixed: T[] = [];
  if (input.plan) fixed.push(input.plan);
  // 3.5b round 4 (B3): beginners and Go easy on: an Easy start that fits next to the plan wins over
  // "Hit what's fresh" (fresh only when one of its variants leaves room for it).
  const easyOk = input.needEasy ? (input.styles.get('easy') ?? []).filter((v) => okWith(v, fixed)) : [];
  const fresh = input.fresh.find((f) => okWith(f, fixed) && (!easyOk.length || easyOk.some((e) => okWith(e, [...fixed, f]))));
  if (fresh) fixed.push(fresh);
  const available = STYLE_ORDER.filter((id) => (input.styles.get(id) ?? []).length > 0);
  const ranked = rankStyles(available, input.done, input.lastShown);
  const variantFor = (id: StyleId, others: readonly T[]) => (input.styles.get(id) ?? []).find((v) => okWith(v, others));

  // Every combination is tried (a greedy pick can block a valid fourth card): the most cards first,
  // then the styles in rank order, each style's variants in order.
  type Accept = (cards: readonly T[]) => boolean;
  // 3.5b round 2: among the largest diverse sets that keep the rotation's first style, the one that
  // leaves the most styles for More ideas wins (so the row below the cards has something to offer).
  const moreCount = (combo: readonly T[]): number => {
    const others = combo.length >= max && combo.length > fixed.length ? combo.slice(0, -1) : combo;
    return ranked.filter((id) => !combo.some((c) => c.id === id) && !!variantFor(id, others)).length;
  };
  const search = (accept: Accept): T[] => {
    let size = fixed.length;
    let found: T[][] = [];
    const cur = [...fixed];
    const rec = (i: number) => {
      if (found.length >= 400) return;
      if (cur.length === max || i === ranked.length) {
        if (!accept(cur)) return;
        if (cur.length > size || !found.length) {
          size = Math.max(size, cur.length);
          found = cur.length >= size ? [[...cur]] : found;
        } else if (cur.length === size) found.push([...cur]);
        return;
      }
      if (found.length && cur.length + (ranked.length - i) < size) return;
      for (const v of input.styles.get(ranked[i]!) ?? []) {
        if (!okWith(v, cur)) continue;
        cur.push(v);
        rec(i + 1);
        cur.pop();
      }
      rec(i + 1);
    };
    rec(0);
    if (!found.length) return [...fixed];
    let best = found[0]!;
    let bestMore = moreCount(best);
    // With no plan and no fresh card the rotation's first style keeps card 1. With them only cards 3
    // and 4 rotate, and More ideas is the way to every other style: room for it wins.
    const lead = fixed.length ? undefined : best[0]?.id;
    for (const f of found.slice(1)) {
      if (lead !== undefined && f[0]?.id !== lead) continue;
      const n = moreCount(f);
      if (n > bestMore) {
        best = f;
        bestMore = n;
      }
    }
    return best;
  };
  const easyIn = (cs: readonly T[]) => cs.some((c) => c.id === 'easy');
  const any: Accept = () => true;
  let cards = search(any);
  // Beginners and Go easy on: one Easy start whenever one fits with the rest.
  const easyRule: Accept = input.needEasy && easyIn(search((cs) => easyIn(cs))) ? easyIn : any;
  if (easyRule !== any) cards = search(easyRule);
  // Never the same 4 twice in a row, while another set of as many diverse cards exists.
  if (sameIds(cards.map((c) => c.id), input.lastShown)) {
    const next = search((cs) => easyRule(cs) && !sameIds(cs.map((c) => c.id), input.lastShown));
    if (next.length >= cards.length) cards = next;
  }
  // A style done in the last 2 quick workouts never leads the styles (the order otherwise stays).
  const styles = cards.slice(fixed.length);
  styles.sort((a, b) => Number(input.done.includes(a.id)) - Number(input.done.includes(b.id)));
  cards = [...fixed, ...styles];
  // 3.5b round 4 (B3): beginners and Go easy on see Easy start first (right after the plan, when there is one).
  const easy = input.needEasy ? cards.find((c) => c.id === 'easy') : undefined;
  if (easy) {
    const lead = cards[0]?.id === 'plan' ? [cards[0]] : [];
    cards = [...lead, easy, ...cards.filter((c) => c !== easy && !lead.includes(c))];
  }

  // 3.5d: Arms and abs is a finishing card: never the first one shown (slot 1), unless it is the only card.
  if (cards.length > 1 && cards[0]!.id === 'armsAbs') cards = [...cards.slice(1), cards[0]!];

  // More ideas (3.5b round 4, M12): every other style, and the other body areas of a style on screen
  // ("Superset pump: legs and back"), each in the place it can take: added when there is room, else
  // in place of card 4 when it is diverse from all the others, else in place of the one card it is
  // too close to (never the plan, fresh or a beginner's Easy start). The cards stay diverse either way.
  const swappable = (c: T) => c.id !== 'plan' && c.id !== 'fresh' && !(input.needEasy && c.id === 'easy');
  let swapAt = cards.length;
  if (cards.length >= max) {
    const at = cards.findLastIndex(swappable);
    swapAt = at === -1 ? cards.length : at;
  }
  const placeFor = (v: T): number => {
    if (cards.length < max && okWith(v, cards)) return cards.length;
    const without = (i: number) => cards.filter((_, k) => k !== i);
    if (swapAt < cards.length && okWith(v, without(swapAt))) return swapAt;
    const close = cards.map((c, i) => (diverse(v.primary, c.primary) ? -1 : i)).filter((i) => i !== -1);
    if (close.length === 1 && swappable(cards[close[0]!]!) && okWith(v, without(close[0]!))) return close[0]!;
    return -1;
  };
  const more: T[] = [];
  const moreAt: number[] = [];
  for (const id of STYLE_ORDER) {
    const shown = cards.findIndex((c) => c.id === id);
    for (const v of input.styles.get(id) ?? []) {
      if (cards.includes(v)) continue;
      // Another body area of a style on screen takes that card's place (one card per style).
      let at = shown === -1 ? placeFor(v) : swappable(cards[shown]!) && okWith(v, cards.filter((_, k) => k !== shown)) ? shown : -1;
      // 3.5d: and never put in as the first card.
      if (v.id === 'armsAbs' && at === 0) at = -1;
      if (at === -1 || (shown !== -1 && sameMuscles(v.primary, cards[shown]!.primary))) continue;
      more.push(v);
      moreAt.push(at);
      // One chip per style not on screen (its first variant that fits).
      if (shown === -1) break;
    }
  }
  return { cards, more, moreAt, swapAt };
}

export const sameMuscles = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));
