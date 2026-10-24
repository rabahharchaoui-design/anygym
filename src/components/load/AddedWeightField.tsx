import { useState } from 'react';
import type { Unit } from '../../db/types';
import { formatAmount } from '../../lib/load';
import { parseTyped, pressKey } from '../../lib/numpad';
import { NumPad } from './NumPad';
import styles from './LoadInput.module.css';

type Props = {
  unit: Unit;
  /** Current added weight; 0 = none. */
  value: number;
  onChange: (added: number) => void;
  label: string;
};

/** Small inline number field with our pad (no native keyboard, no zoom). */
export function AddedWeightField({ unit, value, onChange, label }: Props) {
  const [text, setText] = useState(value > 0 ? formatAmount(value) : '');
  const key = (k: Parameters<typeof pressKey>[1]) => {
    const next = pressKey(text, k);
    setText(next);
    onChange(parseTyped(next) ?? 0);
  };
  return (
    <div className={styles.field} role="group" aria-label={label}>
      <div className={styles.fieldDisplay}>
        <span className={`${styles.fieldValue} num`} data-testid="added-typed" aria-live="polite">
          {text || <span className={styles.placeholder}>0</span>}
        </span>
        <span className={styles.fieldUnit}>{unit}</span>
      </div>
      <NumPad compact onKey={key} />
    </div>
  );
}
