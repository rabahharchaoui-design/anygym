import { Link } from 'react-router-dom';
import { TopBar } from '../ui/TopBar';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { ChevronRight } from '../ui/icons';
import { useNav } from '../ui/nav';
import { LoadError } from '../components/LoadError';
import { listFinished } from '../db/history';
import { useLive } from '../hooks/useLive';
import { setCount, workoutDate, workoutTitle } from './history/historyWords';
import styles from './history/History.module.css';

/**
 * History (minimal honest version, PLAN 1.10c): every finished workout with its date, name and set
 * count; tap one to see its sets. The empty state shows only when there truly are none: a failed
 * read says so with Try again and keeps the last list it had (PLAN 1.7f).
 */
export function HistoryScreen() {
  const list = useLive(() => listFinished(), []);
  const go = useNav();
  const items = list.data ?? [];
  return (
    <>
      <TopBar title="History" />
      {list.error ? <LoadError text="Could not load workouts" onRetry={list.retry} /> : null}
      {!list.ready ? (
        <Skeleton height={76} radius={20} />
      ) : list.error && items.length === 0 ? null : items.length === 0 ? (
        <EmptyState
          art="history"
          title="No workouts yet"
          next="Finish your first workout and it shows up here."
          action={{ label: 'Go to Today', onPress: () => go('/', { kind: 'tab' }) }}
        />
      ) : (
        <ul className={styles.list} aria-label="Finished workouts">
          {items.map(({ session, sets }) => (
            <li key={session.id}>
              <Link
                to={`/history/${session.id}`}
                className={`${styles.row} pressable`}
                data-testid="history-row"
                onClick={(e) => {
                  e.preventDefault();
                  go(`/history/${session.id}`);
                }}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{workoutTitle(session)}</span>
                  <span className={`${styles.rowSub} num`}>{workoutDate(session.startedAt)}</span>
                </span>
                <span className={`${styles.rowCount} num`}>{setCount(sets)}</span>
                <ChevronRight className={styles.rowChevron} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
