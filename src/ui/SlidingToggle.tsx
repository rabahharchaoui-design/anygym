import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { tick } from './haptics';
import styles from './SlidingToggle.module.css';

// PLAN 2.2e: two or three options with one lime pill that slides between them on the tap spring.
// A radiogroup (arrow keys move the pick), every option at least 48 pt tall, equal widths so the
// pill moves by whole steps on the compositor (a transform, never a layout change).
export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

type Props<T extends string> = {
  options: readonly ToggleOption<T>[];
  /** Undefined: nothing picked yet (no pill). */
  value: T | undefined;
  onChange: (v: T) => void;
  label?: string;
  labelledBy?: string;
  testId?: string;
  disabled?: boolean;
  /** Fill the row (intake screens); otherwise as wide as the longest label needs. */
  block?: boolean;
};

export function SlidingToggle<T extends string>({ options, value, onChange, label, labelledBy, testId, disabled, block }: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const picked = options.some((o) => o.value === value);
  const pick = (v: T) => {
    if (v === value || disabled) return;
    tick();
    onChange(v);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    pick(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <span
      className={styles.toggle}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      data-block={block || undefined}
      style={{ '--n': options.length, '--i': index } as CSSProperties}
      onKeyDown={onKey}
    >
      {picked && <span className={styles.pill} aria-hidden="true" data-pill />}
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === index ? 0 : -1}
          disabled={disabled}
          className={`${styles.option} pressable`}
          onClick={() => pick(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}
