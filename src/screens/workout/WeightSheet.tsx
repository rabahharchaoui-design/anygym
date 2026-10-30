import { useRef, useState, type MutableRefObject } from 'react';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import type { BarId, Gym, Load } from '../../db/types';
import { SetLoadInput } from './SetLoadInput';
import { BAR_PROMPTS, barIdFor, currentLoad } from './exerciseLoad';
import styles from './Workout.module.css';

export type WeightPick = { load: Load | null; plates: number[] };

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
  const commit = useRef<(() => boolean) | null>(null);
  return (
    <Sheet open={open} onClose={onClose} onDragClose={() => (commit.current?.() ? undefined : onClose())} label="Pick the weight" scroll footer>
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
  commit,
}: Omit<Props, 'open' | 'onClose'> & { commit: MutableRefObject<(() => boolean) | null> }) {
  const [pick, setPick] = useState<WeightPick>(start);
  // The bar or starting weight can be answered inside (first use prompt): rebuild through load.ts.
  const load = currentLoad(pick.load, pick.plates, loadType, gym, exerciseId, exerciseName, bar);
  // An unknown EZ, trap or Smith bar is answered first: nothing is logged on a guessed bar.
  const barUnknown = loadType === 'barbell' && load === null && !!BAR_PROMPTS[barIdFor(exerciseName, bar)] && gym.bars[barIdFor(exerciseName, bar)] === null;
  const canDone = load !== null || (loadType === 'plate_machine' && pick.plates.length > 0) || (loadType === 'barbell' && !barUnknown && pick.plates.length > 0);
  const changed = pick.load !== start.load || pick.plates.join() !== start.plates.join();
  commit.current = () => {
    if (!changed || !canDone) return false;
    onDone({ load, plates: pick.plates });
    return true;
  };
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>{title}</h2>
      {/* While the bar question is up the sub line steps aside, so the plates stay in view. */}
      {!barUnknown && <p className={styles.sheetSub}>{sub}</p>}
      <SetLoadInput
        loadType={loadType}
        gym={gym}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        value={load}
        plates={pick.plates}
        onChange={(l, plates) => setPick((p) => ({ load: l, plates: plates ?? l?.perSide ?? p.plates }))}
        bar={bar}
        onNotice={onNotice}
        padInSheet
      />
      <SheetFooter>
        <button type="button" className={`${styles.logButton} pressable`} disabled={!canDone} onClick={() => onDone({ load, plates: pick.plates })}>
          {barUnknown ? 'Set the bar weight first' : 'Done'}
        </button>
      </SheetFooter>
    </div>
  );
}
