import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import type { BarId, Gym, Load, WorkoutSet } from '../../db/types';
import { RepsStepper } from './RepsStepper';
import { SetLoadInput } from './SetLoadInput';
import styles from './Workout.module.css';

type Props = {
  set: WorkoutSet | null;
  index: number;
  exerciseName: string;
  loadType: Load['kind'] | undefined;
  gym: Gym;
  onClose: () => void;
  onSave: (set: WorkoutSet, change: { reps?: number; seconds?: number; load: Load }) => Promise<void>;
  /** Resolves once the delete is written (or failed; the screen reports it). */
  onDelete: (set: WorkoutSet) => Promise<void>;
  /** Barbell: the bar picked for this exercise at this gym (PLAN 1.10d). */
  bar?: BarId;
};

/** Tap a logged set: the same inputs in a sheet, with Save and Delete (undo lives in the toast). */
export function EditSetSheet({ set, index, exerciseName, loadType, gym, onClose, onSave, onDelete, bar }: Props) {
  return (
    <Sheet open={set !== null} onClose={onClose} label="Edit set" scroll>
      {set && <EditBody key={set.id} set={set} index={index} exerciseName={exerciseName} loadType={loadType ?? set.load?.kind} gym={gym} onSave={onSave} onDelete={onDelete} bar={bar} />}
    </Sheet>
  );
}

function EditBody({
  set,
  index,
  exerciseName,
  loadType,
  gym,
  onSave,
  onDelete,
  bar,
}: Omit<Props, 'set' | 'onClose' | 'loadType'> & { set: WorkoutSet; loadType: Load['kind'] | undefined }) {
  const [load, setLoad] = useState<Load | null>(set.load ?? null);
  const [reps, setReps] = useState(set.reps ?? 1);
  const [seconds, setSeconds] = useState(set.seconds ?? 1);
  // Save and Delete never run together (PLAN 1.10d): while one runs, the other is disabled.
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const timed = loadType === 'timed' || (set.reps === undefined && set.seconds !== undefined);
  // The set's own load kind decides the input, so an old set never shows in a different input.
  const kind = set.load?.kind ?? loadType;
  const sameUnit = !set.load || set.load.unit === gym.unit;

  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  const run = async (what: 'save' | 'delete', write: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(what);
    try {
      await write();
    } finally {
      running.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  const save = () => (load ? run('save', () => onSave(set, timed ? { seconds, load } : { reps, load })) : undefined);
  const remove = () => run('delete', () => onDelete(set));

  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>Set {index + 1}</h2>
      <p className={styles.sheetSub}>{exerciseName}</p>

      {kind && !timed && sameUnit && (
        <SetLoadInput
          loadType={kind}
          gym={gym}
          exerciseId={set.exerciseId}
          exerciseName={exerciseName}
          value={load}
          onChange={setLoad}
          bar={bar}
          ownBar={set.load?.kind === 'barbell' || set.load?.kind === 'plate_machine' ? set.load.barWeight : undefined}
          ownBarId={set.load?.kind === 'barbell' ? set.load.barId : undefined}
        />
      )}
      {timed ? (
        <RepsStepper label="Seconds" unit="seconds" value={seconds} onChange={setSeconds} max={3600} />
      ) : (
        <RepsStepper value={reps} onChange={setReps} />
      )}

      <button
        type="button"
        className={`${styles.logButton} pressable`}
        disabled={!load || busy !== null}
        aria-disabled={!load || busy !== null}
        aria-busy={busy === 'save'}
        onClick={() => void save()}
      >
        Save
      </button>
      <button
        type="button"
        className={`${styles.deleteButton} pressable`}
        disabled={busy !== null}
        aria-disabled={busy !== null}
        aria-busy={busy === 'delete'}
        onClick={() => void remove()}
      >
        Delete set
      </button>
    </div>
  );
}
