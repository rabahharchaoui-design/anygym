import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useAnimate, useReducedMotion } from 'motion/react';
import type { Collars, PlateColors, Unit } from '../../db/types';
import { fitsSleeve, formatAmount, formatMathLine, formatWeight, sumLoad } from '../../lib/load';
import { plateSpec } from '../../lib/plates';
import { LABEL_BAND, barLayout, hornLayout, outermost, withPlates, withoutOutermost } from '../../lib/plateLayout';
import { Hint } from '../hint/Hint';
import { BarSvg, plateLook } from './BarSvg';
import { TypeItSheet } from './TypeItSheet';
import styles from './PlateDiagram.module.css';

type Props = {
  unit: Unit;
  /** Bar (or base) weight. null = not known yet: shows "2 × 45 + bar", never a guessed total. */
  bar: number | null;
  /** Enabled plate sizes in the gym, any order. */
  inventory: readonly number[];
  collars: Collars;
  colorMode: PlateColors;
  /** One side's plates, heaviest first. */
  value: readonly number[];
  onChange: (perSide: number[]) => void;
  /** 'bar': a barbell, plates on both sleeves. 'horn': one plate loaded machine horn, "per side". */
  variant?: 'bar' | 'horn';
  /** Extra link next to Type it / Clear (e.g. "Set starting weight"). */
  extraLink?: ReactNode;
  /** Workout size (SPEC 13.5): smaller bar, one row tray, links beside the total. */
  compact?: boolean;
};

const HEIGHT = 168;
const COMPACT_HEIGHT = 96;
const LONG_PRESS_MS = 400;
const FULL_MS = 1500;

/** Plate diagram (SPEC 5.3): tap plates on, tap the bar to take the outermost off, live total and math. */
export function PlateDiagram({ unit, bar, inventory, collars, colorMode, value, onChange, variant = 'bar', extraLink, compact = false }: Props) {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [full, setFull] = useState(false);
  const [typing, setTyping] = useState(false);
  const fullTimer = useRef<number>(undefined);
  const [scope, animate] = useAnimate<HTMLDivElement>();

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth) || 340);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => () => window.clearTimeout(fullTimer.current), []);

  const sizes = [...inventory].sort((a, b) => b - a);
  const horn = variant === 'horn';
  const baseLabel = horn ? 'start' : 'bar';
  const makeLayout = horn ? hornLayout : barLayout;
  const height = compact ? COMPACT_HEIGHT : HEIGHT;
  const layout = makeLayout({ unit, perSide: value, inventory: sizes, width, height, labelOf: formatAmount, labelBand: LABEL_BAND });
  const biggest = Math.max(...sizes.map((w) => plateSpec(w, unit).diameter));
  const { total } = sumLoad({ bar, perSide: value, collars, unit });
  const math = formatMathLine(bar, value, collars, unit, baseLabel);
  const outer = outermost(value);

  const sleeveFull = () => {
    setFull(true);
    window.clearTimeout(fullTimer.current);
    fullTimer.current = window.setTimeout(() => setFull(false), FULL_MS);
    if (!reduce && scope.current) {
      void animate(scope.current, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.32, ease: 'easeOut' });
    }
  };

  const add = (weight: number, count: number) => {
    const next = withPlates(value, weight, count);
    if (!fitsSleeve(next, unit)) return sleeveFull();
    onChange(next);
  };

  const removeOuter = () => {
    if (value.length) onChange(withoutOutermost(value));
  };

  const typeIt =
    bar !== null ? (
      <button type="button" className={`${styles.link} pressable`} onClick={() => setTyping(true)}>
        Type it
      </button>
    ) : null;
  const clear = (
    <button type="button" className={`${styles.link} pressable`} onClick={() => onChange([])} disabled={!value.length}>
      Clear
    </button>
  );

  return (
    <div className={styles.root} data-compact={compact}>
      <div className={styles.readout}>
        {compact && <div className={styles.readoutSide}>{typeIt}</div>}
        <div className={styles.readoutMain}>
          {total === null ? (
            <p className={`${styles.total} ${styles.unknown} num`} aria-live="polite" data-testid="plate-total">
              {math}
            </p>
          ) : (
            <>
              <p className={`${styles.total} num`} aria-live="polite" data-testid="plate-total">
                {formatAmount(total)}
                <span className={styles.unit}>{unit}</span>
              </p>
              <p className={`${styles.math} num`} data-testid="plate-math">
                {math}
              </p>
            </>
          )}
        </div>
        {compact && <div className={styles.readoutSide} data-end="">{clear}</div>}
      </div>

      <div ref={wrapRef} className={styles.stage}>
        <div ref={scope}>
          <BarSvg
            layout={layout}
            unit={unit}
            colorMode={colorMode}
            reduce={!!reduce}
            band={LABEL_BAND}
            outer={outer}
            onRemove={removeOuter}
          />
        </div>
        <p className={styles.full} role="status" data-visible={full}>
          {full ? (horn ? 'Horn is full' : 'Sleeve is full') : ''}
        </p>
        <Hint id="plates" className={styles.hint} point="down" />
      </div>
      {horn && (
        <p className={styles.perSide} data-testid="picker-title">
          Machine · plates per side
        </p>
      )}

      <div className={styles.tray} role="group" aria-label="Plates" data-scroll={sizes.length > 7}>
        {sizes.map((w) => (
          <TrayPlate key={w} weight={w} unit={unit} colorMode={colorMode} size={plateSpec(w, unit).diameter / biggest} onAdd={add} />
        ))}
      </div>

      {(!compact || extraLink) && (
        <div className={styles.links}>
          {!compact && typeIt}
          {!compact && clear}
          {extraLink}
        </div>
      )}

      {bar !== null && (
        <TypeItSheet
          open={typing}
          onClose={() => setTyping(false)}
          unit={unit}
          bar={bar}
          baseLabel={baseLabel}
          inventory={sizes}
          collars={collars}
          onApply={onChange}
        />
      )}
    </div>
  );
}

type TrayProps = {
  weight: number;
  unit: Unit;
  colorMode: PlateColors;
  /** Diameter relative to the biggest plate in the tray (0 to 1), for the little swatch. */
  size: number;
  onAdd: (weight: number, count: number) => void;
};

/** Tray plate: tap adds one to each side, long press (400 ms) adds two to each side. */
function TrayPlate({ weight, unit, colorMode, size, onAdd }: TrayProps) {
  const timer = useRef<number>(undefined);
  const longPressed = useRef(false);
  const look = plateLook(weight, unit, colorMode);
  const label = formatWeight(weight, unit);

  const cancel = () => window.clearTimeout(timer.current);
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    longPressed.current = false;
    cancel();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      onAdd(weight, 2);
    }, LONG_PRESS_MS);
  };

  useLayoutEffect(() => cancel, []);

  return (
    <button
      type="button"
      className={`${styles.trayPlate} pressable`}
      aria-label={`Add ${label} plate to each side`}
      data-weight={weight}
      onPointerDown={down}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onAdd(weight, 1);
      }}
    >
      <span
        className={styles.swatch}
        style={{ ['--plate' as string]: look.fill, height: `${Math.round(12 + 18 * size)}px` }}
        aria-hidden="true"
      />
      <span className={`${styles.trayWeight} num`}>{formatAmount(weight)}</span>
    </button>
  );
}
