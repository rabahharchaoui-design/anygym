// Quick workout's "Curate it" deck (PLAN 3.5a, 3.5b, SPEC 20.3): one exercise per card. Keep (right),
// Swap (left: the same movement pattern this gym surely has, ranked lower next time), Never show (long
// press: something else of the same movement, else it leaves the workout with Undo; PLAN 3.5g: a
// circuit stays one structure). Moved out of QuickScreen as it was (PLAN 3.5g, code organization).
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { recordNever, recordSwapAway, undoNever } from '../../db/quick';
import { SWAP_DATA, countsEachSide } from '../../data/patterns';
import { QUICK_DEPS } from '../../data/quick';
import { hints } from '../../lib/hints';
import { conceptMinutes, dropItem, dropSlot, nextSwap, quickAvoids, safePairs, swapItem, type Concept, type PlanPart, type QuickItem } from '../../lib/quick';
import type { GeneratorInput } from '../../lib/generator';
import type { GymKit } from '../../lib/picker';
import { requiresOf } from '../../lib/swap';
import { hangsBodyweight } from '../../lib/quickStyles';
import type { Decision } from './Deck';

export type Curating = { concept: Concept; items: QuickItem[]; plan?: PlanPart; index: number; tried: Record<string, string[]>; changed: boolean };

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
  const swapFor = (c: Curating): string | null => {
    const item = c.items[c.index];
    if (!item || !kit) return null;
    return nextSwap(item, c.items, [...(c.tried[item.slot] ?? []), item.id], { data: SWAP_DATA, gym: kit, ok: okFor, profile: QUICK_DEPS.profile, nameOf: QUICK_DEPS.name, ...(base?.soft ? { soft: base.soft } : {}) });
  };
  const canSwap = stage ? swapFor(stage) !== null : false;

  const seenHint = () => {
    if (!hint) return;
    hints.dismiss('deckSwipe');
    setHint(false);
  };

  const slotNames = useRef(new Map<string, string>());
  const replaceTop = (c: Curating, to: string): Curating => {
    const item = c.items[c.index]!;
    if (!slotNames.current.has(item.slot)) slotNames.current.set(item.slot, item.name);
    // PLAN 3.5b: a superset whose new partner no longer suits it is done as two single moves.
    const items = safePairs(
      c.items.map((it, i) => (i === c.index ? swapItem(item, to, QUICK_DEPS.name(to), countsEachSide(to), slotNames.current.get(item.slot), hangsBodyweight(requiresOf(SWAP_DATA, to))) : it)),
      QUICK_DEPS.profile,
    );
    return { ...c, items, changed: true, tried: { ...c.tried, [item.slot]: [...(c.tried[item.slot] ?? []), item.id] } };
  };

  const decide = (d: Decision) => {
    seenHint();
    setStage((c) => {
      if (!c) return c;
      if (d === 'keep') return { ...c, index: c.index + 1 };
      const to = swapFor(c);
      if (!to) return c;
      // A left swipe quietly ranks the one swapped away lower next time (never a ban).
      void recordSwapAway(c.items[c.index]!.id).catch(() => undefined);
      return replaceTop(c, to);
    });
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
    const to = swapFor(stage);
    const next: Curating = to
      ? replaceTop(stage, to)
      : // PLAN 3.5g: the rest keeps its structure (a circuit stays a circuit), never a stray pair.
        { ...stage, changed: true, items: dropItem(stage.items, stage.index), ...(stage.plan ? { plan: dropSlot(stage.plan, item.slot) } : {}) };
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
    setStage({ concept: c, items: c.items.map((it) => ({ ...it })), ...(c.plan ? { plan: c.plan } : {}), index: 0, tried: {}, changed: false });
  };

  return { stage, setStage, notice, swapNote, leaving, fling, setFling, hint, canSwap, decide, flyStart, never, nothingToSwap, curate };
}
