import styles from './LandscapeGuard.module.css';

/**
 * SPEC 13.4: iOS ignores the manifest's portrait lock, so a phone turned sideways gets one clean
 * full screen card. Pure CSS (shown only in landscape on a phone sized screen): the app stays
 * mounted underneath and nothing resets, a running workout or timer included.
 */
export function LandscapeGuard() {
  return (
    <div className={styles.guard} role="alert" data-testid="landscape-guard">
      <svg className={styles.phone} viewBox="0 0 48 48" aria-hidden="true">
        <rect x="15" y="5" width="18" height="38" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <line x1="21" y1="38" x2="27" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className={styles.title}>Turn your phone upright</p>
      <p className={styles.sub}>AnyGym works in portrait. Your workout is kept.</p>
    </div>
  );
}
