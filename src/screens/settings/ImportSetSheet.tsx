import { useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import type { BarId, Gym, Load, Unit } from '../../db/types';
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
    // A bounded scroll body with a pinned Save bar (PLAN 2.0c): on a short phone the name, the file's
    // line and the weight readout stay in view above the keypad; the warning never pushes them out.
    <Sheet open={set !== null} onClose={onClose} label="Check this set" scroll footer>
      {set && <Body key={set.key} set={set} {...rest} />}
    </Sheet>
  );
}

function Body({ set, index, exerciseId, exerciseName, kind, bar, gym, onSave, onSkip }: Omit<Props, 'set' | 'onClose'> & { set: PlannedSet }) {
  const [load, setLoad] = useState<Load | null>(set.load ?? null);
  const [reps, setReps] = useState(set.reps);
  // PLAN 2.0c: the unit the weight was edited in (null: untouched, the file's weight stands), not
  // reference equality, and whether a bar choice is still being saved. A touched weight is the
  // user's answer: empty, refused (501) or picked in a unit the gym no longer uses (changed in
  // another tab) it cannot be saved until it is picked again or put back to the file's.
  const [touchedIn, setTouchedIn] = useState<Unit | null>(null);
  const [settling, setSettling] = useState(false);
  // A weight in the other unit is kept exactly as in the file (never converted): only reps change.
  const sameUnit = !set.load ? set.source.unit === gym.unit : set.load.unit === gym.unit;
  const pickable = !!kind && kind !== 'timed' && sameUnit;
  const changedLoad = touchedIn !== null;
  const staleUnit = changedLoad && touchedIn !== gym.unit;
  const invalid = changedLoad && (load === null || staleUnit);
  const blocked = settling || invalid;
  const revert = () => {
    setTouchedIn(null);
    setLoad(set.load ?? null);
  };
  const save = () => {
    if (blocked) return;
    const edit: SetEdit = { reps, ok: true };
    // A touched weight is the user's answer, never the file's again (importPlan planImport).
    if (changedLoad) edit.load = load;
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
          onChange={(l) => {
            setTouchedIn(gym.unit);
            setLoad(l);
          }}
          onPending={setSettling}
          bar={bar}
          ownBar={set.load?.kind === 'barbell' || set.load?.kind === 'plate_machine' ? set.load.barWeight : undefined}
          ownBarId={set.load?.kind === 'barbell' ? set.load.barId : undefined}
          ownCollars={set.load?.kind === 'barbell' ? collarsSettingOf(set.load) : undefined}
          ownOther={set.load?.kind === 'barbell' ? otherOf(set.load) : undefined}
          padInSheet
        />
      ) : (
        set.load && !changedLoad && <p className={`${css.sheetFile} num`}>Weight stays as in your file: {formatSetLine({ reps: set.reps, load: set.load })}</p>
      )}
      <RepsStepper value={reps} onChange={setReps} />
      <SheetFooter>
        <div className={styles.sheetBody}>
          {invalid && !settling && (
            <p className={css.sheetReason} role="status" data-testid="import-weight-invalid">
              {staleUnit ? `Units changed to ${gym.unit}. Use the file's weight to save.` : 'Pick a weight this gym can load to save.'}
            </p>
          )}
          <button type="button" className={`${styles.logButton} pressable`} onClick={save} disabled={blocked}>
            {set.uncertain && !changedLoad && reps === set.reps && load ? 'Looks right' : 'Save'}
          </button>
          {invalid && !settling ? (
            <button type="button" className={`${css.link} pressable`} onClick={revert} data-testid="import-weight-revert">
              Use the file's weight
            </button>
          ) : (
            <button type="button" className={`${styles.deleteButton} pressable`} onClick={() => onSkip(!set.skipped)}>
              {set.skipped ? 'Import this set' : 'Skip this set'}
            </button>
          )}
        </div>
      </SheetFooter>
    </div>
  );
}
