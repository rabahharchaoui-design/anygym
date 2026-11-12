// One idea card on Quick workout (PLAN 3.5b; 3.5f (5): a calm face). Three things only: the title,
// one why line and "6 exercises · ~28 min", with the mini muscle map as the one picture. The style,
// its effort, the pairs and rounds, a short card's reason and the gear are behind the info button.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { workoutMuscles } from '../../data/quick';
import { cardKey, countLine, type Concept } from '../../lib/quick';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import { InfoIcon } from '../../ui/icons';
import { DUR } from '../../ui/motion';
import { IdeaSheet } from './IdeaSheet';
import styles from './ConceptCard.module.css';

export function ConceptCard({ concept, onPick, entering, flash, label, reduced }: { concept: Concept; onPick: () => void; entering: boolean; flash: boolean; label: string; reduced: boolean }) {
  const muscles = useMemo(() => workoutMuscles(concept.items.map((it) => it.id)), [concept]);
  const [info, setInfo] = useState(false);
  // PLAN 3.5w: the press shows even on the quickest tap: it holds for a beat after the finger lifts
  // (motion.ts DUR.press), so the card is seen answering before it grows into the deck.
  const [pressed, setPressed] = useState(false);
  const release = useRef(0);
  useEffect(() => () => window.clearTimeout(release.current), []);
  const press = (on: boolean, hold = 0) => {
    window.clearTimeout(release.current);
    if (on || !hold) setPressed(on);
    else release.current = window.setTimeout(() => setPressed(false), hold);
  };
  return (
    // The card is the pick button; the info button sits in its corner as a sibling (never a button in a button).
    <div
      className={styles.wrap}
      data-testid={`concept-${concept.id}`}
      data-concept={concept.id}
      data-key={cardKey(concept)}
      data-entering={entering || undefined}
      data-flash={flash || undefined}
      data-reduced={reduced || undefined}
      data-pressed={pressed || undefined}
    >
      <button
        type="button"
        className={`${styles.concept} pressable`}
        onClick={onPick}
        onPointerDown={() => press(true)}
        onPointerUp={() => press(false, DUR.press)}
        onPointerCancel={() => press(false)}
        onPointerLeave={() => press(false)}
        data-testid="concept-pick"
      >
        <span className={styles.conceptText}>
          <span className={styles.conceptTitle} data-testid="concept-title">
            {label}
          </span>
          <span className={styles.conceptLine} data-testid="concept-why">
            {concept.line}
          </span>
          <span className={`${styles.conceptMeta} num`} data-testid="concept-meta">
            {/* 3.5d (11): a break never starts a line with a dot, and "~28 min" never splits. */}
            {countLine(concept.items, concept.minutes)
              .split(' · ')
              .map((part, i, all) => (
                <Fragment key={i}>
                  {i > 0 ? ' ' : ''}
                  <span className={styles.metaPart}>
                    {part}
                    {i < all.length - 1 ? ' ·' : ''}
                  </span>
                </Fragment>
              ))}
          </span>
        </span>
        <MiniMusclePair data={muscles} className={styles.conceptMap} />
      </button>
      <button type="button" className={`${styles.info} pressable`} aria-label={`More about ${label}`} data-testid="concept-info" onClick={() => setInfo(true)}>
        <InfoIcon width={22} height={22} strokeWidth={2} aria-hidden="true" />
      </button>
      <IdeaSheet concept={concept} title={label} open={info} onClose={() => setInfo(false)} />
    </div>
  );
}
