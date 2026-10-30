import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import type { BarId, Gym, Load, Unit } from '../../db/types';
import { SetLoadInput } from './SetLoadInput';
import { BAR_PROMPTS, barIdFor, confirmablePick, currentLoad } from './exerciseLoad';
import styles from './Workout.module.css';

/** What a swipe down did: applied the pick, waits for a bar choice to settle, or nothing to keep. */
type Commit = 'applied' | 'wait' | 'none';

/** A pick and the unit it was made in (PLAN 2.0c): plates in lb are never applied to a kg gym. */
export type WeightPick = { load: Load | null; plates: number[]; unit: Unit };

type Props = {
  open: boolean;
  onClose: () => void;
  /** "Set 2" and how many rows below it change too. */
  title: string;
  sub: string;
  loadType: Load['kind'];
  gym: Gym;
  exerciseId: string;
  exerciseName: string;
  bar?: BarId;
  /** The row's value when the sheet opened. */
  start: WeightPick;
  onDone: (pick: WeightPick) => void;
  onNotice?: (text: string, retry?: () => void) => void;
};

/**
 * Tap a weight cell (SPEC 20.2): the one picker for this exercise slides up, already set to the
 * row's weight. Done applies it to that row and the rows below that are not logged yet.
 */
export function WeightSheet({ open, onClose, title, sub, loadType, gym, exerciseId, exerciseName, bar, start, onDone, onNotice }: Props) {
  // A swipe down with changed plates keeps them, like Done (no silent loss); unchanged it just closes.
  // While a bar choice is still saving it waits (PLAN 2.0c): the sheet stays until the choice
  // settles, then applies the plates as they are by then and closes.
  const commit = useRef<(() => Commit) | null>(null);
  return (
    <Sheet open={open} onClose={onClose} onDragClose={() => ((commit.current?.() ?? 'none') === 'none' ? onClose() : undefined)} label="Pick the weight" scroll footer>
      {open && (
        <WeightBody
          commit={commit}
          title={title}
          sub={sub}
          loadType={loadType}
          gym={gym}
          exerciseId={exerciseId}
          exerciseName={exerciseName}
          bar={bar}
          start={start}
          onDone={onDone}
          onNotice={onNotice}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function WeightBody({
  title,
  sub,
  loadType,
  gym,
  exerciseId,
  exerciseName,
  bar,
  start,
  onDone,
  onNotice,
  onClose,
  commit,
}: Omit<Props, 'open'> & { commit: MutableRefObject<(() => Commit) | null> }) {
  const [pick, setPick] = useState<WeightPick>(start);
  // PLAN 2.0c: the pick keeps the unit it was made in. When the gym's unit changed since (another
  // tab), the picker starts over in the new unit: nothing old is shown, kept or confirmed.
  const stale = pick.unit !== gym.unit;
  const shown: WeightPick = stale ? { load: null, plates: [], unit: gym.unit } : pick;
  // The bar or starting weight can be answered inside (first use prompt): rebuild through load.ts.
  const load = currentLoad(shown.load, shown.plates, loadType, gym, exerciseId, exerciseName, bar, shown.unit);
  // An unknown EZ, trap or Smith bar is answered first: nothing is logged on a guessed bar.
  const barUnknown = loadType === 'barbell' && load === null && !!BAR_PROMPTS[barIdFor(exerciseName, bar)] && gym.bars[barIdFor(exerciseName, bar)] === null;
  // A bar choice still being saved: Done waits for it, so the plates it ends with are the ones applied.
  const [settling, setSettling] = useState(false);
  // A bar choice that landed but whose new bar has not reached this sheet yet (the exercise's bar
  // setting is read live): the load is rebuilt on that bar, so it waits for it too (PLAN 2.0c).
  const barCatchingUp = pick.load !== start.load && pick.load?.kind === 'barbell' && pick.load.barId !== undefined && pick.load.barId !== barIdFor(exerciseName, bar);
  const waiting = settling || barCatchingUp;
  const ready = stale || waiting ? null : confirmablePick(pick, loadType, gym, exerciseId, exerciseName, bar);
  const canDone = ready !== null;
  const changed = stale || pick.load !== start.load || pick.plates.join() !== start.plates.join();
  const confirm = (): boolean => {
    if (!ready) return false;
    onDone(ready);
    return true;
  };
  // Done and a swipe down with changed plates go through the same check (no silent loss, no stale apply).
  // A swipe down while a bar choice saves is held until it settles (PLAN 2.0c, Codex 2.0c #1).
  const closeAfter = useRef(false);
  commit.current = () => {
    if (waiting) {
      closeAfter.current = true;
      return 'wait';
    }
    return changed && confirm() ? 'applied' : 'none';
  };
  useEffect(() => {
    if (waiting || !closeAfter.current) return;
    closeAfter.current = false;
    if (!(changed && confirm())) onClose();
    // Runs once the choice settled, with this render's (latest) plates.
  }, [waiting]);
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>{title}</h2>
      {/* While the bar question is up the sub line steps aside, so the plates stay in view. */}
      {!barUnknown && (
        <p className={styles.sheetSub} data-testid="weight-sheet-sub">
          {stale ? `Units changed to ${gym.unit}. Pick the weight again.` : sub}
        </p>
      )}
      <SetLoadInput
        // A unit change starts the picker over (its plates and wheel are in the new unit).
        key={gym.unit}
        loadType={loadType}
        gym={gym}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        value={load}
        plates={shown.plates}
        // Every selection is fresh, in the gym's unit at that moment.
        onChange={(l, plates) => setPick((p) => ({ load: l, plates: plates ?? l?.perSide ?? (p.unit === gym.unit ? p.plates : []), unit: gym.unit }))}
        bar={bar}
        onNotice={onNotice}
        onPending={setSettling}
        padInSheet
      />
      <SheetFooter>
        <button type="button" className={`${styles.logButton} pressable`} disabled={!canDone} onClick={() => void confirm()}>
          {barUnknown ? 'Set the bar weight first' : 'Done'}
        </button>
      </SheetFooter>
    </div>
  );
}
