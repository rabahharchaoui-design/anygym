import { useState, type ReactNode } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { BackButton } from '../../ui/BackButton';
import { MusclePair } from '../muscles/MuscleMap';
import type { ExerciseInfo } from '../../lib/exerciseInfo';
import { FormDemo } from './FormDemo';
import { FormTips } from './FormTips';
import { DemoViewer } from './DemoViewer';
import { useDemoPhotos } from '../../hooks/usePhotos';
import styles from './ExerciseSheet.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  info: ExerciseInfo;
  /** Drawn in place of the photos for match none: the calm equipment tile (never another exercise). */
  placeholder?: ReactNode;
  /** Opened on top of another sheet (PLAN 2.2c, SPEC 23.1 nested sheets): a glass Back button returns to it. */
  back?: { label: string; onPress: () => void };
};

/**
 * The exercise sheet (SPEC 4.4), top to bottom: form demo, muscle map, How to (up to 3 cues),
 * Watch out, Good for. Match none (SPEC 4.3): "Demo coming soon", no photos, no muscle map, and
 * only the plan's own notes as text cues.
 */
export function ExerciseSheet({ open, onClose, name, info, placeholder, back }: Props) {
  const [full, setFull] = useState(false);
  const howTo = info.cues;
  // Offline and never kept: the photos cannot load, so say so instead of a broken picture (gate s2).
  const photos = useDemoPhotos(info.demo);
  const offline = !!info.demo && photos.kind === 'none';
  return (
    <>
    <Sheet open={open} onClose={onClose} label={`How to do ${name}`} scroll>
      <div className={styles.body} data-testid="exercise-sheet" data-match={info.match}>
        {back && (
          <div className={styles.backRow}>
            <BackButton label={back.label} onPress={back.onPress} />
          </div>
        )}
        {info.demo && !offline ? (
          <FormDemo demo={info.demo} name={name} onOpen={() => setFull(true)} />
        ) : (
          <div className={styles.soon} data-testid="demo-soon">
            {placeholder}
            <p className={styles.soonText}>{offline ? 'Photos show when you are back online' : 'Demo coming soon'}</p>
          </div>
        )}
        <h2 className={styles.title}>{name}</h2>
        {info.muscles && <MusclePair data={info.muscles} />}
        {(howTo.length > 0 || info.variantNote) && (
          <section className={styles.section} aria-label="How to">
            <h3 className={styles.heading}>How to</h3>
            <FormTips note={info.variantNote} tips={howTo} testId="cues" />
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
    {info.demo && !offline && <DemoViewer open={full} onClose={() => setFull(false)} name={name} demo={info.demo} />}
    </>
  );
}
