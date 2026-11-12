import { useEffect, useState, type CSSProperties } from 'react';
import styles from './Odometer.module.css';

type Props = {
  value: string | number;
  /** Roll up from zero when it first appears (finish screen stats). */
  countUp?: boolean;
  /** Ms between digits starting to roll on a count up (default 70). A hero number uses less, so a long one still lands inside a celebration (PLAN 3.6b). */
  stagger?: number;
  className?: string;
};

/**
 * Numbers that roll like an odometer when they change (SPEC 23.3). The exact value is in the DOM
 * once, as visually hidden text (screen readers, copy and tests read it); the visible face is an
 * aria-hidden layer with no text of its own: each digit is a 0 to 9 strip drawn by CSS that slides
 * to the digit, so the strips are never read out. Tabular numerals keep widths fixed.
 */
export function Odometer({ value, countUp = false, stagger = 70, className }: Props) {
  const [ready, setReady] = useState(!countUp);
  useEffect(() => {
    if (ready) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, [ready]);
  const text = String(value);
  const chars = text.split('');
  const n = chars.length;
  return (
    <span className={`${styles.odo} ${className ?? ''}`} data-count={countUp || undefined}>
      <span className={styles.value}>{text}</span>
      <span className={styles.face} aria-hidden="true">
        {chars.map((c, i) => {
          const fromRight = n - i;
          if (c < '0' || c > '9') {
            return <span key={`c${fromRight}`} className={styles.char} data-c={c} />;
          }
          const style = {
            '--d': ready ? Number(c) : 0,
            '--delay': countUp ? `${(n - fromRight) * stagger}ms` : '0ms',
          } as CSSProperties;
          return <span key={`d${fromRight}`} className={styles.digit} style={style} />;
        })}
      </span>
    </span>
  );
}
