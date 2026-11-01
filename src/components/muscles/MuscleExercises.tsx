import { useRef, useState } from 'react';
import { REGION_NAMES, type Region } from '../../lib/bodyArt';
import { exercisesLinkText } from '../../lib/muscleExercises';
import { exerciseCount, exercisesForMuscle, type MuscleExerciseRow } from '../../data/muscleExercises';
import { assetUrl, infoForCatalog } from '../../data/exerciseInfo';
import { usePlanCatalogIds } from '../../hooks/usePlanCatalogIds';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { ChevronRight, ICON_STROKE } from '../../ui/icons';
import { ExerciseSheet } from '../exercise/ExerciseSheet';
import styles from './MuscleExercises.module.css';

// PLAN 2.2c: a tapped muscle lists the catalog exercises that work it as primary, each opening its
// exercise sheet on top (nested sheets, SPEC 23.1). Only catalog data, never an invented exercise.

/** "12 exercises ›" beside the tapped muscle's name. */
export function MuscleExercisesLink({ region, onOpen }: { region: Region; onOpen: (r: Region) => void }) {
  const n = exerciseCount(region);
  const name = REGION_NAMES[region];
  return (
    <button
      type="button"
      className={`${styles.link} pressable`}
      data-testid="muscle-exercises-link"
      aria-label={n === 0 ? `Exercises for ${name}` : `${exercisesLinkText(n)} for ${name}`}
      onClick={(e) => {
        e.stopPropagation(); // never reaches the stage, which would clear the pick
        onOpen(region);
      }}
    >
      {exercisesLinkText(n)}
      <ChevronRight className={styles.linkChevron} strokeWidth={ICON_STROKE} aria-hidden="true" />
    </button>
  );
}

function Thumb({ row }: { row: MuscleExerciseRow }) {
  if (!row.thumb) return <span className={styles.thumb} aria-hidden="true" data-testid="muscle-exercise-nothumb" />;
  return (
    <picture className={styles.thumb} aria-hidden="true">
      <source type="image/webp" srcSet={assetUrl(row.thumb.webp)} />
      <img src={assetUrl(row.thumb.jpg)} alt="" width={56} height={56} loading="lazy" decoding="async" draggable={false} />
    </picture>
  );
}

/**
 * The list sheet for one muscle, and the exercise sheet a row opens. `region` null: closed. Back on
 * the exercise sheet returns here; Close here returns to the screen underneath.
 */
export function MuscleExercisesSheet({ region, onClose }: { region: Region | null; onClose: () => void }) {
  const planIds = usePlanCatalogIds();
  const [ex, setEx] = useState<{ row: MuscleExerciseRow; open: boolean } | null>(null);
  // The last muscle shown, so the sheet keeps its words while it slides away.
  const last = useRef<Region | null>(region);
  if (region) last.current = region;
  const shown = region ?? last.current;
  // No sheet (and no portal) until a muscle's list is first opened.
  if (!shown) return null;
  const rows = exercisesForMuscle(shown, planIds);
  const title = REGION_NAMES[shown];
  const closeEx = () => setEx((e) => (e ? { ...e, open: false } : e));
  return (
    <>
      <Sheet open={region !== null} onClose={onClose} label={`${title} exercises`} scroll>
        <div className={styles.body} data-testid="muscle-exercises" data-region={shown}>
          <header className={styles.head}>
            <h2 className={styles.title}>{title}</h2>
            {rows.length > 0 && <p className={styles.sub}>Exercises where it does the main work</p>}
          </header>
          {rows.length > 0 ? (
            <ul className={styles.list} aria-label={`Exercises for ${title}`}>
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`${styles.row} pressable`}
                    data-testid="muscle-exercise"
                    data-id={row.id}
                    onClick={() => setEx({ row, open: true })}
                  >
                    <Thumb row={row} />
                    <span className={styles.words}>
                      <span className={styles.name}>{row.name}</span>
                      {(row.also || row.inPlan) && (
                        <span className={styles.also} data-truncate-ok>
                          {row.inPlan && <span className={styles.plan}>In your plan</span>}
                          {row.inPlan && row.also && <span aria-hidden="true"> · </span>}
                          {row.also}
                        </span>
                      )}
                    </span>
                    <ChevronRight className={styles.chevron} strokeWidth={ICON_STROKE} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty} data-testid="muscle-exercises-empty">
              No exercises for this muscle yet
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Sheet>
      {ex && (
        <ExerciseSheet
          open={ex.open}
          onClose={closeEx}
          name={ex.row.name}
          info={infoForCatalog(ex.row.id)}
          back={{ label: `Back to ${title} exercises`, onPress: closeEx }}
        />
      )}
    </>
  );
}
