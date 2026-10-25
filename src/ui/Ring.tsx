import type { ReactNode } from 'react';
import styles from './Ring.module.css';

type Props = {
  /** 0 to 1, how much of the ring is drawn. */
  fraction: number;
  size?: number;
  stroke?: number;
  /** Linear glide between updates, matched to how often `fraction` changes (a smooth countdown). */
  glideMs?: number;
  /** Full: a filled lime disc (done). */
  full?: boolean;
  className?: string;
  children?: ReactNode;
};

/** A smooth progress ring (SPEC 23.3): the rest countdown and the per exercise progress. */
export function Ring({ fraction, size = 44, stroke = 5, glideMs = 250, full = false, className, children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <span className={`${styles.ring} ${className ?? ''}`} style={{ width: size, height: size }} data-full={full || undefined} aria-hidden="true">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className={styles.track} strokeWidth={stroke} />
        {!full && f > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            className={styles.progress}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - f)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transitionDuration: `${glideMs}ms` }}
          />
        )}
      </svg>
      {children && <span className={styles.inner}>{children}</span>}
    </span>
  );
}
