import { Sheet } from '../../ui/Sheet';
import type { Load } from '../../db/types';
import { LOAD_TYPE_CHOICES } from './exerciseLoad';
import { ChoiceCard } from '../../ui/ChoiceCard';
import styles from './Sheets.module.css';
import frame from './Workout.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  onPick: (kind: Load['kind']) => void;
  /** Leave choices out (import: reps are never turned into a timed hold). */
  without?: ReadonlyArray<Load['kind']>;
  /** How it is loaded now: marked with an accent check and "Current". */
  current?: Load['kind'];
  /** The kinds its equipment allows, most likely first (PLAN 3.7a, lib/loadKinds.ts); absent: every kind. */
  only?: ReadonlyArray<Load['kind']>;
};

/** Asked once for an exercise whose name does not say how it is loaded (PLAN 1.7). */
export function LoadTypeSheet({ open, onClose, exerciseName, onPick, without = [], current, only }: Props) {
  // Only the answers that can be true, in the rule's order; the current answer always stays in view.
  const allowed = only ? [...only, ...(current && !only.includes(current) ? [current] : [])] : LOAD_TYPE_CHOICES.map((c) => c.kind);
  const choices = allowed.flatMap((k) => LOAD_TYPE_CHOICES.filter((c) => c.kind === k && !without.includes(k)));
  return (
    <Sheet open={open} onClose={onClose} label="How do you load this?" scroll>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>How do you load this?</h2>
        <p className={styles.sheetSub}>{exerciseName}</p>
        <div className={styles.choices}>
          {choices.map((c) => (
            <ChoiceCard
              key={c.kind}
              label={c.label}
              hint={c.hint}
              detail={
                c.kind === current ? (
                  // The filled ring already shows it (critic P10): the word is for screen readers.
                  <span className={frame.srOnly} data-testid="load-type-current">
                    Current
                  </span>
                ) : undefined
              }
              picked={c.kind === current}
              onPress={() => onPick(c.kind)}
            />
          ))}
        </div>
      </div>
    </Sheet>
  );
}
