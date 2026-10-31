import { useState } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import type { BarId, Gym, Load, Unit } from '../../db/types';
import { collarsSettingOf, convertForGym, exactHeldProblem, formatAmount, formatWeight, loadAt, MAX_EXACT_HELD, nearestLoadable, otherOf, pickedWeight } from '../../lib/load';
import { isExactHeld, loadSetupFor } from '../workout/exerciseLoad';
import { fileLineText, type PlannedSet, type SetEdit } from '../../lib/import/importPlan';
import { BarPicture } from '../../components/load/BarPicture';
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
  // The number typed in an exact weight (kettlebell), so the warning says the real reason.
  const [typed, setTyped] = useState<number | null>(null);
  // A weight in the other unit is kept exactly as in the file (never converted) unless another
  // weight is picked on purpose ("Pick another weight").
  const sameUnit = !set.load ? set.source.unit === gym.unit : set.load.unit === gym.unit;
  const [picking, setPicking] = useState(false);
  const canPick = !!kind && kind !== 'timed';
  const pickable = canPick && (sameUnit || picking);
  const changedLoad = touchedIn !== null;
  const staleUnit = changedLoad && touchedIn !== gym.unit;
  const invalid = changedLoad && (load === null || staleUnit);
  const blocked = settling || invalid;
  const exact = !!kind && isExactHeld(kind, exerciseName);
  const problem = exact ? exactHeldProblem(typed, gym.unit) : null;
  const reason = staleUnit
    ? `Units changed to ${gym.unit}. Restore the file's weight to save.`
    : problem === 'empty'
      ? /kettlebell/i.test(exerciseName)
        ? 'Enter the weight on your kettlebell.'
        : 'Enter the weight you hold.'
      : problem === 'over'
        ? `Enter a weight up to ${formatWeight(MAX_EXACT_HELD[gym.unit], gym.unit)}.`
        : problem === 'zero'
          ? 'Enter a weight above 0.'
          : 'Pick a weight this gym can load to save.';
  const fileWeight = set.load ? pickedWeight(set.load) : null;
  const restoreText = fileWeight !== null && set.load ? `Restore ${formatWeight(fileWeight, set.load.unit)}` : "Use the file's weight";
  const revert = () => {
    setTouchedIn(null);
    setTyped(null);
    setLoad(set.load ?? null);
    if (!sameUnit) setPicking(false);
  };
  // "Pick another weight" in the other unit: start at the loadable weight here nearest to the
  // file's (converted and rounded by load.ts), never at an empty bar.
  const pickOther = () => {
    setPicking(true);
    if (!set.load || !kind) return;
    const setup = { ...loadSetupFor(gym, kind, exerciseId, exerciseName, bar), unit: gym.unit };
    const own = set.load.kind === 'stack' ? set.load.total : pickedWeight(set.load);
    const near = own === null ? null : nearestLoadable(kind, convertForGym(own, set.load.unit, gym.unit), setup);
    const start = near === null ? null : loadAt(kind, near, setup);
    if (start) {
      setTouchedIn(gym.unit);
      setLoad(start);
    }
  };
  const save = () => {
    if (blocked) return;
    const edit: SetEdit = { reps, ok: true };
    // A touched weight is the user's answer, never the file's again (importPlan planImport).
    if (changedLoad) edit.load = load;
    onSave(edit);
  };
  return (
    <div className={`${styles.sheetBody} ${css.editor}`}>
      {/* Pinned while the picker and reps scroll (PLAN 2.0d follow up): which set, which exercise, and
          the file's reps on their own line; the weight is shown as the picture below, never as math. */}
      <div className={css.editorContext} data-testid="import-context">
        <div className={css.editorHead}>
          <h2 className={css.editorTitle}>Set {index + 1}</h2>
          <p className={css.editorName}>{exerciseName}</p>
        </div>
        {/* The file's line in plain words, always with its weight as the file wrote it (2.0d critic r3). */}
        <p className={css.sheetFile} data-testid="import-file-reps">
          In your file: <span className="num">{fileLineText(set.source)}</span>
        </p>
      </div>
      {set.reason && (
        <p className={css.sheetReason} role="note">
          {set.reason}
        </p>
      )}
      {/* Reps first, then the weight picture (2.0d critic r2): both stay above the footer. */}
      <RepsStepper value={reps} onChange={setReps} compact />
      {pickable ? (
        <SetLoadInput
          loadType={kind}
          gym={gym}
          exerciseId={exerciseId}
          exerciseName={exerciseName}
          value={sameUnit ? load : changedLoad ? load : null}
          onChange={(l) => {
            setTouchedIn(gym.unit);
            setLoad(l);
          }}
          onPending={setSettling}
          onTyped={setTyped}
          dense
          hints={false}
          drawingShare={0.1}
          bar={bar}
          ownBar={sameUnit && (set.load?.kind === 'barbell' || set.load?.kind === 'plate_machine') ? set.load.barWeight : undefined}
          ownBarId={sameUnit && set.load?.kind === 'barbell' ? set.load.barId : undefined}
          ownCollars={sameUnit && set.load?.kind === 'barbell' ? collarsSettingOf(set.load) : undefined}
          ownOther={sameUnit && set.load?.kind === 'barbell' ? otherOf(set.load) : undefined}
          padInSheet
        />
      ) : (
        set.load &&
        !changedLoad && (
          <div className={css.fileWeight} data-testid="import-file-load">
            <FileLoad load={set.load} colorMode={gym.plateColors} />
            <p className={css.fileKept}>Kept as in your file ({set.load.unit})</p>
            {canPick && (
              <button type="button" className={`${css.pickOther} pressable`} onClick={pickOther}>
                Pick another weight
              </button>
            )}
          </div>
        )
      )}
      <SheetFooter>
        <div className={css.editorFooter}>
          {invalid && !settling && (
            <p className={css.editorReason} role="status" data-testid="import-weight-invalid">
              {reason}
            </p>
          )}
          {invalid && !settling ? (
            <div className={css.editorActions}>
              <button type="button" className={`${css.restore} pressable`} onClick={revert} data-testid="import-weight-revert">
                {restoreText}
              </button>
              <button type="button" className={`${styles.logButton} pressable`} onClick={save} disabled={blocked}>
                Save
              </button>
            </div>
          ) : (
            <>
              <button type="button" className={`${styles.logButton} pressable`} onClick={save} disabled={blocked}>
                {set.uncertain && !changedLoad && reps === set.reps && load ? 'Looks right' : 'Save'}
              </button>
              <button type="button" className={`${styles.deleteButton} pressable`} onClick={() => onSkip(!set.skipped)}>
                {set.skipped ? 'Import this set' : 'Skip this set'}
              </button>
            </>
          )}
        </div>
      </SheetFooter>
    </div>
  );
}

/**
 * The file's weight, kept as it is (another unit): the big total and, for plates, the same small
 * picture and "Each side" chips as the picker. No × math (2.0d critic).
 */
function FileLoad({ load, colorMode }: { load: Load; colorMode: Gym['plateColors'] }) {
  const shown = load.kind === 'stack' ? load.total : pickedWeight(load);
  const plates = (load.kind === 'barbell' || load.kind === 'plate_machine') && load.perSide ? load.perSide : null;
  return (
    <>
      {shown !== null && (
        <p className={`${css.fileTotal} num`} data-testid="import-file-total">
          {formatAmount(shown)}
          <span className={css.fileUnit}>
            {load.unit}
            {load.kind === 'dumbbell_each' ? ' each' : ''}
          </span>
        </p>
      )}
      {plates && <BarPicture unit={load.unit} perSide={plates} colorMode={colorMode} horn={load.kind === 'plate_machine'} barId={load.kind === 'barbell' ? load.barId : undefined} />}
    </>
  );
}
