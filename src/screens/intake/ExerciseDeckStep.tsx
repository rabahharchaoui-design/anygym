import { useMemo, useState } from 'react';
import { SlidingToggle } from '../../ui/SlidingToggle';
import { CheckIcon, NeverIcon, PassIcon } from '../../ui/icons';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { SwipeDeck, type Decision } from '../../components/deck/SwipeDeck';
import { DeckButtons } from '../../components/deck/DeckButtons';
import { ExerciseFace } from '../../components/deck/ExerciseFace';
import { FactSheet, type Fact } from '../../components/deck/CurateSheets';
import { COACH_FACTS } from '../../data/coachFacts';
import { demoFor } from '../../data/exerciseInfo';
import { GENERATOR_DEPS } from '../../data/generator';
import { profileFor } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { aboutNote } from '../../lib/coachFacts';
import { decideExercise, intakeDeck } from '../../lib/intake/exerciseDeck';
import type { GymKit } from '../../lib/picker';
import { ExercisesStep } from './ExerciseSearch';
import styles from './ExerciseDeck.module.css';

// "Any favorites, or ones to avoid?" (SPEC 14 item 11; PLAN 3.5f: the shared swipe deck). Cards of
// well known moves this person's gym has: right (or Love) is a favorite, left (or Not sure, round 3
// M6: one "Skip" on the screen, the top one) is no opinion, a hold (or Never) is one to leave out. The two lists stay one tap away, searchable, to
// add any other move or take one back. All optional.

type Props = { love: readonly string[]; never: readonly string[]; onLove: (v: string[]) => void; onNever: (v: string[]) => void; gym: GymKit };
type Mode = 'cards' | 'love' | 'never';

export function ExerciseDeckStep({ love, never, onLove, onNever, gym }: Props) {
  const reduced = useReducedMotionLive();
  const [mode, setMode] = useState<Mode>('cards');
  // The cards are worked out once per visit: deciding one never reshuffles the rest.
  const cards = useMemo(() => intakeDeck(gym, { data: SWAP_DATA, usable: (id) => demoFor(id) !== null }).map((id) => ({ id, name: GENERATOR_DEPS.name(id) })), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Back on this screen: the deck picks up after the cards already decided.
  const [index, setIndex] = useState(() => {
    const decided = new Set([...love, ...never]);
    const at = cards.findIndex((c) => !decided.has(c.id));
    return at === -1 ? cards.length : at;
  });
  const [fling, setFling] = useState<{ kind: Decision; n: number } | null>(null);
  const [fact, setFact] = useState<Fact | null>(null);
  const top = cards[index];
  const noteOf = (c: { id: string; name: string }) => aboutNote(COACH_FACTS, { name: c.name, pattern: profileFor(c.id).pattern });
  const decide = (to: 'love' | 'never' | 'pass') => {
    if (!top) return;
    const next = decideExercise({ love, never }, top.id, to);
    // Only the list that changed is saved (a move sits in one list at most).
    if (next.love.length !== love.length) onLove(next.love);
    if (next.never.length !== never.length) onNever(next.never);
    setIndex((i) => i + 1);
  };
  return (
    <>
      <SlidingToggle
        block
        glass
        label="Cards or lists"
        testId="ex-mode"
        options={[
          { value: 'cards', label: 'Cards' },
          { value: 'love', label: `Love${love.length ? ` (${love.length})` : ''}` },
          { value: 'never', label: `Never${never.length ? ` (${never.length})` : ''}` },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'love' ? (
        <ExercisesStep key="love" value={love} exclude={never} onChange={onLove} testId="q-love" gym={gym} />
      ) : mode === 'never' ? (
        <ExercisesStep key="never" value={never} exclude={love} onChange={onNever} testId="q-never" gym={gym} />
      ) : top ? (
        <div className={styles.deck} data-testid="ex-deck">
          <SwipeDeck
            items={cards}
            index={index}
            canSwap
            reduced={reduced}
            fling={fling}
            onDecide={(d) => decide(d === 'keep' ? 'love' : 'pass')}
            onNever={() => decide('never')}
            onNothingToSwap={() => undefined}
            holdWord="Never"
            label={(c) => `${c.name}. ${noteOf(c).why}`}
            renderCard={(c, at) => {
              const note = noteOf(c);
              return <ExerciseFace demo={demoFor(c.id)} name={c.name} why={note.why} fact={note.fact} under={at.under} onInfo={() => setFact({ name: c.name, why: note.why, more: note.more })} />;
            }}
          />
          <DeckButtons
            left={{ kind: 'swap', testId: 'ex-skip', onClick: () => setFling((f) => ({ kind: 'swap', n: (f?.n ?? 0) + 1 })), icon: <PassIcon width={20} height={20} strokeWidth={2.2} aria-hidden="true" />, label: <span>Not sure</span> }}
            middle={{ kind: 'other', testId: 'ex-never', onClick: () => decide('never'), ariaLabel: 'Never show me this', icon: <NeverIcon width={20} height={20} strokeWidth={2} aria-hidden="true" />, label: <span>Never</span> }}
            right={{ kind: 'keep', testId: 'ex-love', onClick: () => setFling((f) => ({ kind: 'keep', n: (f?.n ?? 0) + 1 })), icon: <CheckIcon width={20} height={20} strokeWidth={2.8} aria-hidden="true" />, label: <span>Love</span> }}
          />
        </div>
      ) : (
        // Every card decided (or this gym has none we can show): an honest end with the next step.
        <div className={styles.done} data-testid="ex-done">
          <p className={styles.doneTitle}>{cards.length ? 'That is every card' : 'No cards for this gym yet'}</p>
          <p className={styles.doneSub}>{cards.length ? 'Add any other move under Love or Never, or continue.' : 'Search for a move under Love or Never, or continue.'}</p>
        </div>
      )}
      <FactSheet fact={fact} onClose={() => setFact(null)} />
    </>
  );
}
