import { BatteryCharging } from 'lucide-react';
import type { Plan } from '../../lib/plans';
import { dayTitle } from '../plans/planWords';
import { RECOVER } from '../../lib/plan/scheduleWords';
import { Button } from '../../ui/Button';
import styles from '../TodayScreen.module.css';
import own from './DayCard.module.css';

type Props = {
  plan: Plan;
  /** The most rested day left, the one "Train anyway" picks (lib/plan/schedule.ts: anywayIndex). */
  nextIndex?: number;
  /** The title, why and "Ready tomorrow morning." (lib/plan/scheduleWords.ts): "Done for today" after a workout today, never "Rest today" then. */
  words: { title: string; line: string; ready: string } | null;
  onTrain: (dayIndex: number) => void;
};

/**
 * PLAN 3.6f: on a rotation, when every day left would hit muscles trained in the last 48 hours,
 * Today says so kindly instead of a Start: rest is part of the plan, when the next day is ready,
 * and one clear secondary way to train anyway (the rule suggests, the person decides).
 */
export function RecoveryCard({ plan, nextIndex, words, onTrain }: Props) {
  const next = nextIndex === undefined ? undefined : plan.days[nextIndex];
  return (
    <section className={styles.pick} data-testid="rotation-recovery">
      <p className={styles.planName}>{plan.name}</p>
      <h2 className={styles.pickTitle} data-testid="rotation-title">{(words ?? RECOVER).title}</h2>
      <p className={styles.pickSub} data-testid="rotation-why">
        {(words ?? RECOVER).line}
      </p>
      {words && (
        <p className={own.ready} data-testid="rotation-ready">
          <BatteryCharging aria-hidden="true" width={20} height={20} strokeWidth={2} />
          {words.ready}
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
