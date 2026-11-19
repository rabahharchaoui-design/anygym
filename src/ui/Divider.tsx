import styles from './Divider.module.css';

type Props = {
  /** Held in from both sides by the screen's side margin, like the rows it separates. */
  inset?: boolean;
  className?: string;
};

/**
 * The Monolith hairline (SPEC 10): 1 px, white at 12%, between rows and fields. Content is grouped by
 * hairlines and space, never by cards. Decoration only, so screen readers skip it.
 */
export function Divider({ inset, className }: Props) {
  return <hr className={`${styles.divider} ${className ?? ''}`} data-inset={inset || undefined} aria-hidden="true" />;
}
