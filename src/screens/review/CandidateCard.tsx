import { DeckPhoto } from '../../components/deck/DeckFace';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import { EQUIPMENT_LABEL } from '../../lib/intake/options';
import { GROUP_WORDS, candidateMuscles, gearLine } from '../../lib/candidates/view';
import type { CandidateRecord } from '../../lib/candidates/types';
import { CheckIcon, XIcon } from '../../ui/icons';
import deck from '../../components/deck/Deck.module.css';
import styles from './CandidateReview.module.css';

// One candidate's review card (PLAN 3.5e): its own two photo demo (never another move's), its name,
// its gear and its muscles (mini map and the text line). PLAN 3.5i: the whole card washes accent (ice blue, 3.5t) as it
// goes right (approve) and red as it goes left (wrong), and a "Check carefully" card says why.
export function CandidateCard({ c, under, note }: { c: CandidateRecord; under: boolean; note?: string }) {
  const muscles = candidateMuscles(c);
  return (
    <>
      <DeckPhoto demo={{ webp: c.images.webp, jpg: c.images.jpg }} none="Photos when you are back online" />
      <div className={deck.cardBody}>
        {note && (
          <p className={styles.note} data-testid={under ? undefined : 'candidate-note'}>
            <b>Check carefully.</b> {note}
          </p>
        )}
        <p className={deck.cardEyebrow}>{GROUP_WORDS[c.pattern]}</p>
        <h2 className={deck.cardName} data-testid={under ? undefined : 'candidate-name'}>
          {c.name}
        </h2>
        <p className={styles.gear} data-testid={under ? undefined : 'candidate-gear'}>
          {gearLine(c, EQUIPMENT_LABEL)}
        </p>
        <div className={styles.muscles}>
          <MiniMusclePair data={muscles} className={styles.map} />
          <span className={styles.muscleText} data-testid={under ? undefined : 'candidate-muscles'}>
            {muscles?.text}
          </span>
        </div>
      </div>
      {/* The drag sets --keep and --swap on the card (SwipeDeck); over everything, so the answer reads at once. */}
      <span className={styles.wash} data-side="keep" aria-hidden="true" />
      <span className={styles.wash} data-side="swap" aria-hidden="true" />
      <span className={deck.cue} data-side="keep" aria-hidden="true">
        <CheckIcon width={26} height={26} strokeWidth={3} />
      </span>
      <span className={`${deck.cue} ${styles.wrongCue}`} data-side="swap" aria-hidden="true">
        <XIcon width={26} height={26} strokeWidth={3} />
      </span>
    </>
  );
}
