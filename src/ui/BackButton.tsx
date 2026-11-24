import { Link } from 'react-router-dom';
import { ChevronLeft } from './icons';
import { useNav } from './nav';
import styles from './BackButton.module.css';

type Props = {
  label: string;
  /** PLAN M14 (Monolith): no circle and no outline, the chevron and the word "Back" on graphite. */
  plain?: boolean;
} & ({ to: string; onPress?: never } | { onPress: () => void; to?: never });

/**
 * The back mark (SPEC 23.1; Monolith, PLAN M15): a plain chevron in a 48 pt hit area, no boxed square;
 * `plain` adds the word "Back". With `to` it is a
 * link that pops back to that screen; with `onPress` the screen decides what back means.
 */
export function BackButton({ label, to, onPress, plain }: Props) {
  const go = useNav();
  const face = (
    <span className={styles.face} aria-hidden="true" data-plain={plain || undefined}>
      <ChevronLeft className={styles.chevron} strokeWidth={2.4} />
      {plain && <span className={styles.word}>Back</span>}
    </span>
  );
  if (to !== undefined) {
    return (
      <Link
        to={to}
        aria-label={label}
        className={styles.hit}
        data-plain={plain || undefined}
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
    <button type="button" aria-label={label} className={styles.hit} data-plain={plain || undefined} onClick={onPress}>
      {face}
    </button>
  );
}
