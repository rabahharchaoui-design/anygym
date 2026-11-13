import type { Plan } from '../../lib/plans';
import { dayTitle } from '../plans/planWords';
import { Button } from '../../ui/Button';
import styles from '../TodayScreen.module.css';
import own from './DayCard.module.css';

type Props = {
  plan: Plan;
  /** The next day in order, the one "Train anyway" picks. */
  nextIndex?: number;
  /** When the first day left is rested (lib/plan/schedule.ts). */
  readyAt?: number;
  onTrain: (dayIndex: number) => void;
};

/**
 * PLAN 3.6f: on a rotation, when every day left would hit muscles trained in the last 48 hours,
 * Today says so kindly instead of a Start: rest is part of the plan, when the next day is ready,
 * and one clear secondary way to train anyway (the rule suggests, the person decides).
 */
export function RecoveryCard({ plan, nextIndex, readyAt, onTrain }: Props) {
  const next = nextIndex === undefined ? undefined : plan.days[nextIndex];
  return (
    <section className={styles.pick} data-testid="rotation-recovery">
      <p className={styles.planName}>{plan.name}</p>
      <h2 className={styles.pickTitle}>Time to recover</h2>
      <p className={styles.pickSub}>You trained these muscles in the last 48 hours. Rest today is part of the plan, and your next workout keeps its place.</p>
      {readyAt !== undefined && (
        <p className={`${own.ready} num`} data-testid="rotation-ready">
          Ready again {new Date(readyAt).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.
        </p>
      )}
      {next && nextIndex !== undefined && (
        <div className={own.anyway}>
          <Button variant="secondary" data-testid="rotation-train-anyway" onClick={() => onTrain(nextIndex)}>
            Train anyway
          </Button>
          <p className={own.anywayNote}>{dayTitle(next.n, next.name)}</p>
        </div>
      )}
    </section>
  );
}
