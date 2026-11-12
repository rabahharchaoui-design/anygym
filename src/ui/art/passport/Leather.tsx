import { useId, type ReactNode } from 'react';
import { medallion } from './guilloche';
import styles from './passport.module.css';

/**
 * A leather passport cover (PLAN 3.6h, a piece for 4.7): a grain made by an SVG noise filter lit
 * from the top left, a stitched edge and a foil medallion pressed into the middle. The words on it
 * are the caller's, as live text.
 */
export function LeatherCover({ children, className }: { children?: ReactNode; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <div className={`${styles.cover} ${className ?? ''}`} data-testid="passport-cover">
      <svg className={styles.fill} viewBox="0 0 200 280" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <filter id={`${id}grain`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
            <feDiffuseLighting in="noise" surfaceScale="1.6" diffuseConstant="1.1" style={{ lightingColor: 'var(--text-2)' }}>
              <feDistantLight azimuth="225" elevation="58" />
            </feDiffuseLighting>
          </filter>
        </defs>
        <rect className={styles.hide} width="200" height="280" />
        <rect className={styles.grain} width="200" height="280" filter={`url(#${id}grain)`} />
      </svg>
      <svg className={styles.fill} viewBox="0 0 200 280" aria-hidden="true" focusable="false">
        <rect className={styles.stitch} x="9" y="9" width="182" height="262" rx="12" />
        {medallion(100, 118, 44, 4).map((d, i) => (
          <path key={i} className={styles.foil} d={d} />
        ))}
      </svg>
      <div className={styles.coverWords}>{children}</div>
    </div>
  );
}
