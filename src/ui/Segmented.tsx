import { tick } from './haptics';
import styles from './Segmented.module.css';

// A small segmented control (the Settings Units pattern, SPEC 10): a radiogroup of pill buttons,
// each at least 44 px tall, the chosen one in the accent.
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  testId,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
  labelledBy?: string;
  testId?: string;
}) {
  return (
    <span className={styles.segmented} role="radiogroup" aria-label={label} aria-labelledby={labelledBy} data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${styles.segment} pressable`}
          onClick={() => {
            if (o.value === value) return;
            tick();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
