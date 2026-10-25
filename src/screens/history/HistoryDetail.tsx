import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { Skeleton } from '../../ui/Skeleton';
import { finishedDetail } from '../../db/history';
import { db } from '../../db/schema';
import type { WorkoutSet } from '../../db/types';
import { LoadError } from '../../components/LoadError';
import { useLive } from '../../hooks/useLive';
import { formatSetLine, formatTotal, totalLifted } from '../../lib/load';
import { isImportOrder } from '../../lib/import/importOrder';
import { exerciseNamer, setCount, workoutDate, workoutTitle } from './historyWords';
import styles from './History.module.css';

/** One finished workout: its sets per exercise, in the order they were logged. Plain rows for now. */
export function HistoryDetail() {
  const { sessionId = '' } = useParams();
  const detail = useLive(async () => {
    const d = await finishedDetail(sessionId);
    if (!d) return undefined;
    const gym = await db.gyms.get(d.session.gymId);
    return { ...d, unit: gym?.unit ?? d.sets.find((s) => s.load)?.load?.unit };
  }, [sessionId]);
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
  // Time and total lifted, only when known: imported workouts have no times (SPEC 9.3).
  const s = value?.session;
  const minutes = s && s.endedAt !== undefined && !s.imported && !isImportOrder(s.startedAt) ? Math.round((s.endedAt - s.startedAt) / 60000) : null;
  const lifted = value?.unit ? totalLifted(value.sets.filter((x) => x.kind !== 'warmup'), value.unit) : 0;
  const meta = value
    ? [
        workoutDate(value.session.startedAt),
        setCount(value.sets.length),
        ...(minutes !== null ? [minutes < 1 ? '<1 min' : `${minutes} min`] : []),
        // Dumbbells count both hands: say so, so the number is never a surprise.
        ...(lifted > 0 && value.unit ? [`${formatTotal(lifted, value.unit)} lifted${value.sets.some((x) => x.kind !== 'warmup' && x.load?.kind === 'dumbbell_each') ? ' (both hands)' : ''}`] : []),
      ].join(' · ')
    : '';

  return (
    <>
      <TopBar title={value ? workoutTitle(value.session) : 'Workout'} leading={<BackButton to="/history" label="Back to History" />}>
        {value && (
          <p className={`${styles.meta} num`} data-testid="history-meta">
            {meta}
          </p>
        )}
      </TopBar>
      {detail.error ? <LoadError text="Could not load this workout" onRetry={detail.retry} /> : null}
      {!value ? (
        !detail.error && <Skeleton height={180} radius={20} />
      ) : (
        <>
          {groups.length === 0 ? (
            <p className={styles.meta}>No sets in this workout.</p>
          ) : (
            groups.map((g) => (
              <section key={g.exerciseId} className={styles.exercise} aria-label={nameOf(g.exerciseId)}>
                {/* The title already names a one exercise workout: no second time on the card. */}
                {!(groups.length === 1 && nameOf(g.exerciseId) === workoutTitle(value.session)) && <h2 className={styles.exerciseName}>{nameOf(g.exerciseId)}</h2>}
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
