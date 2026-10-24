import { Link } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/EmptyState';
import { listFinished } from '../db/history';
import { useLive } from '../hooks/useLive';
import { setCount, workoutDate, workoutTitle } from './history/historyWords';
import styles from './history/History.module.css';

/**
 * History (minimal honest version, PLAN 1.10c): every finished workout with its date, name and set
 * count; tap one to see its sets. The empty state shows only when there truly are none.
 */
export function HistoryScreen() {
  const list = useLive(() => listFinished(), []);
  const items = list.value ?? [];
  return (
    <>
      <ScreenHeader title="History" />
      {!list.ready ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : items.length === 0 ? (
        <EmptyState title="No workouts yet" next="Finish your first workout and it shows up here." />
      ) : (
        <ul className={styles.list} aria-label="Finished workouts">
          {items.map(({ session, sets }) => (
            <li key={session.id}>
              <Link to={`/history/${session.id}`} className={`${styles.row} pressable`} data-testid="history-row">
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{workoutTitle(session)}</span>
                  <span className={`${styles.rowSub} num`}>{workoutDate(session.startedAt)}</span>
                </span>
                <span className={`${styles.rowCount} num`}>{setCount(sets)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
