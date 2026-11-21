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
  /** What VoiceOver says for the whole field ("3.42 kilometers"); the printed parts are then skipped. */
  spoken?: string;
  /** Test ids of the label and of the number itself (the number may carry data-* attributes too). */
  labelTestId?: string;
  numberTestId?: string;
  numberData?: Record<`data-${string}`, string>;
  /** The unit beside the number at any size (as at medium); 'short': only on a short screen, under 760 px (PLAN M2). */
  inline?: boolean | 'short';
};

/**
 * A Monolith data field (SPEC 10, PLAN M1): a small capital label, a giant tabular number and its
 * unit. The number takes the biggest size of its step that fits the field's width, so 99.99 or
 * 1:59:59 never clips at 320 px. A value the app does not trust shows two dashes, never a guess.
 */
export function DataField({ label, value, unit, size = 'large', testId, className, spoken, labelTestId, numberTestId, numberData, inline }: Props) {
  const blank = value === null || value.trim() === '' || value === BLANK;
  const shown = blank ? BLANK : value;
  const fit = { '--df-em': numberEm(shown, size).toFixed(3) } as CSSProperties;
  return (
    <div className={`${styles.field} ${className ?? ''}`} data-size={size} data-inline={inline === 'short' ? 'short' : inline || undefined} data-blank={blank || undefined} data-testid={testId} data-field>
      {spoken && <span className={styles.hidden}>{spoken}</span>}
      <span className={styles.label} aria-hidden={spoken ? true : undefined} data-testid={labelTestId}>
        {label}
      </span>
      <span className={styles.line} aria-hidden={spoken ? true : undefined}>
        <span className={`${styles.number} num`} style={fit} aria-hidden={blank || undefined} data-value data-testid={numberTestId} {...numberData}>
          {shown}
        </span>
        {blank && !spoken && <span className={styles.hidden}>not known yet</span>}
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
    </div>
  );
}
