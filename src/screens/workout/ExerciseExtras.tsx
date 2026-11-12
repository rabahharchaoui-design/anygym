import { memo } from 'react';
import type { ExerciseInfo } from '../../lib/exerciseInfo';
import { MusclePair } from '../../components/muscles/MuscleMap';
import { FormTips } from '../../components/exercise/FormTips';
import styles from './ExerciseExtras.module.css';

type Props = {
  info: ExerciseInfo;
  /** The exercise has a sure demo that can show (then no "coming soon" line). */
  photosOk: boolean;
  /** Its load type is known (the table shows). */
  known: boolean;
};

/**
 * Below the set table (PLAN 2.2b): the muscles and the form tips, only when sure. PLAN 2.2d: its own
 * lazily loaded chunk, mounted after the table's first paint and memoized, so a tap on a row never
 * re-renders the body maps.
 */
function ExerciseExtras({ info, photosOk, known }: Props) {
  // Form tips: the catalog's own cues (a variant's difference first), only for a sure match.
  const sure = info.match === 'exact' || info.match === 'variant';
  const tips = sure ? info.cues.slice(0, 3) : [];
  const variantNote = sure ? info.variantNote : null;
  return (
    <>
      {info.muscles && (
        <section className={`${styles.card} ${styles.arrive}`} aria-label="Muscles" data-testid="muscle-card">
          <MusclePair data={info.muscles} exercises />
        </section>
      )}
      {(tips.length > 0 || variantNote) && (
        <section className={`${styles.card} ${styles.arrive}`} aria-label="How to" data-testid="form-tips">
          <h3 className={styles.cardHeading}>How to</h3>
          <FormTips note={variantNote} tips={tips} />
          {/* The catalog's watch out and good for lines, when it has them: on the page, nothing hidden. */}
          {sure && info.watchOut && (
            <div className={styles.extra}>
              <h3 className={`${styles.cardHeading} ${styles.warnHeading}`}>Watch out</h3>
              <p className={styles.extraLine} data-testid="watch-out">
                {info.watchOut}
              </p>
            </div>
          )}
          {sure && info.goodFor && (
            <div className={styles.extra}>
              <h3 className={styles.cardHeading}>Good for</h3>
              <p className={styles.extraLine} data-testid="good-for">
                {info.goodFor}
              </p>
            </div>
          )}
        </section>
      )}
      {/* Nothing sure to show: an honest card, never a guessed step or muscle (SPEC 0, 4.3). */}
      {!photosOk && !info.muscles && tips.length === 0 && known && (
        <p className={styles.unknown} data-testid="no-demo">
          Form guide coming soon. We only show form we're sure of.
        </p>
      )}
    </>
  );
}

export default memo(ExerciseExtras);
