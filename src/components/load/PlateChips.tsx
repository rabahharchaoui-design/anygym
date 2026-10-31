import { useLayoutEffect, useRef } from 'react';
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
  /**
   * Always one line, its height reserved (the plate picker): when it does not fit, the label goes,
   * then the gaps tighten, then the text gets a little smaller (2.0d critic r2).
   */
  fit?: boolean;
};

/**
 * The quiet "Each side" line (PLAN 2.0d): one small coloured dot per plate size, matching the
 * drawn plates, with its weight and how many ("45 ×2"). No sums, no equals sign.
 */
export function PlateChips({ unit, perSide, label, empty, className, testId = 'plate-chips', as: Tag = 'p', fit = false }: Props) {
  const chips = sideChips(perSide, unit);
  const ref = useRef<HTMLElement>(null);
  const key = chips.map((c) => `${c.weight}x${c.count}`).join();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!fit || !el) return;
    // The tightest level needed is set straight on the element (no extra render, no flash).
    const measure = () => {
      let level = 0;
      el.dataset.fit = '0';
      while (level < 3 && el.scrollWidth > el.clientWidth + 0.5) el.dataset.fit = String(++level);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, key, label]);
  return (
    <Tag
      ref={ref as never}
      className={`${styles.line} ${className ?? ''}`}
      data-testid={testId}
      data-empty={chips.length ? undefined : ''}
      data-one={fit || undefined}
    >
      {label && chips.length > 0 && <span className={styles.label}>{label}</span>}
      {chips.length === 0 && empty && <span className={styles.label}>{empty}</span>}
      {chips.map((c) => (
        <span key={c.weight} className={`${styles.chip} num`} data-chip="" data-weight={c.weight} data-count={c.count} data-color={c.color}>
          <span className={styles.dot} style={{ ['--dot' as string]: PAINT[c.color].fill, ['--edge' as string]: PAINT[c.color].edge ?? 'rgba(255, 255, 255, 0.26)' }} aria-hidden="true" />
          {chipText(c, formatAmount)}
        </span>
      ))}
    </Tag>
  );
}
