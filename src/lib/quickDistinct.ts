// "Hit what's fresh" and the style cards on screen, made distinct (PLAN 3.5d): no exercise in two of
// them, and every card its own why line. Pure. Moved out of quick.ts (PLAN 3.5j: it passed 400 lines).
import { CARDIO_MACHINES } from './cardio';
import type { Concept, QuickDeps, QuickInput } from './quick';
import { diverse, hangsBodyweight, quickMinutes, STYLES, type Batch, type StyleId } from './quickStyles';
import { mainWords, muscleRestLine } from './quickWhy';
import { chipOf } from './quickCards';
import { fits, gearOf, mainMuscles } from './quickShow';
import { withNotes } from './quickNotes';
import { nextSwap, safePairs, swapItem } from './quickDeck';
import { candidateFacts, requiresOf } from './swap';

/**
 * 3.5d (6): no exercise stands in two of the cards on screen (or in a card and the More ideas card
 * that would sit beside it) when the sure catalog allows: a repeated move takes the next option of its
 * own slot's pattern that no card shows. The plan day and "Hit what's fresh" are never changed. When
 * nothing else fits, the card keeps the move (a slot is never left empty), and a swap that would take
 * the card over its minutes or change the muscles it trains is not made.
 */
export function distinctCards(batch: Batch<Concept>, input: QuickInput, deps: QuickDeps): Batch<Concept> {
  const never = new Set((input.base.never ?? []).map(deps.data.sameAs));
  const ok = (id: string) => deps.usable(id) && !never.has(deps.data.sameAs(id));
  const keys = (c: Concept) => c.items.map((it) => deps.data.sameAs(it.id));
  const fix = (c: Concept, others: readonly Concept[], beside: (c: Concept) => readonly Concept[]): Concept => {
    if (c.id === 'plan' || c.id === 'fresh' || !(c.id in STYLES)) return c;
    const taken = new Set(others.flatMap(keys));
    if (!c.items.some((it) => taken.has(deps.data.sameAs(it.id)))) return c;
    let items = c.items;
    for (const it of c.items) {
      if (!taken.has(deps.data.sameAs(it.id))) continue;
      const to = nextSwap(it, items, [], { data: deps.data, gym: input.base.gym, ok, profile: deps.profile, nameOf: deps.name, avoid: [...taken], ...(input.base.soft ? { soft: input.base.soft } : {}) });
      if (!to) continue;
      // Built this way, not swapped: the card's own exercise now (its slot, so a later swipe can still reach the others).
      const next = { ...swapItem(it, to, deps.name(to), candidateFacts(deps.data, to)?.eachSide === true, undefined, hangsBodyweight(requiresOf(deps.data, to))), slot: to, origin: to };
      delete next.swapped;
      delete next.from;
      delete next.close;
      const tryItems = safePairs(items.map((x) => (x === it ? next : x)), deps.profile);
      const withWhy = tryItems;
      if (!fits(quickMinutes(withWhy), input.minutes)) continue;
      const primary = mainMuscles(withWhy, deps);
      // The card keeps the muscles it showed. Round 2: a replacement that moves one of its three main
      // muscles (a Romanian deadlift for a deadlift: back to hamstrings) is let in only when the card is
      // still named for the same muscles and the diversity rule still holds against every card beside it.
      // 3.5d round 3 (4), why the Romanian deadlift is not always there: at 30 and 60 min the strength card's
      // Deadlift repeats the circuit's, and the replacement is available and fits, but it moves the card's
      // main muscles from lower back to hamstrings and glutes, which the pump card (or the More ideas card
      // beside it) already trains: `diverse` fails, so the card keeps the Deadlift. Two cards training the
      // same muscles is the worse trade, so the rule stays as it is (at 45 the strength card is built with it).
      const same = primary.size === c.primary.size && [...primary].every((m) => c.primary.has(m));
      if (!same && (mainWords(withWhy, deps).words.join() !== mainWords(c.items, deps).words.join() || !beside(c).every((o) => diverse(primary, o.primary)))) continue;
      items = withWhy;
    }
    if (items === c.items) return c;
    // PLAN 3.5f: every why line is a curated fact, true of the card as it is now.
    items = withNotes(items, deps);
    const style = STYLES[c.id as StyleId];
    const ids = items.map((x) => x.id);
    return {
      ...c,
      items,
      minutes: quickMinutes(items),
      chip: chipOf(style, items),
      // PLAN 3.5j: the cardio machine of a warm up stays on the gear line.
      gear: [...c.gear.filter((g) => CARDIO_MACHINES.includes(g)), ...gearOf(ids, deps.data, input.base.gym)],
      primary: mainMuscles(items, deps),
      line: muscleRestLine(items, deps, input.lastTrained, input.now ?? Date.now()) ?? c.altLines?.[c.altLines.length - 1] ?? c.line,
    };
  };
  const cards: Concept[] = [];
  // A card's replacement must stay diverse from the other cards and from every More ideas card that would sit beside it.
  batch.cards.forEach((c, k) => cards.push(fix(c, cards, (x) => [...batch.cards.filter((o) => o !== x), ...batch.more.filter((_, i) => batch.moreAt[i] !== k)])));
  const more = batch.more.map((c, i) => {
    const sit = cards.filter((_, k) => k !== batch.moreAt[i]);
    return fix(c, sit, () => sit);
  });
  return { ...batch, cards, more };
}

/**
 * 3.5d (9): every card on screen has its own why line. A later card whose line an earlier one already
 * shows takes its next true line (what it leaves out, then what it is); a More ideas card is checked
 * against the cards it would sit with.
 */
export function ownLines(batch: Batch<Concept>): Batch<Concept> {
  const { cards, more, moreAt } = batch;
  const pick = (c: Concept, taken: ReadonlySet<string>): Concept => {
    if (c.id === 'plan' || !taken.has(c.line)) return c;
    const next = (c.altLines ?? []).find((l) => !taken.has(l));
    return next ? { ...c, line: next } : c;
  };
  const out: Concept[] = [];
  for (const c of cards) out.push(pick(c, new Set(out.map((x) => x.line))));
  const outMore = more.map((c, i) => pick(c, new Set(out.filter((_, k) => k !== moreAt[i]).map((x) => x.line))));
  return { ...batch, cards: out, more: outMore };
}
