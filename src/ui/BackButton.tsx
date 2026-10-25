import { Link } from 'react-router-dom';
import { ChevronLeft } from './icons';
import { useNav } from './nav';
import styles from './BackButton.module.css';

type Props = { label: string } & ({ to: string; onPress?: never } | { onPress: () => void; to?: never });

/**
 * Round 44 pt glass back button with a chevron in a 48 pt hit area (SPEC 23.1). With `to` it is a
 * link that pops back to that screen; with `onPress` the screen decides what back means.
 */
export function BackButton({ label, to, onPress }: Props) {
  const go = useNav();
  const face = (
    <span className={styles.face} aria-hidden="true">
      <ChevronLeft className={styles.chevron} strokeWidth={2.4} />
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
          go(to, { kind: 'pop' });
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
