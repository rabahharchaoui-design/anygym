// Quick workout's "Curate it" deck (PLAN 3.5a, 3.5b, SPEC 20.3): one exercise per card. Keep (right),
// Swap (left: the same movement pattern this gym surely has, ranked lower next time), Never show (long
// press: something else of the same movement, else it leaves the workout with Undo; PLAN 3.5g: a
// circuit stays one structure). Moved out of QuickScreen as it was (PLAN 3.5g, code organization).
// PLAN 3.5f, many lefts: every left pulls the next best move of the slot's deep ranked pool (the same
// pattern first, then close ones); from the third left on a slot the line offers "Show me 6"; at the true end the
// line says so; the third workout a move is swiped away in asks once "Hide it for good?". Every
// card's why line is a curated fact, worked out again after each change (lib/quickNotes.ts).
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { recordLeft, recordNever, undoNever } from '../../db/quick';
import { SWAP_DATA, countsEachSide } from '../../data/patterns';
import { QUICK_DEPS } from '../../data/quick';
import { hints } from '../../lib/hints';
import { END_LINE, SHOW_SIX_AFTER, conceptMinutes, dropItem, dropSlot, quickAvoids, safePairs, sixOf, swapItem, swapPool, type Concept, type Option, type PlanPart, type QuickItem } from '../../lib/quick';
import { withNotes } from '../../lib/quickNotes';
import type { GeneratorInput } from '../../lib/generator';
import type { GymKit } from '../../lib/picker';
import { requiresOf } from '../../lib/swap';
import { hangsBodyweight } from '../../lib/quickStyles';
import type { Decision } from './Deck';

export type Curating = {
  concept: Concept;
  items: QuickItem[];
  plan?: PlanPart;
  index: number;
  tried: Record<string, string[]>;
  changed: boolean;
  /** PLAN 3.5f: left swipes per slot (3: "Show me 6"). */
  lefts: Record<string, number>;
  /** PLAN 3.5f: this deck visit, as one workout for "3 lefts across workouts". */
  workout: string;
  /** PLAN 3.5f: the moves (as the workout would start them) hidden with nothing to put in their place. */
  removed: string[];
};

/** One line above the card (round 2, B2): never over the buttons, never swallowing a tap. */
export type Notice = { id: number; text: string; undo?: () => void };

export function useDeck(base: GeneratorInput | null, kit: GymKit | null, neverNow: string[], setNeverNow: Dispatch<SetStateAction<string[]>>, setError: (e: string) => void) {
  const [stage, setStage] = useState<Curating | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const [hint, setHint] = useState(() => !hints.seen('deckSwipe'));

  const okFor = useMemo(() => {
    const never = new Set([...(base?.never ?? []), ...neverNow].map(SWAP_DATA.sameAs));
    // 3.5b round 4 (B2): a swap keeps the Go easy on rules every card is built with.
    return (id: string) => QUICK_DEPS.usable(id) && !never.has(SWAP_DATA.sameAs(id)) && !quickAvoids(base?.easyOn, QUICK_DEPS.profile(id));
  }, [base, neverNow]);
  /** The top card's whole ranked pool (PLAN 3.5f): its first is what a left puts in; empty is the true end. */
  const poolFor = (c: Curating): Option[] => {
    const item = c.items[c.index];
    if (!item || !kit) return [];
    return swapPool(item, c.items, [...(c.tried[item.slot] ?? []), item.id], { data: SWAP_DATA, gym: kit, ok: okFor, profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name, ...(base?.soft ? { soft: base.soft } : {}) });
  };
  const pool = useMemo(() => (stage ? poolFor(stage) : []), [stage, kit, okFor]); // eslint-disable-line react-hooks/exhaustive-deps
  const canSwap = pool.length > 0;
  const top = stage?.items[stage.index];
  const [sixOpen, setSixOpen] = useState(false);
  const [ended, setEnded] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ id: string; name: string } | null>(null);
  /** "Show me 6" is offered from the third left on this card's slot, while there is a choice left to show (one move left: a left just brings it). */
  const sixOffered = !!top && (stage?.lefts[top.slot] ?? 0) >= SHOW_SIX_AFTER && pool.length > 1;
  const six = useMemo(() => sixOf(pool).map((o) => ({ ...o, name: QUICK_DEPS.name(o.id) })), [pool]);
  const atEnd = !!top && ended === top.slot && !canSwap;

  const seenHint = () => {
    if (!hint) return;
    hints.dismiss('deckSwipe');
    setHint(false);
  };

  const slotNames = useRef(new Map<string, string>());
  const replaceTop = (c: Curating, to: Option): Curating => {
    const item = c.items[c.index]!;
    if (!slotNames.current.has(item.slot)) slotNames.current.set(item.slot, item.name);
    // PLAN 3.5b: a superset whose new partner no longer suits it is done as two single moves.
    const items = safePairs(
      c.items.map((it, i) => (i === c.index ? swapItem(item, to.id, QUICK_DEPS.name(to.id), countsEachSide(to.id), slotNames.current.get(item.slot), hangsBodyweight(requiresOf(SWAP_DATA, to.id)), to.close) : it)),
      QUICK_DEPS.profile,
    );
    // PLAN 3.5f: every why line is a curated fact, true of the workout as it is now.
    return { ...c, items: withNotes(items, QUICK_DEPS), changed: true, tried: { ...c.tried, [item.slot]: [...(c.tried[item.slot] ?? []), item.id] } };
  };

  const decide = (d: Decision) => {
    seenHint();
    const c = stage;
    if (!c) return;
    if (d === 'keep') return setStage({ ...c, index: c.index + 1 });
    const to = pool[0];
    const item = c.items[c.index];
    if (!to || !item) return;
    // A left swipe quietly ranks the one swapped away lower next time (never a ban); the third
    // workout it is swiped away in asks once whether to hide it for good.
    void recordLeft(item.id, c.workout)
      .then((r) => r.ask && setAsk({ id: item.id, name: item.name }))
      .catch(() => undefined);
    const lefts = (c.lefts[item.slot] ?? 0) + 1;
    // From the third left on this slot the line above the card offers "Show me 6" (sixOffered): a
    // button, never a sheet rising by itself in the middle of a run of swipes.
    setStage({ ...replaceTop(c, to), lefts: { ...c.lefts, [item.slot]: lefts } });
  };

  /** A tap in "Show me 6": that move takes the card's place (nothing is ranked lower for it). */
  const pickSix = (o: Option) => {
    setSixOpen(false);
    if (stage) setStage(replaceTop(stage, o));
  };

  /** "Hide it for good?" answered: Hide puts it on the never list; either way it is never asked again. */
  const answerAsk = (hide: boolean) => {
    const a = ask;
    setAsk(null);
    if (!a || !hide) return;
    void recordNever(a.id).catch(() => undefined);
    setNeverNow((n) => [...n, a.id]);
  };

  // The last card kept: the buttons fade out while Ready to go comes in (round 2, P8).
  const flyStart = (d: Decision) => {
    if (d === 'keep' && stage && stage.index === stage.items.length - 1) setLeaving(true);
  };
  useEffect(() => {
    if (stage && stage.index < stage.items.length) setLeaving(false);
    // Round 3 (P3): the deck is done: its notice (and its Undo) goes with it.
    if (stage && stage.index >= stage.items.length) setNotice(null);
  }, [stage]);

  const nothingToSwap = () => {
    setSwapNote('No other option here');
    // PLAN 3.5f: the honest end, in the line above the card, for as long as this card is on top.
    if (top) setEnded(top.slot);
  };
  useEffect(() => {
    if (!swapNote) return;
    const t = window.setTimeout(() => setSwapNote(null), 1800);
    return () => window.clearTimeout(t);
  }, [swapNote]);

  const never = () => {
    if (!stage) return;
    seenHint();
    const before = stage;
    const item = stage.items[stage.index];
    if (!item) return;
    void recordNever(item.id).catch(() => undefined);
    setNeverNow((n) => [...n, item.id]);
    // Something else of the same movement takes its place; nothing fits: it leaves the workout, and
    // the line says so with the new time (round 2, B6), never a silent gap.
    const to = pool[0];
    const next: Curating = to
      ? replaceTop(stage, to)
      : // PLAN 3.5g: the rest keeps its structure (a circuit stays a circuit), never a stray pair.
        { ...stage, changed: true, removed: [...stage.removed, item.origin], items: withNotes(dropItem(stage.items, stage.index), QUICK_DEPS), ...(stage.plan ? { plan: dropSlot(stage.plan, item.slot) } : {}) };
    setStage(next);
    const after = conceptMinutes({ items: next.items, ...(next.plan ? { plan: next.plan } : {}) });
    const id = Date.now();
    setNotice({
      id,
      // PLAN 3.8a (Codex ui-3.5a #5): the line always names the exercise that was hidden.
      text: to ? `${item.name} hidden` : `${item.name} hidden. No replacement available. Workout now ~${after} min.`,
      undo: () => {
        setNotice((n) => (n?.id === id ? null : n));
        void undoNever(item.id).catch(() => undefined);
        setNeverNow((n) => n.filter((x) => x !== item.id));
        setStage(before);
      },
    });
  };

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice((cur) => (cur?.id === notice.id ? null : cur)), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const curate = (c: Concept) => {
    setError('');
    setNotice(null);
    setLeaving(false);
    slotNames.current = new Map();
    setSixOpen(false);
    setEnded(null);
    setStage({ concept: c, items: c.items.map((it) => ({ ...it })), ...(c.plan ? { plan: c.plan } : {}), index: 0, tried: {}, changed: false, lefts: {}, workout: `deck-${Date.now()}`, removed: [] });
  };

  return { stage, setStage, notice, swapNote, leaving, fling, setFling, hint, canSwap, decide, flyStart, never, nothingToSwap, curate, six, sixOffered, sixOpen, setSixOpen, pickSix, atEnd, endLine: END_LINE, ask, answerAsk };
}
