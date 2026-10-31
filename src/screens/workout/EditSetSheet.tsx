import { useEffect, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import type { BarId, Gym, Load, WorkoutSet } from '../../db/types';
import { collarsSettingOf, otherOf } from '../../lib/load';
import { countModeOf } from '../../lib/setTable';
import { RepsStepper } from './RepsStepper';
import { SetLoadInput } from './SetLoadInput';
import styles from './Workout.module.css';

/** How a Save ended (PLAN 2.0e): saved (the sheet closes), failed (it stays, says so), or closed by the screen. */
export type SaveResult = 'saved' | 'failed' | 'closed';

/** Said inside the sheet when a Save failed (SPEC 13.1: what happened and what to do). */
export const SAVE_FAILED = 'Could not save that. Try again.';

type Props = {
  set: WorkoutSet | null;
  index: number;
  exerciseName: string;
  loadType: Load['kind'] | undefined;
  gym: Gym;
  onClose: () => void;
  onSave: (set: WorkoutSet, change: { reps?: number; seconds?: number; load: Load }) => Promise<SaveResult>;
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
  // A bar choice still being saved (PLAN 2.0c): Save waits until it settles.
  const [settling, setSettling] = useState(false);
  // A failed Save, announced inside the dialog (PLAN 2.0e); the values stay for Try again.
  const [error, setError] = useState('');
  const running = useRef(false);
  const mounted = useRef(true);
  // Reps or seconds come from the saved set, never from today's load type (PLAN 1.7h).
  const timed = countModeOf(set, loadType) === 'seconds';
  // The set's own load kind decides the input, so an old set never shows in a different input.
  const kind = set.load?.kind ?? loadType;
  const sameUnit = !set.load || set.load.unit === gym.unit;

  useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  // Never rejects (no unhandled rejection from a tap): a failure is said in the sheet.
  const run = async (what: 'save' | 'delete', write: () => Promise<SaveResult | void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(what);
    setError('');
    let failed = false;
    try {
      failed = (await write()) === 'failed';
    } catch {
      failed = what === 'save';
    } finally {
      running.current = false;
      if (mounted.current) {
        setBusy(null);
        if (failed) setError(SAVE_FAILED);
      }
    }
  };
  const save = () => (load && !settling ? run('save', () => onSave(set, timed ? { seconds, load } : { reps, load })) : undefined);
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
          onPending={setSettling}
          bar={bar}
          ownBar={set.load?.kind === 'barbell' || set.load?.kind === 'plate_machine' ? set.load.barWeight : undefined}
          ownBarId={set.load?.kind === 'barbell' ? set.load.barId : undefined}
          ownCollars={set.load?.kind === 'barbell' ? collarsSettingOf(set.load) : undefined}
          ownOther={set.load?.kind === 'barbell' ? otherOf(set.load) : undefined}
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
        disabled={!load || settling || busy !== null}
        aria-disabled={!load || settling || busy !== null}
        aria-busy={busy === 'save'}
        onClick={() => void save()}
      >
        Save
      </button>
      <p className={styles.sheetError} role="status" aria-live="polite" data-testid="edit-error">
        {error}
      </p>
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
