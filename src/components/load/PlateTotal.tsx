// The big number of the plate picture (split out of PlateDiagram.tsx, PLAN 3.7a): the live total,
// or, while something it depends on is not known, only what is sure. Never a guessed total.
import type { ReactNode } from 'react';
import type { Unit } from '../../db/types';
import { formatAmount, formatPlatesOn, formatWeight, platesOnly, type Horns } from '../../lib/load';
import styles from './PlateDiagram.module.css';

type Props = {
  /** The total from load.ts, or null when the bar or start is not known. */
  total: number | null;
  /** A plate loaded machine (not a bar). */
  horn: boolean;
  /** A machine whose sides (one or both) are not answered yet (PLAN 3.7a). */
  sidesUnknown: boolean;
  horns: Horns;
  bar: number | null;
  value: readonly number[];
  unit: Unit;
  math: string;
  mathId: string;
  mathAction?: ReactNode;
};

export function PlateTotal({ total, horn, sidesUnknown, horns, bar, value, unit, math, mathId, mathAction }: Props) {
  const action = mathAction && (
    <div className={styles.mathAction} data-fit="action">
      {mathAction}
    </div>
  );
  if (sidesUnknown) {
    // One side or both not answered (PLAN 3.7a): the plates put on and the start when known, no total.
    const start = bar === null ? ' + start' : bar === 0 ? '' : ` + ${formatWeight(bar, unit)} start`;
    const note = `${formatPlatesOn(value, unit)}${value.length ? start : ''}`;
    return (
      <>
        <p className={`${styles.total} num`} aria-live="polite" aria-label="Total not known yet: answer one side or both" aria-describedby={mathId} data-testid="plate-total" data-math={math} data-fit="total">
          —<span className={styles.unit}>{unit}</span>
        </p>
        <p className={styles.note} data-testid="plate-note">
          {note}
        </p>
        {action}
      </>
    );
  }
  if (total === null && horn) {
    // A machine whose start is not known yet: the plates on both horns, honestly "+ start"
    // under it (2.0d critic r3); answering only takes "+ start" away, the number never jumps.
    return (
      <>
        <p
          className={`${styles.total} num`}
          aria-live="polite"
          aria-label={`${formatWeight(platesOnly(value, unit, horns), unit)} of plates plus the machine's start, total not known yet`}
          aria-describedby={mathId}
          data-testid="plate-total"
          data-math={math}
          data-fit="total"
        >
          {formatAmount(platesOnly(value, unit, horns))}
          <span className={styles.unit}>{unit}</span>
        </p>
        <p className={styles.note} data-testid="plate-note">
          + start
        </p>
        {action}
      </>
    );
  }
  if (total === null) {
    // Unknown bar: no number yet, never a guessed total; the plates stay drawn below.
    return (
      <>
        <p className={`${styles.total} num`} aria-live="polite" aria-label="Total not known yet" aria-describedby={mathId} data-testid="plate-total" data-math={math} data-fit="total">
          —<span className={styles.unit}>{unit}</span>
        </p>
        <p className={styles.note} data-testid="plate-note">
          Bar weight not set
        </p>
        {action}
      </>
    );
  }
  // Under a known total: "Plates only" (Smith or machine counted as plates only), or a machine's start.
  const baseNote = bar === 0 ? 'Plates only' : horn && bar !== null ? `Start ${formatWeight(bar, unit)}` : null;
  return (
    <>
      <p className={`${styles.total} num`} aria-live="polite" aria-describedby={mathId} data-testid="plate-total" data-math={math} data-fit="total">
        {formatAmount(total)}
        <span className={styles.unit}>{unit}</span>
      </p>
      {baseNote && (
        <p className={styles.note} data-testid="plate-note">
          {baseNote}
        </p>
      )}
      {action}
    </>
  );
}
