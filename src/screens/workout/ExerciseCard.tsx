import { motion, useReducedMotion } from 'motion/react';
import type { Gym, Load, WorkoutSet } from '../../db/types';
import { formatSetLine } from '../../lib/load';
import type { Progression } from '../../lib/progression';
import type { WorkoutEntry } from '../../lib/planWorkout';
import { FADE, SHEET_SPRING } from '../../components/motion';
import { SetCard, SetStrip, type SetDraft } from './SetCard';
import styles from './Workout.module.css';

type Props = {
  exerciseId: string;
  name: string;
  /** undefined: not known yet; the card asks "How do you load this?". */
  loadType: Load['kind'] | undefined;
  gym: Gym;
  sets: WorkoutSet[];
  /** "Last time" and "Next" from the progression engine; undefined while it loads. */
  progression?: Progression;
  expanded: boolean;
  onExpand: () => void;
  onAskLoadType: () => void;
  onLog: (draft: SetDraft) => Promise<boolean>;
  onEditSet: (set: WorkoutSet) => void;
  actionSlot?: HTMLElement | null;
  /** Plan workouts: the day's targets for this exercise (PLAN 1.10). */
  entry?: WorkoutEntry;
};

/** One exercise in the workout: one line when not current, or expanded in place with the set card. */
export function ExerciseCard({ exerciseId, name, loadType, gym, sets, progression, expanded, onExpand, onAskLoadType, onLog, onEditSet, actionSlot, entry }: Props) {
  const reduce = useReducedMotion();
  const last = sets[sets.length - 1];
  const summary = entry
    ? last
      ? `${Math.min(sets.length, entry.sets)} of ${entry.sets} · ${formatSetLine(last)}`
      : entry.line
    : last
      ? `${sets.length} ${sets.length === 1 ? 'set' : 'sets'} · ${formatSetLine(last)}`
      : 'No sets yet';
  const done = !!entry && sets.length >= entry.sets;

  return (
    <motion.section
      layout={reduce ? false : 'position'}
      transition={reduce ? FADE : SHEET_SPRING}
      className={styles.card}
      data-expanded={expanded}
      data-done={done || undefined}
      data-testid={entry?.finisher ? 'finisher' : `exercise-${exerciseId}`}
      data-exercise={exerciseId}
      aria-label={name}
    >
      {!expanded ? (
        <button type="button" className={`${styles.cardHead} pressable`} onClick={onExpand} aria-expanded={false}>
          <span className={styles.cardName}>{name}</span>
          <span className={`${styles.cardSummary} num`}>{summary}</span>
        </button>
      ) : (
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={reduce ? FADE : SHEET_SPRING}
        >
          {loadType ? (
            progression && (
            <SetCard
              key={`${loadType}-${progression.lastTime?.date ?? 'none'}`}
              exerciseId={exerciseId}
              exerciseName={name}
              loadType={loadType}
              gym={gym}
              sets={sets}
              progression={progression}
              onLog={onLog}
              onEditSet={onEditSet}
              actionSlot={actionSlot}
              entry={entry}
            />
            )
          ) : (
            <div className={styles.askBox}>
              <h2 className={styles.cardName}>{name}</h2>
              {entry && (
                <p className={`${styles.planLine} num`} data-testid="set-plan">
                  {entry.note && <span className={styles.planNote}>{entry.note} · </span>}
                  {entry.line}
                </p>
              )}
              <p className={styles.hint}>Tell AnyGym how this one is loaded, once.</p>
              <button type="button" className={`${styles.secondaryButton} pressable`} onClick={onAskLoadType}>
                How do you load this?
              </button>
              {sets.length > 0 && <SetStrip sets={sets} onEdit={onEditSet} />}
            </div>
          )}
        </motion.div>
      )}
    </motion.section>
  );
}
