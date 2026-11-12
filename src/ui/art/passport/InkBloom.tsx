import { useId, type ReactNode } from 'react';
import styles from './passport.module.css';

type Props = {
  /** What is stamped, as SVG in a 100 by 100 box (the default is a plain ring stamp). */
  children?: ReactNode;
  /** A different seed gives a different bleed: no two stamps alike. */
  seed?: number;
  size?: number;
  className?: string;
};

/**
 * An ink bloom (PLAN 3.6h, a piece for 4.7): whatever is stamped bleeds a little into the paper.
 * An SVG noise filter pushes the edges about and a soft copy underneath is the ink that spread.
 */
export function InkBloom({ children, seed = 3, size = 96, className }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const stamp = children ?? (
    <>
      <circle cx="50" cy="50" r="38" fill="none" strokeWidth="5" />
      <circle cx="50" cy="50" r="29" fill="none" strokeWidth="1.6" />
      <path d="M32 52l12 12l24-28" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
  return (
    <svg className={`${styles.bloom} ${className ?? ''}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" data-testid="passport-bloom">
      <defs>
        <filter id={`${id}bleed`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={`${id}spread`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed={seed + 11} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="G" yChannelSelector="R" />
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      <g className={styles.ink} filter={`url(#${id}spread)`} opacity="0.35">
        {stamp}
      </g>
      <g className={styles.ink} filter={`url(#${id}bleed)`}>
        {stamp}
      </g>
    </svg>
  );
}
