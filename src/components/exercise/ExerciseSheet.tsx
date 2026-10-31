import type { ReactNode } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { MuscleMap } from '../muscles/MuscleMap';
import type { ExerciseInfo } from '../../lib/exerciseInfo';
import { FormDemo } from './FormDemo';
import styles from './ExerciseSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  info: ExerciseInfo;
  /** Drawn in place of the photos for match none: the calm equipment tile (never another exercise). */
  placeholder?: ReactNode;
};

/**
 * The exercise sheet (SPEC 4.4), top to bottom: form demo, muscle map, How to (up to 3 cues),
 * Watch out, Good for. Match none (SPEC 4.3): "Demo coming soon", no photos, no muscle map, and
 * only the plan's own notes as text cues.
 */
export function ExerciseSheet({ open, onClose, name, info, placeholder }: Props) {
  const howTo = [...(info.variantNote ? [info.variantNote] : []), ...info.cues];
  return (
    <Sheet open={open} onClose={onClose} label={`How to do ${name}`} scroll>
      <div className={styles.body} data-testid="exercise-sheet" data-match={info.match}>
        {info.demo ? (
          <FormDemo demo={info.demo} name={name} />
        ) : (
          <div className={styles.soon} data-testid="demo-soon">
            {placeholder}
            <p className={styles.soonText}>Demo coming soon</p>
          </div>
        )}
        <h2 className={styles.title}>{name}</h2>
        {info.muscles && <MuscleMap data={info.muscles} />}
        {howTo.length > 0 && (
          <section className={styles.section} aria-label="How to">
            <h3 className={styles.heading}>How to</h3>
            <ol className={styles.cues} data-testid="cues">
              {howTo.map((c, i) => (
                <li key={i} className={styles.cue} data-variant={i === 0 && !!info.variantNote ? '' : undefined}>
                  {c}
                </li>
              ))}
            </ol>
          </section>
        )}
        {info.watchOut && (
          <section className={styles.section} aria-label="Watch out">
            <h3 className={`${styles.heading} ${styles.warn}`}>Watch out</h3>
            <p className={styles.line} data-testid="watch-out">
              {info.watchOut}
            </p>
          </section>
        )}
        {info.goodFor && (
          <section className={styles.section} aria-label="Good for">
            <h3 className={styles.heading}>Good for</h3>
            <p className={styles.line} data-testid="good-for">
              {info.goodFor}
            </p>
          </section>
        )}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Sheet>
  );
}
