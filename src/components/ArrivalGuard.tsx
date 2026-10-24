import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './ArrivalGuard.module.css';

/** How long a newly arrived screen ignores taps. Human double taps land within about 300 ms. */
export const ARRIVAL_GUARD_MS = 300;

/**
 * After a screen change, an invisible layer swallows taps for 300 ms, so the second tap of a
 * double tap (e.g. on Finish) never lands on whatever sits at that spot on the next screen
 * (SPEC 13.3). Navigation itself stays instant (SPEC 13.2).
 */
export function ArrivalGuard() {
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setActive(true);
    const t = window.setTimeout(() => setActive(false), ARRIVAL_GUARD_MS);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return active ? <div className={styles.guard} aria-hidden="true" data-testid="arrival-guard" /> : null;
}
