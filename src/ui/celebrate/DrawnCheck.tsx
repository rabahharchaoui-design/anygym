import { Check } from 'lucide-react';
import styles from './celebrate.module.css';

type Props = {
  /** Draw it now (the set was just checked). False: it is simply there. */
  draw?: boolean;
  className?: string;
};

/**
 * The SMALL tier's check (PLAN 3.6b, SPEC 23.3): a check mark that draws itself, stroke first to
 * last, in 240 ms. It is a picture inside the caller's own button or cell: it takes no taps and
 * never delays one. `--since` (ms since the tap, set by the caller on any ancestor) lets a check
 * that re-mounts mid draw carry on. Reduced motion: it is simply there.
 */
export function DrawnCheck({ draw = false, className }: Props) {
  return <Check className={`${styles.check} ${className ?? ''}`} data-draw={draw || undefined} aria-hidden="true" />;
}
