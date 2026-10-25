import { Odometer } from '../../ui/Odometer';
import { useEffect, useRef, type PointerEvent } from 'react';
import styles from './RepsStepper.module.css';

type Props = {
  value: number;
  onChange: (n: number) => void;
  label?: string;
  unit?: string;
  min?: number;
  max?: number;
  /** Workout size: a little shorter so the set card fits one screen. */
  compact?: boolean;
  /** Amount per tap (rest time: 15 s). */
  step?: number;
};

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 90;

/** Big − number + stepper. A tap steps once; holding repeats. */
export function RepsStepper({ value, onChange, label = 'Reps', unit, min = 1, max = 999, compact = false, step: by = 1 }: Props) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const timers = useRef<{ delay?: number; repeat?: number }>({});
  const repeated = useRef(false);

  const stop = () => {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.repeat);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const step = (d: number) => {
    const next = Math.min(max, Math.max(min, valueRef.current + d * by));
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
    }
  };

  const startHold = (d: number) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    stop();
    repeated.current = false;
    timers.current.delay = window.setTimeout(() => {
      repeated.current = true;
      step(d);
      timers.current.repeat = window.setInterval(() => step(d), REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  // The click does the single step; after a hold it is swallowed so the hold does not add one more.
  const click = (d: number) => () => {
    stop();
    if (repeated.current) {
      repeated.current = false;
      return;
    }
    step(d);
  };

  const button = (d: number, text: string, name: string, disabled: boolean) => (
    <button
      type="button"
      className={`${styles.step} pressable`}
      aria-label={name}
      disabled={disabled}
      onPointerDown={startHold(d)}
      onPointerUp={() => window.clearInterval(timers.current.repeat)}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={click(d)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {text}
    </button>
  );

  return (
    <div className={styles.root} role="group" aria-label={label} data-compact={compact}>
      {button(-1, '−', `Fewer ${label.toLowerCase()}`, value <= min)}
      <div className={styles.readout}>
        <span className={`${styles.value} num`} data-testid={`stepper-${label.toLowerCase()}`} aria-live="polite">
          <Odometer value={value} />
        </span>
        <span className={styles.label}>{unit ?? label.toLowerCase()}</span>
      </div>
      {button(1, '+', `More ${label.toLowerCase()}`, value >= max)}
    </div>
  );
}
