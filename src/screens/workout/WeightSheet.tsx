import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import type { BarId, Gym, Load } from '../../db/types';
import { SetLoadInput } from './SetLoadInput';
import { currentLoad } from './exerciseLoad';
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
  return (
    <Sheet open={open} onClose={onClose} label="Pick the weight" scroll>
      {open && (
        <WeightBody
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

function WeightBody({ title, sub, loadType, gym, exerciseId, exerciseName, bar, start, onDone, onNotice }: Omit<Props, 'open' | 'onClose'>) {
  const [pick, setPick] = useState<WeightPick>(start);
  // The bar or starting weight can be answered inside (first use prompt): rebuild through load.ts.
  const load = currentLoad(pick.load, pick.plates, loadType, gym, exerciseId, exerciseName, bar);
  const canDone = load !== null || ((loadType === 'barbell' || loadType === 'plate_machine') && pick.plates.length > 0);
  return (
    <div className={styles.sheetBody}>
      <h2 className={styles.sheetTitle}>{title}</h2>
      <p className={styles.sheetSub}>{sub}</p>
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
      <div className={styles.sheetFooter}>
        <button type="button" className={`${styles.logButton} pressable`} disabled={!canDone} onClick={() => onDone({ load, plates: pick.plates })}>
          Done
        </button>
      </div>
    </div>
  );
}
