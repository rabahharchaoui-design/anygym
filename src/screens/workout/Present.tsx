import { useIsPresent } from 'motion/react';
import type { ReactNode } from 'react';
import styles from './Workout.module.css';

/** A view on its way out is hidden from screen readers and takes no taps. */
export function Present({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div className={styles.present} aria-hidden={present ? undefined : true} {...(present ? {} : { inert: '' })}>
      {children}
    </div>
  );
}
