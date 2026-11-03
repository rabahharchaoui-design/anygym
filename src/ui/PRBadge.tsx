import styles from './PRBadge.module.css';

/** Sets whose badge already sprang in (this page load): coming back to a row never replays it. */
const shown = new Set<string>();

type Props = {
  /** The set the record belongs to: the entrance plays once per set. */
  setId: string;
  /** What it beat, for the tooltip and screen readers ("185 lb × 6, best ever"). */
  title: string;
  className?: string;
};

/**
 * PLAN 2.2e: a small lime "PR" on a logged set row that beat the exercise's best. It springs in
 * (tap spring, from 0.6, never from 0) the first time it shows; reduced motion: a fade.
 * Decorative for screen readers: the row's own label says "personal record".
 */
export function PRBadge({ setId, title, className }: Props) {
  const fresh = !shown.has(setId);
  shown.add(setId);
  return (
    <span className={`${styles.badge} ${className ?? ''}`} data-fresh={fresh || undefined} data-testid="pr-badge" title={title} aria-hidden="true">
      PR
    </span>
  );
}
