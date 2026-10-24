import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gym, Load, WorkoutSet } from '../../db/types';
import { newId } from '../../db/ids';
import { machineStartFor } from '../../db/gyms';
import { barbellLoad, bodyweightLoad, formatSetLine, plateMachineLoad, timedLoad } from '../../lib/load';
import { useTapGuard } from '../../hooks/useTapGuard';
import { Hint } from '../../components/hint/Hint';
import { barIdFor, machineIdFor, prefillLoad } from './exerciseLoad';
import { RepsStepper } from './RepsStepper';
import { SetLoadInput } from './SetLoadInput';
import styles from './Workout.module.css';

export type SetDraft = { id: string; reps?: number; seconds?: number; load: Load };

type Props = {
  exerciseId: string;
  exerciseName: string;
  loadType: Load['kind'];
  gym: Gym;
  /** This exercise's sets in this workout, logged order. */
  sets: WorkoutSet[];
  /** The last set of this exercise in the most recent earlier workout, if any. */
  previous?: WorkoutSet;
  onLog: (draft: SetDraft) => Promise<boolean>;
  onEditSet: (set: WorkoutSet) => void;
  /** The sticky bar at the bottom of the workout screen; Log set renders there so it is always in reach. */
  actionSlot?: HTMLElement | null;
};

export const DEFAULT_REPS = 10;

/** What the input shows before anything is picked: only loads that are certain (an empty bar, just you). */
function startingLoad(loadType: Load['kind'], gym: Gym, exerciseId: string, exerciseName: string): Load | null {
  switch (loadType) {
    case 'barbell':
      return barbellLoad(gym.bars[barIdFor(exerciseName)], [], gym.collars, gym.unit);
    case 'plate_machine':
      return plateMachineLoad(machineStartFor(gym, machineIdFor(exerciseId, exerciseName)), [], gym.unit);
    case 'bodyweight':
      return bodyweightLoad(gym.unit);
    case 'timed':
      return timedLoad(gym.unit);
    default:
      return null;
  }
}

/** The line under the name: what you did last, or the honest first time advice. Real data only. */
function guideLine(loadType: Load['kind'], last: WorkoutSet | undefined, previous: WorkoutSet | undefined): string | null {
  if (last) return `Last set: ${formatSetLine(last)}`;
  if (previous) return `Last time: ${formatSetLine(previous)}`;
  if (loadType === 'timed') return null;
  return loadType === 'bodyweight'
    ? 'First time: stop when you could do 2 more reps'
    : 'First time: pick a weight you could lift 2 more reps with';
}

/**
 * SPEC 5.1 / 13.5 set card, sized to fit one screen: name and set number, one guide line, the
 * logged sets as a strip, the compact load input, reps, and Log set in the thumb zone. Weight and
 * reps are prefilled from the last set (this workout, else the last one), so a repeat is one tap.
 */
export function SetCard({ exerciseId, exerciseName, loadType, gym, sets, previous, onLog, onEditSet, actionSlot }: Props) {
  const last = sets[sets.length - 1];
  const source = last ?? previous;
  const [load, setLoad] = useState<Load | null>(
    () => prefillLoad(source?.load, loadType, gym, exerciseId, exerciseName) ?? startingLoad(loadType, gym, exerciseId, exerciseName),
  );
  const [reps, setReps] = useState(source?.reps ?? DEFAULT_REPS);
  const [seconds, setSeconds] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const pendingId = useRef(newId());
  const busy = useRef(false);
  const timed = loadType === 'timed';

  const ready = load !== null && (timed ? seconds > 0 : reps > 0);

  const log = useTapGuard(async () => {
    if (!ready || busy.current) return;
    busy.current = true;
    const draft: SetDraft = timed ? { id: pendingId.current, seconds, load } : { id: pendingId.current, reps, load };
    try {
      if (await onLog(draft)) {
        pendingId.current = newId();
        if (timed) {
          setSeconds(0);
          setTimerKey((k) => k + 1);
        }
      }
    } finally {
      busy.current = false;
    }
  });

  const line = guideLine(loadType, last, previous);

  const blocked =
    load !== null
      ? timed
        ? 'Start the timer'
        : null
      : loadType === 'barbell'
        ? 'Set the bar weight first'
        : loadType === 'plate_machine'
          ? 'Set the starting weight first'
          : 'Pick a weight';

  const action = (
    <div className={styles.actionWrap}>
      <Hint id="setCard" className={styles.actionHint} point="down" />
      <button type="button" className={`${styles.logButton} pressable`} disabled={!ready} onClick={() => void log()}>
        {ready ? (
          <>
            Log set
            <span className={`${styles.logWhat} num`}> · {formatSetLine(timed ? { seconds, load } : { reps, load })}</span>
          </>
        ) : (
          (blocked ?? 'Log set')
        )}
      </button>
    </div>
  );

  return (
    <div className={styles.setCard}>
      <div className={styles.setHead}>
        <h2 className={styles.cardName}>{exerciseName}</h2>
        <p className={`${styles.target} num`} data-testid="set-target">
          Set {sets.length + 1}
        </p>
      </div>
      {line && (
        <p className={`${styles.guide} num`} data-testid="set-guide">
          {line}
        </p>
      )}
      {sets.length > 0 && <SetStrip sets={sets} onEdit={onEditSet} />}

      <SetLoadInput
        key={timed ? timerKey : 'load'}
        loadType={loadType}
        gym={gym}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        value={load}
        onChange={setLoad}
        onSeconds={setSeconds}
        compact
      />

      {!timed && <RepsStepper value={reps} onChange={setReps} compact />}

      {actionSlot ? createPortal(action, actionSlot) : action}
    </div>
  );
}

/** Logged sets as one row of small chips (newest last); tap one to edit it. Scrolls sideways, never down. */
export function SetStrip({ sets, onEdit }: { sets: WorkoutSet[]; onEdit: (set: WorkoutSet) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  // Keep the newest chip in view.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [sets.length]);
  return (
    <ol ref={ref} className={styles.strip} aria-label="Logged sets">
      {sets.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            className={`${styles.chip} pressable`}
            onClick={() => onEdit(s)}
            aria-label={`Set ${i + 1}: ${formatSetLine(s)}. Edit`}
            data-testid="set-row"
          >
            <span className={styles.chipPill}>
              <span className={styles.chipIndex}>{i + 1}</span>
              <span className="num">{formatSetLine(s)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
