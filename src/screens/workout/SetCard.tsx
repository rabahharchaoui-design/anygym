import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gym, Load, WorkoutSet } from '../../db/types';
import { newId } from '../../db/ids';
import { machineStartFor } from '../../db/gyms';
import { barbellLoad, bodyweightLoad, formatSetLine, plateMachineLoad, timedLoad } from '../../lib/load';
import { useTapGuard } from '../../hooks/useTapGuard';
import { barIdFor, machineIdFor, reusable } from './exerciseLoad';
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
  onLog: (draft: SetDraft) => Promise<boolean>;
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

/** SPEC 5.1 set card: target, the honest first time line, the load input, reps and Log set. */
export function SetCard({ exerciseId, exerciseName, loadType, gym, sets, onLog, actionSlot }: Props) {
  const last = sets[sets.length - 1];
  const [load, setLoad] = useState<Load | null>(
    () => reusable(last?.load, loadType, gym) ?? startingLoad(loadType, gym, exerciseId, exerciseName),
  );
  const [reps, setReps] = useState(last?.reps ?? DEFAULT_REPS);
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

  const hint = timed
    ? null
    : loadType === 'bodyweight'
      ? 'First time: stop when you could do 2 more reps'
      : 'First time: pick a weight you could lift 2 more reps with';

  const blocked =
    load !== null ? (timed ? 'Start the timer' : null) : loadType === 'barbell' ? 'Set the bar weight first' : loadType === 'plate_machine' ? 'Set the starting weight first' : 'Pick a weight';

  const action = (
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
  );

  return (
    <div className={styles.setCard}>
      <p className={`${styles.target} num`} data-testid="set-target">
        Set {sets.length + 1}
      </p>
      {hint && <p className={styles.hint}>{hint}</p>}

      <SetLoadInput
        key={timed ? timerKey : 'load'}
        loadType={loadType}
        gym={gym}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        value={load}
        onChange={setLoad}
        onSeconds={setSeconds}
      />

      {!timed && <RepsStepper value={reps} onChange={setReps} />}

      {actionSlot ? createPortal(action, actionSlot) : action}
    </div>
  );
}
