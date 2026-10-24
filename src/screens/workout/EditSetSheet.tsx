import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import type { Gym, Load, WorkoutSet } from '../../db/types';
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
  onDelete: (set: WorkoutSet) => void;
};

/** Tap a logged set: the same inputs in a sheet, with Save and Delete (undo lives in the toast). */
export function EditSetSheet({ set, index, exerciseName, loadType, gym, onClose, onSave, onDelete }: Props) {
  return (
    <Sheet open={set !== null} onClose={onClose} label="Edit set" scroll>
      {set && <EditBody key={set.id} set={set} index={index} exerciseName={exerciseName} loadType={loadType ?? set.load?.kind} gym={gym} onSave={onSave} onDelete={onDelete} />}
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
}: Omit<Props, 'set' | 'onClose' | 'loadType'> & { set: WorkoutSet; loadType: Load['kind'] | undefined }) {
  const [load, setLoad] = useState<Load | null>(set.load ?? null);
  const [reps, setReps] = useState(set.reps ?? 1);
  const [seconds, setSeconds] = useState(set.seconds ?? 1);
  const busy = useRef(false);
  const timed = loadType === 'timed' || (set.reps === undefined && set.seconds !== undefined);
  // The set's own load kind decides the input, so an old set never shows in a different input.
  const kind = set.load?.kind ?? loadType;
  const sameUnit = !set.load || set.load.unit === gym.unit;

  useEffect(() => () => void (busy.current = false), []);

  const save = async () => {
    if (busy.current || !load) return;
    busy.current = true;
    try {
      await onSave(set, timed ? { seconds, load } : { reps, load });
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>Set {index + 1}</h2>
      <p className={styles.sheetSub}>{exerciseName}</p>

      {kind && !timed && sameUnit && (
        <SetLoadInput loadType={kind} gym={gym} exerciseId={set.exerciseId} exerciseName={exerciseName} value={load} onChange={setLoad} />
      )}
      {timed ? (
        <RepsStepper label="Seconds" unit="seconds" value={seconds} onChange={setSeconds} max={3600} />
      ) : (
        <RepsStepper value={reps} onChange={setReps} />
      )}

      <button type="button" className={`${styles.logButton} pressable`} disabled={!load} onClick={() => void save()}>
        Save
      </button>
      <button type="button" className={`${styles.deleteButton} pressable`} onClick={() => onDelete(set)}>
        Delete set
      </button>
    </div>
  );
}
