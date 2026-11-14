import type { ReactNode } from 'react';
import styles from './SummaryRow.module.css';

type Props = {
  /** What the row is about ("Your priorities"). */
  label: string;
  /** What is chosen now, one quiet line under the label. */
  value: ReactNode;
  /** What a tap does, in a word on the right ("Reorder", "Change"). */
  action: string;
  onPress: () => void;
  testId?: string;
  valueTestId?: string;
};

/**
 * PLAN 3.6f: a glass row that says a choice already made and opens the sheet that changes it
 * (the focus priorities, the days picked this week). 56 pt tall at least, the whole row taps.
 */
export function SummaryRow({ label, value, action, onPress, testId, valueTestId }: Props) {
  return (
    <button type="button" className={`${styles.row} pressable`} onClick={onPress} data-testid={testId}>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value} data-testid={valueTestId}>
          {value}
        </span>
      </span>
      <span className={styles.action}>{action}</span>
    </button>
  );
}
