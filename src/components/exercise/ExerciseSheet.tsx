import { useState, type ReactNode } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
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
 * The exercise sheet (SPEC 4.4), top to bottom: a compact form demo, the name, the muscle map, How
 * to (up to 3 cues), Watch out and Good for. PLAN 2.2e round 2 (Codex 2.0k #3, SPEC 4.4 wins): the
 * SPEC order, with the demo and the muscle pair sized down so the first How to cue still shows in
 * the first screen on every phone (ui-2.2c #2); Back (a nested sheet) and
 * Close stay pinned, never scrolled away (#3). Match none (SPEC 4.3): "Demo coming soon", no photos,
 * no muscle map, and only the plan's own notes as text cues.
 */
export function ExerciseSheet({ open, onClose, name, info, placeholder, back }: Props) {
  const [full, setFull] = useState(false);
  const howTo = info.cues;
  // Offline and never kept: the photos cannot load, so say so instead of a broken picture (gate s2).
  const photos = useDemoPhotos(info.demo);
  const offline = !!info.demo && photos.kind === 'none';
  return (
    <>
    <Sheet open={open} onClose={onClose} label={`How to do ${name}`} scroll footer header={back ? <BackButton label={back.label} onPress={back.onPress} /> : undefined}>
      <div className={styles.body} data-testid="exercise-sheet" data-match={info.match}>
        {info.demo && !offline ? (
          <FormDemo demo={info.demo} name={name} onOpen={() => setFull(true)} fit />
        ) : (
          <div className={styles.soon} data-testid="demo-soon">
            {placeholder}
            <p className={styles.soonText}>{offline ? 'Photos show when you are back online' : 'Demo coming soon'}</p>
          </div>
        )}
        <h2 className={styles.title}>{name}</h2>
        {info.muscles && <MusclePair data={info.muscles} compact />}
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
        <SheetFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </div>
    </Sheet>
    {info.demo && !offline && <DemoViewer open={full} onClose={() => setFull(false)} name={name} demo={info.demo} />}
    </>
  );
}
