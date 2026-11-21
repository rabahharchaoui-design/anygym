import styles from './Skeleton.module.css';

type Props = { height: number | string; className?: string };

/** Skeletons, never spinners (SPEC 13.2): a calm shimmer in the exact space the content takes. Square corners come from the CSS (SPEC 10). */
export function Skeleton({ height, className }: Props) {
  return <div className={`${styles.skeleton} ${className ?? ''}`} style={{ height }} aria-hidden="true" data-skeleton />;
}
