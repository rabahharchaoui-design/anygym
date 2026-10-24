import { motion, useReducedMotion } from 'motion/react';
import type { Gym, Load, WorkoutSet } from '../../db/types';
import { formatSetLine } from '../../lib/load';
import { FADE, SHEET_SPRING } from '../../components/motion';
import { SetCard, type SetDraft } from './SetCard';
import styles from './Workout.module.css';

type Props = {
  exerciseId: string;
  name: string;
  /** undefined: not known yet; the card asks "How do you load this?". */
  loadType: Load['kind'] | undefined;
  gym: Gym;
  sets: WorkoutSet[];
  expanded: boolean;
  onExpand: () => void;
  onAskLoadType: () => void;
  onLog: (draft: SetDraft) => Promise<boolean>;
  onEditSet: (set: WorkoutSet) => void;
  actionSlot?: HTMLElement | null;
};

/** One exercise in the workout: collapsed to a summary, or expanded in place with the set card. */
export function ExerciseCard({ exerciseId, name, loadType, gym, sets, expanded, onExpand, onAskLoadType, onLog, onEditSet, actionSlot }: Props) {
  const reduce = useReducedMotion();
  const summary = sets.length === 0 ? 'No sets yet' : `${sets.length} ${sets.length === 1 ? 'set' : 'sets'} · ${formatSetLine(sets[sets.length - 1]!)}`;

  return (
    <motion.section
      layout={reduce ? false : 'position'}
      transition={reduce ? FADE : SHEET_SPRING}
      className={styles.card}
      data-expanded={expanded}
      data-testid={`exercise-${exerciseId}`}
      aria-label={name}
    >
      {expanded ? (
        <h2 className={styles.cardName}>{name}</h2>
      ) : (
        <button type="button" className={`${styles.cardHead} pressable`} onClick={onExpand} aria-expanded={false}>
          <span className={styles.cardName}>{name}</span>
          <span className={`${styles.cardSummary} num`}>{summary}</span>
        </button>
      )}

      {expanded && (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={reduce ? FADE : SHEET_SPRING}
        >
          {loadType ? (
            <SetCard key={loadType} exerciseId={exerciseId} exerciseName={name} loadType={loadType} gym={gym} sets={sets} onLog={onLog} actionSlot={actionSlot} />
          ) : (
            <div className={styles.askBox}>
              <p className={styles.hint}>Tell AnyGym how this one is loaded, once.</p>
              <button type="button" className={`${styles.secondaryButton} pressable`} onClick={onAskLoadType}>
                How do you load this?
              </button>
            </div>
          )}

          {sets.length > 0 && (
            <ol className={styles.rows} aria-label="Logged sets">
              {sets.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`${styles.row} pressable`}
                    onClick={() => onEditSet(s)}
                    aria-label={`Set ${i + 1}: ${formatSetLine(s)}. Edit`}
                    data-testid="set-row"
                  >
                    <span className={`${styles.rowIndex} num`}>{i + 1}</span>
                    <span className={`${styles.rowLine} num`}>{formatSetLine(s)}</span>
                    <span className={styles.rowEdit} aria-hidden="true">
                      Edit
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      )}
    </motion.section>
  );
}
