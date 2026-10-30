import type { Unit } from '../../db/types';
import { formatAmount } from '../../lib/load';
import { PAINT, chipText, sideChips } from '../../lib/plateColors';
import styles from './PlateChips.module.css';

type Props = {
  unit: Unit;
  /** One side's plates, any order. */
  perSide: readonly number[];
  /** Words before the chips ("Each side"); none in tight places. */
  label?: string;
  /** Shown instead of chips when there are no plates (e.g. "Empty bar"); nothing when absent. */
  empty?: string;
  className?: string;
  testId?: string;
  /** 'span' inside buttons and paragraphs. */
  as?: 'p' | 'span';
};

/**
 * The quiet "Each side" line (PLAN 2.0d): one small coloured dot per plate size, matching the
 * drawn plates, with its weight and how many ("45 ×2"). No sums, no equals sign.
 */
export function PlateChips({ unit, perSide, label, empty, className, testId = 'plate-chips', as: Tag = 'p' }: Props) {
  const chips = sideChips(perSide, unit);
  return (
    <Tag className={`${styles.line} ${className ?? ''}`} data-testid={testId} data-empty={chips.length ? undefined : ''}>
      {label && chips.length > 0 && <span className={styles.label}>{label}</span>}
      {chips.length === 0 && empty && <span className={styles.label}>{empty}</span>}
      {chips.map((c) => (
        <span key={c.weight} className={`${styles.chip} num`} data-chip="" data-weight={c.weight} data-count={c.count} data-color={c.color}>
          <span className={styles.dot} style={{ ['--dot' as string]: PAINT[c.color].fill }} aria-hidden="true" />
          {chipText(c, formatAmount)}
        </span>
      ))}
    </Tag>
  );
}
