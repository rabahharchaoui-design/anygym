import styles from './AppMarkLoader.module.css';

/**
 * PLAN 2.2e: the AnyGym mark (two plates leaning into an "A", the bar across; scripts/make-icons.mjs)
 * drawing itself in lime, for app level loads only. Invisible for the first 400 ms, so a quick load
 * never flashes it; it draws once and stays (no endless spinner). Content keeps its skeletons.
 * Reduced motion: the mark simply appears.
 */
export function AppMarkLoader({ label = 'Loading AnyGym', inline }: { label?: string; /** In a box (the dev preview), not over the screen. */ inline?: boolean }) {
  return (
    <div className={styles.wrap} data-inline={inline || undefined} role="status" aria-label={label} data-testid="app-mark-loader">
      <svg className={styles.mark} viewBox="0 0 512 512" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
        <path className={styles.legs} d="M138 408 L256 104 L374 408" strokeWidth="72" strokeLinejoin="round" pathLength={1} />
        <path className={styles.bar} d="M112 312 H400" strokeWidth="30" pathLength={1} />
      </svg>
    </div>
  );
}
