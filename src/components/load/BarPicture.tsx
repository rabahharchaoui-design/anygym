import { useLayoutEffect, useRef, useState } from 'react';
import type { BarId, PlateColors, Unit } from '../../db/types';
import { barLayout, hornLayout } from '../../lib/plateLayout';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { BarSvg } from './BarSvg';
import { PlateChips } from './PlateChips';
import styles from './PlateDiagram.module.css';

type Props = {
  unit: Unit;
  /** One side's plates. */
  perSide: readonly number[];
  colorMode: PlateColors;
  /** A machine horn instead of a bar. */
  horn?: boolean;
  barId?: BarId;
  /** Most height the drawing may take (px). */
  maxHeight?: number;
};

/**
 * The plate picture on its own, to look at (import review, PLAN 2.0d critic): the same drawing as
 * the weight picker and the quiet "Each side" chips line, nothing to tap.
 */
export function BarPicture({ unit, perSide, colorMode, horn = false, barId = 'olympic', maxHeight = 84 }: Props) {
  const reduce = useReducedMotionLive();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth) || 300);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const layout = (horn ? hornLayout : barLayout)({ unit, perSide, width, bar: barId, maxHeight });
  return (
    <div className={styles.picture} data-testid="bar-picture">
      <div ref={ref} className={styles.stage}>
        <BarSvg layout={layout} unit={unit} colorMode={colorMode} reduce={reduce} outer={null} onRemove={() => {}} />
      </div>
      <PlateChips unit={unit} perSide={perSide} label="Each side" />
    </div>
  );
}
