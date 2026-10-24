import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { db } from '../../db/schema';
import { finishedDetail, workoutRecords } from '../../db/history';
import { useLive } from '../../hooks/useLive';
import { formatTotal, totalLifted } from '../../lib/load';
import { FADE } from '../../components/motion';
import { exerciseNamer, setCount, workoutTitle } from '../history/historyWords';
import { TrophyIcon } from './icons';
import styles from './Finish.module.css';

const CASCADE = { type: 'spring', visualDuration: 0.26, bounce: 0.1 } as const;

/**
 * The finish screen (SPEC 21.1, minimal): how long, how many sets, total lifted, and records
 * from real history only (nothing when there is no history). Done goes back to Today.
 */
export function FinishScreen() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const detail = useLive(async () => {
    const d = await finishedDetail(sessionId);
    if (!d) return { d: null, unit: 'lb' as const, records: [] };
    const gym = await db.gyms.get(d.session.gymId);
    const records = await workoutRecords(sessionId, exerciseNamer(d.session));
    return { d, unit: gym?.unit ?? d.sets.find((s) => s.load)?.load?.unit ?? 'lb', records };
  }, [sessionId]);

  if (detail.ready && !detail.value?.d) return <Navigate to="/" replace />;
  const v = detail.value;
  const d = v?.d;

  const minutes = d ? Math.round(((d.session.endedAt ?? d.session.startedAt) - d.session.startedAt) / 60000) : 0;
  const lifted = d && v ? totalLifted(d.sets, v.unit) : 0;
  const done = () => navigate('/', { replace: true, state: { toast: `Workout saved · ${setCount(d?.sets.length ?? 0)}` } });

  const item = (i: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: FADE }
      : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { ...CASCADE, delay: 0.06 * i } };

  return (
    <div className={styles.screen}>
      <main className={styles.main} aria-label="Workout done">
        {!d || !v ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : (
          <>
            <motion.div className={styles.head} {...item(0)}>
              <p className={styles.kicker}>{workoutTitle(d.session)}</p>
              <h1 className={styles.title}>Workout done</h1>
            </motion.div>
            <div className={styles.stats}>
              <motion.div className={styles.stat} {...item(1)}>
                <span className={`${styles.value} num`} data-testid="finish-duration">
                  {minutes < 1 ? 'Under 1 min' : `${minutes} min`}
                </span>
                <span className={styles.label}>Time</span>
              </motion.div>
              <motion.div className={styles.stat} {...item(2)}>
                <span className={`${styles.value} num`} data-testid="finish-sets">
                  {d.sets.length}
                </span>
                <span className={styles.label}>{d.sets.length === 1 ? 'Set' : 'Sets'}</span>
              </motion.div>
              <motion.div className={`${styles.stat} ${styles.wide}`} {...item(3)}>
                <span className={`${styles.value} num`} data-testid="finish-total">
                  {formatTotal(lifted, v.unit)}
                </span>
                <span className={styles.label}>Total lifted</span>
              </motion.div>
            </div>
            {v.records.length > 0 && (
              <motion.section className={styles.records} aria-label="New bests" {...item(4)}>
                <h2 className={styles.recordsTitle}>New bests</h2>
                <ul className={styles.recordList}>
                  {v.records.map((r) => (
                    <li key={`${r.exerciseId}-${r.kind}`} className={styles.record} data-testid="pr-chip">
                      <span className={styles.trophy}>
                        <TrophyIcon />
                      </span>
                      <span>{r.text}</span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            )}
          </>
        )}
      </main>
      <div className={styles.footer}>
        <button type="button" className={`${styles.done} pressable`} onClick={done} disabled={!d}>
          Done
        </button>
      </div>
    </div>
  );
}
