import { DeckCues, DeckPhoto } from '../../components/deck/DeckFace';
import { MiniMusclePair } from '../../components/muscles/MuscleMap';
import { EQUIPMENT_LABEL } from '../../lib/intake/options';
import { GROUP_WORDS, candidateMuscles, gearLine } from '../../lib/candidates/view';
import type { CandidateRecord } from '../../lib/candidates/types';
import { CheckIcon, XIcon } from '../../ui/icons';
import deck from '../../components/deck/Deck.module.css';
import styles from './CandidateReview.module.css';

// One candidate's review card (PLAN 3.5e): its own two photo demo (never another move's), its name,
// its gear and its muscles (mini map and the text line). Right approves (accent ✓), left is wrong (✕).
export function CandidateCard({ c, under }: { c: CandidateRecord; under: boolean }) {
  const muscles = candidateMuscles(c);
  return (
    <>
      <DeckPhoto demo={{ webp: c.images.webp, jpg: c.images.jpg }} none="Photos when you are back online" />
      <DeckCues keep={<CheckIcon width={26} height={26} strokeWidth={3} />} swap={<XIcon width={26} height={26} strokeWidth={3} />} />
      <div className={deck.cardBody}>
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
    </>
  );
}
