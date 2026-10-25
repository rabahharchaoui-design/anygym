import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useNav } from './nav';
import styles from './BackButton.module.css';

type Props = { label: string; children: ReactNode } & ({ to: string; onPress?: never } | { onPress: () => void; to?: never });

/** A round 44 pt glass icon control in a 48 pt hit area, as a pushing link or a button. */
export function IconButton({ label, to, onPress, children }: Props) {
  const go = useNav();
  const face = (
    <span className={styles.face} aria-hidden="true">
      {children}
    </span>
  );
  if (to !== undefined) {
    return (
      <Link
        to={to}
        aria-label={label}
        className={styles.hit}
        onClick={(e) => {
          e.preventDefault();
          go(to);
        }}
      >
        {face}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} className={styles.hit} onClick={onPress}>
      {face}
    </button>
  );
}
