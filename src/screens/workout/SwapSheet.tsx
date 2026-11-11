import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { Button } from '../../ui/Button';
import { CheckIcon, NeverIcon, SwapIcon, UndoIcon } from '../../ui/icons';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { DeckButtons } from '../../components/deck/DeckButtons';
import { ExerciseFace } from '../../components/deck/ExerciseFace';
import { FactSheet, HideAskSheet, type Fact } from '../../components/deck/CurateSheets';
import curate from '../../components/deck/Curate.module.css';
import { COACH_FACTS } from '../../data/coachFacts';
import { profileFor } from '../../data/order';
import { getDislikes, recordLeft, recordNever, undoNever } from '../../db/quick';
import { swapNote } from '../../lib/coachFacts';
import { END_LINE, SHOW_SIX, SHOW_SIX_AFTER, rankSoft, type Dislikes } from '../../lib/quick';
import { Thumb } from './Thumb';
import type { SwapChoice, SwapChoices } from './useWorkout';
import styles from './SwapSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  /** The exercise being replaced. */
  name: string;
  options: SwapChoices;
  /** A plan workout: "Always use this" can be offered. */
  canAlways: boolean;
  onPick: (to: string, always: boolean) => void;
  onStopAlways: (slot: string) => void;
};

/**
 * Replace (PLAN 3.4, SPEC 7.2; PLAN 3.5f: the shared swipe deck). The exercises this gym can do for
 * this slot, best first, one per card: right (or "Use it") swaps it in for this workout, left (or
 * "Next") shows the next one and ranks the one passed lower, a hold (or "Hide") never offers it
 * again, with Undo. "Show all" (stepping forward after 3 lefts) lists the same options, up to 6. At the
 * end the line says so. A demo photo only for a sure match (SPEC 4.3). The switch makes the pick
 * stick for the plan, and it starts off every time.
 */
export function SwapSheet({ open, onClose, name, options, canAlways, onPick, onStopAlways }: Props) {
  // This workout: a left here counts once toward "3 lefts across workouts".
  const workout = options.workout ?? 'replace';
  const reduced = useReducedMotionLive();
  const [always, setAlways] = useState(false);
  const [index, setIndex] = useState(0);
  const [lefts, setLefts] = useState(0);
  const [list, setList] = useState(false);
  const [ended, setEnded] = useState(false);
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const [dislikes, setDislikes] = useState<Dislikes>({});
  const [hidden, setHidden] = useState<SwapChoice | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [fact, setFact] = useState<Fact | null>(null);
  const [ask, setAsk] = useState<SwapChoice | null>(null);
  useEffect(() => {
    if (!open) return;
    setAlways(false);
    setIndex(0);
    setLefts(0);
    setList(false);
    setEnded(false);
    setHidden(null);
    setGone([]);
    let alive = true;
    // What was learned on the decks: never shown moves are left out, swiped away ones rank lower.
    getDislikes().then((d) => alive && setDislikes(d), () => undefined);
    return () => {
      alive = false;
    };
  }, [open]);
  const { restore, noPattern } = options;
  const choices = useMemo(() => {
    const out = new Set([...(dislikes.never ?? []), ...gone]);
    const kept = options.choices.filter((c) => !out.has(c.id));
    return rankSoft(kept.map((c) => c.id), dislikes.soft).map((id) => kept.find((c) => c.id === id)!);
  }, [options.choices, dislikes, gone]);
  const none = choices.length === 0 && !restore;
  // One option is a row to tap, not a deck to swipe.
  const asList = list || choices.length <= 1;
  const top = choices[index];
  const last = index >= choices.length - 1;
  const noteOf = (c: SwapChoice) => swapNote(COACH_FACTS, { name: c.name, pattern: profileFor(c.id).pattern }, name);

  const decide = (d: Decision) => {
    if (!top) return;
    if (d === 'keep') return onPick(top.id, canAlways && always);
    // Left: the next one, and the one passed ranks lower from now on (3 workouts: asked once to hide it).
    void recordLeft(top.id, workout)
      .then((r) => r.ask && setAsk(top))
      .catch(() => undefined);
    setIndex((i) => i + 1);
    setHidden(null);
    setLefts((n) => n + 1);
  };
  const hide = (c: SwapChoice) => {
    void recordNever(c.id).catch(() => undefined);
    setGone((g) => [...g, c.id]);
    setIndex((i) => Math.min(i, Math.max(0, choices.length - 2)));
    setHidden(c);
  };
  const undoHide = () => {
    if (!hidden) return;
    void undoNever(hidden.id).catch(() => undefined);
    setGone((g) => g.filter((id) => id !== hidden.id));
    setHidden(null);
  };

  return (
    <Sheet open={open} onClose={onClose} label={`Replace ${name}`} scroll>
      {open && (
        <div className={styles.body} data-testid="swap-sheet" data-mode={asList ? 'list' : 'deck'}>
          <h2 className={styles.title}>Replace {name}</h2>
          {none ? (
            <div className={styles.empty} data-testid="swap-empty">
              <p className={styles.emptyTitle}>{noPattern ? 'No sure swap for this one' : 'Nothing else fits this gym'}</p>
              <p className={styles.emptySub}>Keep it, or skip it. The rest of your workout is not affected.</p>
              <button type="button" className={`${styles.keep} pressable`} onClick={onClose}>
                Keep it
              </button>
            </div>
          ) : (
            <>
              <p className={styles.sub}>{always ? 'From now on in this plan' : 'For this workout only'}</p>
              {!asList && top ? (
                <div className={styles.deckBox} data-testid="swap-deck">
                  <p className={styles.line} aria-live="polite" data-testid="swap-line">
                    {hidden ? (
                      <>
                        <span>{hidden.name} hidden</span>
                        <button type="button" className={`${curate.offer} pressable`} onClick={undoHide} data-testid="swap-undo-hide">
                          <UndoIcon width={16} height={16} strokeWidth={2.2} aria-hidden="true" />
                          Undo
                        </button>
                      </>
                    ) : ended && last ? (
                      <span data-testid="deck-end">{END_LINE}</span>
                    ) : (
                      'Right uses it, left shows the next one.'
                    )}
                  </p>
                  <SwipeDeck
                    items={choices}
                    index={index}
                    canSwap={!last}
                    reduced={reduced}
                    fling={fling}
                    onDecide={decide}
                    onNever={() => hide(top)}
                    onNothingToSwap={() => setEnded(true)}
                    label={(c) => `${c.name}. ${noteOf(c).why}`}
                    renderCard={(c, at) => {
                      const note = noteOf(c);
                      return <ExerciseFace demo={c.photo} name={c.name} why={note.why} fact={note.fact} under={at.under} onInfo={() => setFact({ name: c.name, why: note.why, more: note.more, rows: [c.reason] })} />;
                    }}
                  />
                  <DeckButtons
                    left={{ kind: 'swap', testId: 'swap-next', onClick: () => setFling((f) => ({ kind: 'swap', n: (f?.n ?? 0) + 1 })), icon: <SwapIcon width={20} height={20} strokeWidth={2.2} aria-hidden="true" />, label: <span>Next</span> }}
                    middle={{ kind: 'other', testId: 'swap-hide', onClick: () => hide(top), ariaLabel: 'Never show me this', icon: <NeverIcon width={20} height={20} strokeWidth={2} aria-hidden="true" />, label: <span>Hide</span> }}
                    right={{ kind: 'keep', testId: 'swap-use', onClick: () => setFling((f) => ({ kind: 'keep', n: (f?.n ?? 0) + 1 })), icon: <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />, label: <span>Use it</span> }}
                  />
                </div>
              ) : (
                <ul className={styles.list} data-testid="swap-list">
                  {choices.slice(0, SHOW_SIX).map((c) => (
                    <li key={c.id}>
                      <button type="button" className={`${styles.row} pressable`} data-testid={`swap-choice-${c.id}`} onClick={() => onPick(c.id, canAlways && always)}>
                        <Thumb name={c.name} loadType={c.loadType} photo={c.photo} />
                        <span className={styles.text}>
                          <span className={styles.name}>{c.name}</span>
                          <span className={styles.reason}>{c.reason}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!asList && (
                // Always one tap away; after 3 lefts it steps forward (the same offer as every deck's "Show me 6").
                <Button variant={lefts >= SHOW_SIX_AFTER ? 'secondary' : 'tertiary'} onClick={() => setList(true)} data-testid="swap-all" data-offered={lefts >= SHOW_SIX_AFTER || undefined}>
                  Show {choices.length > SHOW_SIX ? `me ${SHOW_SIX}` : `all ${choices.length}`}
                </Button>
              )}
              {restore && (
                <Button variant="tertiary" data-testid="swap-restore" onClick={() => onPick(restore.id, false)}>
                  Back to the plan: {restore.name}
                </Button>
              )}
              {canAlways && choices.length > 0 && <Switch label="Always use this" hint="Turn this on, then tap your pick" checked={always} onChange={setAlways} />}
              {options.always && (
                <button type="button" className={`${styles.keep} pressable`} data-testid="swap-stop-always" onClick={() => onStopAlways(options.always!.slot)}>
                  Stop always using {options.always.name}
                </button>
              )}
            </>
          )}
        </div>
      )}
      <FactSheet fact={fact} onClose={() => setFact(null)} />
      <HideAskSheet
        name={ask?.name ?? null}
        onAnswer={(yes) => {
          if (yes && ask) hide(ask);
          setAsk(null);
        }}
      />
    </Sheet>
  );
}
