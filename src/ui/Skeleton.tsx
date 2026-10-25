import styles from './Skeleton.module.css';

type Props = { height: number | string; radius?: number; className?: string };

/** Skeletons, never spinners (SPEC 13.2): a calm shimmer in the exact space the content takes. */
export function Skeleton({ height, radius = 18, className }: Props) {
  return <div className={`${styles.skeleton} ${className ?? ''}`} style={{ height, borderRadius: radius }} aria-hidden="true" data-skeleton />;
}
