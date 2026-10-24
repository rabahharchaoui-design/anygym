import { useState } from 'react';
import type { Load, Unit } from '../../db/types';
import { bodyweightLoad, formatAmount } from '../../lib/load';
import { useTapGuard } from '../../hooks/useTapGuard';
import { AddedWeightField } from './AddedWeightField';
import base from './LoadInput.module.css';
import styles from './BodyweightInput.module.css';

type Props = {
  unit: Unit;
  value: Load | null;
  onChange: (load: Load) => void;
};

/** Bodyweight (SPEC 5.2): reps only, with an optional "+ added weight" (vest, belt, plate). */
export function BodyweightInput({ unit, value, onChange }: Props) {
  const own = value?.kind === 'bodyweight' ? value : null;
  const [on, setOn] = useState((own?.added ?? 0) > 0);
  const [added, setAdded] = useState(own?.added ?? 0);

  const toggle = useTapGuard(() => {
    const next = !on;
    setOn(next);
    onChange(bodyweightLoad(unit, next ? added : 0));
  });

  const change = (n: number) => {
    setAdded(n);
    onChange(bodyweightLoad(unit, n));
  };

  return (
    <div className={base.root}>
      <div className={base.readout}>
        <p className={styles.word}>Bodyweight</p>
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
      <button type="button" className={`${base.toggle} pressable`} aria-pressed={on} onClick={toggle}>
        + added weight
      </button>
      {on && <AddedWeightField unit={unit} value={added} onChange={change} label="Added weight" />}
    </div>
  );
}
