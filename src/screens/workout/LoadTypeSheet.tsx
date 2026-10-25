import { Sheet } from '../../ui/Sheet';
import type { Load } from '../../db/types';
import { LOAD_TYPE_CHOICES } from './exerciseLoad';
import styles from './Workout.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  onPick: (kind: Load['kind']) => void;
  /** Leave choices out (import: reps are never turned into a timed hold). */
  without?: ReadonlyArray<Load['kind']>;
};

/** Asked once for an exercise whose name does not say how it is loaded (PLAN 1.7). */
export function LoadTypeSheet({ open, onClose, exerciseName, onPick, without = [] }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="How do you load this?" scroll>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>How do you load this?</h2>
        <p className={styles.sheetSub}>{exerciseName}</p>
        <div className={styles.choices}>
          {LOAD_TYPE_CHOICES.filter((c) => !without.includes(c.kind)).map((c) => (
            <button key={c.kind} type="button" className={`${styles.choice} pressable`} onClick={() => onPick(c.kind)}>
              <span className={styles.choiceLabel}>{c.label}</span>
              <span className={styles.choiceHint}>{c.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
