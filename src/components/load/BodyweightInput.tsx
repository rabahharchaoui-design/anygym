import { useState } from 'react';
import type { Load, Unit } from '../../db/types';
import { bodyweightLoad, formatAmount } from '../../lib/load';
import { useTapGuard } from '../../hooks/useTapGuard';
import { AddedWeightField } from './AddedWeightField';
import { AddedWeightSheet } from './AddedWeightSheet';
import base from './LoadInput.module.css';
import styles from './BodyweightInput.module.css';

type Props = {
  unit: Unit;
  value: Load | null;
  onChange: (load: Load) => void;
  /** Workout card (SPEC 13.5): the number pad opens in a sheet so the set still fits one screen. */
  padInSheet?: boolean;
};

/** Bodyweight (SPEC 5.2, 13.6): "Your bodyweight", reps only, with an optional "Add weight" (vest, belt, plate). */
export function BodyweightInput({ unit, value, onChange, padInSheet = false }: Props) {
  const own = value?.kind === 'bodyweight' ? value : null;
  const [on, setOn] = useState((own?.added ?? 0) > 0);
  const [added, setAdded] = useState(own?.added ?? 0);
  const [sheet, setSheet] = useState(false);

  const toggle = useTapGuard(() => {
    const next = !on;
    setOn(next);
    onChange(bodyweightLoad(unit, next ? added : 0));
    if (next && padInSheet) setSheet(true);
  });

  const change = (n: number) => {
    setAdded(n);
    onChange(bodyweightLoad(unit, n));
  };

  const closeSheet = () => {
    setSheet(false);
    // Nothing typed: the toggle goes back off, so it never claims weight that is not there.
    if (added <= 0) setOn(false);
  };

  return (
    <div className={base.root}>
      <div className={base.readout}>
        <p className={styles.word} data-testid="picker-title">
          Your bodyweight
        </p>
        <p className={`${base.sub} ${styles.added}`} data-testid="bodyweight-added" aria-live="polite">
          {own?.added ? (
            <>
              + <span className={styles.addedNum}>{formatAmount(own.added)}</span> {unit} added
            </>
          ) : (
            'Just you'
          )}
        </p>
      </div>
      <div className={base.links}>
        <button type="button" className={`${base.toggle} pressable`} aria-pressed={on} onClick={toggle}>
          Add weight
        </button>
        {padInSheet && on && (
          <button type="button" className={`${base.link} pressable`} onClick={() => setSheet(true)}>
            Change
          </button>
        )}
      </div>
      {on && !padInSheet && <AddedWeightField unit={unit} value={added} onChange={change} label="Added weight" />}
      {padInSheet && <AddedWeightSheet open={sheet} onClose={closeSheet} unit={unit} value={added} onChange={change} label="Added weight" />}
    </div>
  );
}
