import { Navigate, useParams } from 'react-router-dom';
import { ScreenHeader } from '../../components/ScreenHeader';
import { IconLink } from '../../components/IconButton';
import { BackIcon } from '../../components/icons';
import { finishedDetail } from '../../db/history';
import type { WorkoutSet } from '../../db/types';
import { LoadError } from '../../components/LoadError';
import { useLive } from '../../hooks/useLive';
import { formatSetLine } from '../../lib/load';
import { exerciseNamer, setCount, workoutDate, workoutTitle } from './historyWords';
import styles from './History.module.css';

/** One finished workout: its sets per exercise, in the order they were logged. Plain rows for now. */
export function HistoryDetail() {
  const { sessionId = '' } = useParams();
  const detail = useLive(() => finishedDetail(sessionId), [sessionId]);
  if (detail.ready && !detail.error && !detail.data) return <Navigate to="/history" replace />;
  const value = detail.data;

  // Exercises in the order their first set was logged.
  const groups: Array<{ exerciseId: string; sets: WorkoutSet[] }> = [];
  for (const s of value?.sets ?? []) {
    const g = groups.find((x) => x.exerciseId === s.exerciseId);
    if (g) g.sets.push(s);
    else groups.push({ exerciseId: s.exerciseId, sets: [s] });
  }
  const nameOf = value ? exerciseNamer(value.session) : (id: string) => id;

  return (
    <>
      <ScreenHeader
        title={value ? workoutTitle(value.session) : 'Workout'}
        leading={
          <IconLink to="/history" label="Back to History">
            <BackIcon />
          </IconLink>
        }
      />
      {detail.error ? <LoadError text="Could not load this workout" onRetry={detail.retry} /> : null}
      {!value ? (
        !detail.error && <div className={styles.skeleton} aria-hidden="true" />
      ) : (
        <>
          <p className={`${styles.meta} num`} data-testid="history-meta">
            {workoutDate(value.session.startedAt)} · {setCount(value.sets.length)}
          </p>
          {groups.length === 0 ? (
            <p className={styles.meta}>No sets in this workout.</p>
          ) : (
            groups.map((g) => (
              <section key={g.exerciseId} className={styles.exercise} aria-label={nameOf(g.exerciseId)}>
                <h2 className={styles.exerciseName}>{nameOf(g.exerciseId)}</h2>
                <ol className={styles.sets}>
                  {g.sets.map((s, i) => (
                    <li key={s.id} className={styles.set} data-testid="history-set">
                      <span className={styles.setIndex}>{i + 1}</span>
                      {s.kind === 'warmup' && <span className={styles.warm}>Warm up</span>}
                      <span className="num">{formatSetLine(s)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}
