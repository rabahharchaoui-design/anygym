import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useNav } from './nav';
import styles from './BackButton.module.css';

type Props = { label: string; children: ReactNode; testId?: string; /** PLAN 3.5v: the face in the accent (the yes) or red (the no). */ tone?: 'accent' | 'red'; /** PLAN M12: no fill and no outline, the icon alone (Monolith run screens). */ plain?: boolean } & ({ to: string; onPress?: never } | { onPress: () => void; to?: never });

/** A 44 pt icon control (square face, or plain: the icon alone) in a 48 pt hit area, as a pushing link or a button. */
export function IconButton({ label, to, onPress, children, testId, tone, plain }: Props) {
  const go = useNav();
  const face = (
    <span className={styles.face} data-tone={tone} data-plain={plain || undefined} aria-hidden="true">
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
    <button type="button" aria-label={label} className={styles.hit} onClick={onPress} data-testid={testId}>
      {face}
    </button>
  );
}
