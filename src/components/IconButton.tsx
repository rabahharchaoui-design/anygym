import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import styles from './IconButton.module.css';

type Props = { to: string; label: string; children: ReactNode };

/** A 48pt round icon link with an accessible label. */
export function IconLink({ to, label, children }: Props) {
  return (
    <Link to={to} aria-label={label} className={`${styles.button} pressable`}>
      {children}
    </Link>
  );
}
