import { Link } from 'react-router-dom';
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../../lib/intake/answers';
import { ChevronRight, RunIcon } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import { runFacts, runTitle, workoutDate } from './historyWords';
import styles from './History.module.css';

/** A run among the workouts (PLAN 4.6): a run icon, what and when, distance and time. Opens the run. */
export function RunRow({ run, unit }: { run: Run; unit: DistanceUnit }) {
  const go = useNav();
  const to = `/history/run/${run.id}`;
  return (
    <li>
      <Link
        to={to}
        className={`${styles.row} pressable`}
        data-testid="history-run-row"
        onClick={(e) => {
          e.preventDefault();
          go(to);
        }}
      >
        <RunIcon className={styles.rowIcon} aria-hidden="true" width={22} height={22} />
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{runTitle(run)}</span>
          <span className={`${styles.rowSub} num`}>{workoutDate(run.startedAt)}</span>
        </span>
        <span className={`${styles.rowCount} num`}>{runFacts(run, unit)}</span>
        <ChevronRight className={styles.rowChevron} aria-hidden="true" />
      </Link>
    </li>
  );
}
