import { Sheet } from '../../components/Sheet';
import type { PlanState } from '../../db/types';
import { estimateDayMinutes, type Plan } from '../../lib/plans';
import { dayTitle } from '../plans/planWords';
import styles from '../TodayScreen.module.css';

type Props = { open: boolean; onClose: () => void; plan: Plan; state: PlanState; onPick: (dayIndex: number) => void };

/** "Change day": pick which plan day Start opens. */
export function ChangeDaySheet({ open, onClose, plan, state, onPick }: Props) {
  const weekIndex = plan.progressionMode === 'weekly_table' ? state.weekIndex : 0;
  return (
    <Sheet open={open} onClose={onClose} label="Change day" scroll>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>Which day today?</h2>
        <div className={styles.dayChoices}>
          {plan.days.map((d, i) => (
            <button
              key={d.n}
              type="button"
              className={`${styles.dayChoice} pressable`}
              aria-current={i === state.nextDayIndex ? 'true' : undefined}
              onClick={() => onPick(i)}
            >
              <span className={styles.dayChoiceName}>{dayTitle(d.n, d.name)}</span>
              <span className={`${styles.dayChoiceTime} num`}>~{estimateDayMinutes(d, weekIndex)} min</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
