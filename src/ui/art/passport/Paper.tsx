import type { ReactNode } from 'react';
import { medallion, wavePath } from './guilloche';
import styles from './passport.module.css';

const BANDS = [0, 1, 2, 3, 4, 5];

/**
 * A page of passport paper (PLAN 3.6h, a piece for 4.7): fine guilloche line work, generated, with
 * a woven band at the top and bottom and a medallion behind the content. Children sit on the paper.
 */
export function GuillochePaper({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`${styles.paper} ${className ?? ''}`} data-testid="passport-paper">
      <svg className={styles.fill} viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <g className={styles.lines}>
          {BANDS.map((i) => (
            <path key={`t${i}`} d={wavePath(300, 16, 7, 9, (i * Math.PI) / 3)} />
          ))}
          {BANDS.map((i) => (
            <path key={`b${i}`} d={wavePath(300, 184, 7, 9, (i * Math.PI) / 3)} />
          ))}
          {medallion(218, 100, 62, 6).map((d, i) => (
            <path key={`m${i}`} d={d} />
          ))}
        </g>
      </svg>
      <div className={styles.paperBody}>{children}</div>
    </div>
  );
}
