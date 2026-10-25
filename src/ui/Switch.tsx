import { useId } from 'react';
import { tick } from './haptics';
import styles from './Switch.module.css';

type Props = { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean };

/** A settings row with an on/off switch: the whole row is the 48 pt+ hit area. */
export function Switch({ label, hint, checked, onChange, disabled }: Props) {
  const id = useId();
  return (
    <label className={styles.row} htmlFor={id} data-disabled={disabled || undefined}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.input}
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
          if (e.target.checked) tick();
        }}
      />
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
    </label>
  );
}
