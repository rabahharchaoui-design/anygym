import { useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import type { BarId, Gym, Load } from '../../db/types';
import { collarsSettingOf, formatSetLine, otherOf } from '../../lib/load';
import { fileSetText, type PlannedSet, type SetEdit } from '../../lib/import/importPlan';
import { RepsStepper } from '../workout/RepsStepper';
import { SetLoadInput } from '../workout/SetLoadInput';
import styles from '../workout/Workout.module.css';
import css from './Import.module.css';

type Props = {
  set: PlannedSet | null;
  index: number;
  exerciseId: string;
  exerciseName: string;
  kind: Load['kind'] | undefined;
  bar?: BarId;
  gym: Gym;
  onClose: () => void;
  onSave: (edit: SetEdit) => void;
  onSkip: (skip: boolean) => void;
};

/** Import review: one set, fixed inline. Reps, the weight on the right picker, or Skip. */
export function ImportSetSheet({ set, onClose, ...rest }: Props) {
  return (
    <Sheet open={set !== null} onClose={onClose} label="Check this set" scroll>
      {set && <Body key={set.key} set={set} {...rest} />}
    </Sheet>
  );
}

function Body({ set, index, exerciseId, exerciseName, kind, bar, gym, onSave, onSkip }: Omit<Props, 'set' | 'onClose'> & { set: PlannedSet }) {
  const [load, setLoad] = useState<Load | null>(set.load ?? null);
  const [reps, setReps] = useState(set.reps);
  // A weight in the other unit is kept exactly as in the file (never converted): only reps change.
  const sameUnit = !set.load ? set.source.unit === gym.unit : set.load.unit === gym.unit;
  const pickable = !!kind && kind !== 'timed' && sameUnit;
  const changedLoad = load !== (set.load ?? null);
  const save = () => {
    const edit: SetEdit = { reps, ok: true };
    if (changedLoad && load) edit.load = load;
    onSave(edit);
  };
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>Set {index + 1}</h2>
      <p className={styles.sheetSub}>{exerciseName}</p>
      <p className={css.sheetFile}>
        In your file: <span className="num">{fileSetText(set.source)}</span>
      </p>
      {set.reason && (
        <p className={css.sheetReason} role="note">
          {set.reason}
        </p>
      )}
      {pickable ? (
        <SetLoadInput
          loadType={kind}
          gym={gym}
          exerciseId={exerciseId}
          exerciseName={exerciseName}
          value={load}
          onChange={setLoad}
          bar={bar}
          ownBar={set.load?.kind === 'barbell' || set.load?.kind === 'plate_machine' ? set.load.barWeight : undefined}
          ownBarId={set.load?.kind === 'barbell' ? set.load.barId : undefined}
          ownCollars={set.load?.kind === 'barbell' ? collarsSettingOf(set.load) : undefined}
          ownOther={set.load?.kind === 'barbell' ? otherOf(set.load) : undefined}
          padInSheet
        />
      ) : (
        set.load && <p className={`${css.sheetFile} num`}>Weight stays as in your file: {formatSetLine({ reps: set.reps, load: set.load })}</p>
      )}
      <RepsStepper value={reps} onChange={setReps} />
      <button type="button" className={`${styles.logButton} pressable`} onClick={save}>
        {set.uncertain && !changedLoad && reps === set.reps && load ? 'Looks right' : 'Save'}
      </button>
      <button type="button" className={`${styles.deleteButton} pressable`} onClick={() => onSkip(!set.skipped)}>
        {set.skipped ? 'Import this set' : 'Skip this set'}
      </button>
    </div>
  );
}
