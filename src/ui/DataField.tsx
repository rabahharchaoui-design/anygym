import type { CSSProperties } from 'react';
import { BLANK, numberEm, type DataFieldSize } from './dataFieldFit';
import styles from './DataField.module.css';

type Props = {
  /** Small capitals over the number: "Distance", "Time", "Pace" (written in plain case, drawn in capitals). */
  label: string;
  /** The number exactly as the logic printed it ("3.42", "21:08"). null when it is not trusted: an honest blank. */
  value: string | null;
  /** "km", "/km", "lb". Under the number at hero and large, beside it at medium. */
  unit?: string;
  /** hero: the one biggest number on screen; large: the next ones; medium: a row of stats. */
  size?: DataFieldSize;
  testId?: string;
  className?: string;
};

/**
 * A Monolith data field (SPEC 10, PLAN M1): a small capital label, a giant tabular number and its
 * unit. The number takes the biggest size of its step that fits the field's width, so 99.99 or
 * 1:59:59 never clips at 320 px. A value the app does not trust shows two dashes, never a guess.
 */
export function DataField({ label, value, unit, size = 'large', testId, className }: Props) {
  const blank = value === null || value.trim() === '' || value === BLANK;
  const shown = blank ? BLANK : value;
  const fit = { '--df-em': numberEm(shown, size).toFixed(3) } as CSSProperties;
  return (
    <div className={`${styles.field} ${className ?? ''}`} data-size={size} data-blank={blank || undefined} data-testid={testId} data-field>
      <span className={styles.label}>{label}</span>
      <span className={styles.line}>
        <span className={`${styles.number} num`} style={fit} aria-hidden={blank || undefined} data-value>
          {shown}
        </span>
        {blank && <span className={styles.hidden}>not known yet</span>}
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
    </div>
  );
}
