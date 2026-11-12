import type { Unit } from '../../db/types';
import styles from './TypedReadout.module.css';

/** The number typed so far on a sheet's pad, big, with its unit; a dim 0 until a key is pressed. */
export function TypedReadout({ text, unit, testId }: { text: string; unit: Unit; testId: string }) {
  return (
    <div className={styles.display}>
      <span className={`${styles.typed} num`} data-testid={testId} aria-live="polite">
        {text || <span className={styles.placeholder}>0</span>}
      </span>
      <span className={styles.unit}>{unit}</span>
    </div>
  );
}
