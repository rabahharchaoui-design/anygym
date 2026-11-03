import { Sheet } from '../../ui/Sheet';
import type { Load } from '../../db/types';
import { LOAD_TYPE_CHOICES } from './exerciseLoad';
import { Cable, Dumbbell, Hand, Layers, PersonStanding, Timer, Weight } from 'lucide-react';
import { ChoiceCard } from '../../ui/ChoiceCard';

/** One line icon per way of loading (Lucide, SPEC 23.2). */
const LOAD_ICONS: Record<Load['kind'], typeof Weight> = {
  barbell: Weight,
  dumbbell_each: Dumbbell,
  single: Hand,
  stack: Cable,
  plate_machine: Layers,
  bodyweight: PersonStanding,
  timed: Timer,
};
import styles from './Workout.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  exerciseName: string;
  onPick: (kind: Load['kind']) => void;
  /** Leave choices out (import: reps are never turned into a timed hold). */
  without?: ReadonlyArray<Load['kind']>;
  /** How it is loaded now: marked with a lime check and "Current". */
  current?: Load['kind'];
};

/** Asked once for an exercise whose name does not say how it is loaded (PLAN 1.7). */
export function LoadTypeSheet({ open, onClose, exerciseName, onPick, without = [], current }: Props) {
  return (
    <Sheet open={open} onClose={onClose} label="How do you load this?" scroll>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>How do you load this?</h2>
        <p className={styles.sheetSub}>{exerciseName}</p>
        <div className={styles.choices}>
          {LOAD_TYPE_CHOICES.filter((c) => !without.includes(c.kind)).map((c) => (
            <ChoiceCard
              key={c.kind}
              icon={LOAD_ICONS[c.kind]}
              label={c.label}
              hint={c.hint}
              detail={
                c.kind === current ? (
                  <span className={styles.choiceCurrent} data-testid="load-type-current">
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
