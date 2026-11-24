import { Link } from 'react-router-dom';
import { TopBar } from '../ui/TopBar';
import { Skeleton } from '../ui/Skeleton';
import { useNav } from '../ui/nav';
import { LoadError } from '../components/LoadError';
import { listFinished } from '../db/history';
import { useLive } from '../hooks/useLive';
import { useFinishedRuns } from '../hooks/useRuns';
import { historyFeed, thisWeekLine } from './history/historyFeed';
import { HistoryRow } from './history/HistoryRow';
import { HistoryEmpty } from './history/HistoryEmpty';
import { RunRow } from './history/RunRow';
import { importNumbers, workoutDate, workoutFacts, workoutTitle } from './history/historyWords';
import styles from './history/History.module.css';

/**
 * History (minimal honest version, PLAN 1.10c): every finished workout with its date, name and set
 * count; tap one to see its sets. The empty state shows only when there truly are none: a failed
 * read (workouts or runs) says so with Try again and keeps the last list it had (PLAN 1.7f, 4.6a).
 */
export function HistoryScreen() {
  const list = useLive(() => listFinished(), []);
  const go = useNav();
  const runsRead = useFinishedRuns();
  const items = list.data ?? [];
  const runs = runsRead.data?.runs ?? [];
  const unit = runsRead.data?.unit ?? 'km';
  const retryReads = () => {
    if (list.error) list.retry();
    if (runsRead.error) runsRead.retry();
  };
  const numbers = importNumbers(items.map((x) => x.session));
  const feed = historyFeed(items, runs);
  const imported = feed.imported;
  const row = ({ session, sets }: (typeof items)[number]) => {
    const no = numbers.get(session.id);
    const sub = session.imported ? (no ? `Workout ${no.n} of ${no.of}` : '') : workoutDate(session.startedAt);
    const note =
      session.imported && session.note ? (
        <span className={styles.rowNote} data-testid="history-note">
          {session.note}
        </span>
      ) : null;
    return <HistoryRow key={session.id} to={`/history/${session.id}`} testId="history-row" title={workoutTitle(session)} sub={sub} note={note} facts={workoutFacts(session, sets)} />;
  };
  const hasRows = feed.dated.length > 0 || imported.length > 0;
  return (
    <>
      <TopBar
        title="History"
        giant
        trailing={
          runs.length > 0 && hasRows ? (
            <Link
              to="/history/runs"
              className={`${styles.runsLink} pressable`}
              data-testid="history-runs-link"
              onClick={(e) => {
                e.preventDefault();
                go('/history/runs');
              }}
            >
              Run records and heatmap
            </Link>
          ) : undefined
        }
      >
        {feed.dated.length > 0 && (
          <p className={`${styles.week} num`} data-testid="history-week">
            {thisWeekLine(feed.dated, Date.now())}
          </p>
        )}
      </TopBar>
      {/* PLAN 4.6a: a failed runs read is said too, never shown as "no runs". One line, one Try again for both reads. */}
      {list.error || runsRead.error ? <LoadError text={list.error ? 'Could not load workouts' : 'Could not load runs'} onRetry={retryReads} /> : null}
      {!list.ready || !runsRead.ready ? (
        <Skeleton height={76} />
      ) : (list.error || runsRead.error) && items.length === 0 && runs.length === 0 ? null : feed.dated.length === 0 && imported.length === 0 ? (
        <HistoryEmpty onStart={() => go('/', { kind: 'tab' })} />
      ) : (
        <>
          {feed.dated.length > 0 && (
            <ul className={styles.list} aria-label="Finished workouts and runs">
              {feed.dated.map((d) => (d.kind === 'run' ? <RunRow key={d.run.id} run={d.run} unit={unit} /> : row(d.workout)))}
            </ul>
          )}
          {imported.length > 0 && (
            <section className={styles.group} aria-label="Imported workouts">
              {/* Imported workouts have no dates (SPEC 9.3): one heading says so, once. */}
              <h2 className={styles.groupTitle}>Imported · no dates</h2>
              <ul className={styles.list}>{imported.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
