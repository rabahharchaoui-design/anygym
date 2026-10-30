import { useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useAnimate, useReducedMotion } from 'motion/react';
import { tick } from '../../ui/haptics';
import type { BarId, Collars, PlateColors, Unit } from '../../db/types';
import { fitsSleeve, formatAmount, formatMathLine, formatWeight, sumLoad } from '../../lib/load';
import { barSpec, plateSpec } from '../../lib/plates';
import { barLayout, hornLayout, outermost, withPlates, withoutOutermost } from '../../lib/plateLayout';
import { Hint } from '../hint/Hint';
import { PAINT, plateColor } from '../../lib/plateColors';
import { BarSvg } from './BarSvg';
import { PlateChips } from './PlateChips';
import { TypeItSheet } from './TypeItSheet';
import { useReadoutFit } from './useReadoutFit';
import styles from './PlateDiagram.module.css';

type Props = {
  /** Under the total ("Change bar"): the bar control, always in view. */
  mathAction?: ReactNode;
  /** The first time "tap plates" hint; off while a question above must be answered first. */
  hint?: boolean;
  /** A question sits above (unknown bar): a shorter readout and drawing, so the plates stay in view. */
  tight?: boolean;
  unit: Unit;
  /** Bar (or base) weight. null = not known yet: shows "2 × 45 + bar", never a guessed total. */
  bar: number | null;
  /** Enabled plate sizes in the gym, any order. */
  inventory: readonly number[];
  collars: Collars;
  /** Edit set: an older record's gap beyond bar, plates and collars (load.ts otherOf), shown as "other". */
  other?: number;
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
  /** A small control in the free top left corner of the drawing (the bar picker), taking no extra height. */
  corner?: ReactNode;
  /** Which bar, for its real dimensions and sleeve length (SPEC 5.6). Default Olympic. */
  barId?: BarId;
};

const LONG_PRESS_MS = 400;
const FULL_MS = 1500;

/**
 * Plate diagram (SPEC 5.3, 5.6, PLAN 2.0d): tap plates on, tap a sleeve to take the outermost pair
 * off, the big live total over a picture of the loaded bar and one quiet "Each side" line. The math
 * line is not shown; it stays exact underneath (data-math on the total, for the exactness tests).
 */
export function PlateDiagram({ unit, bar, inventory, collars, other = 0, colorMode, value, onChange, variant = 'bar', extraLink, compact = false, corner, mathAction, hint = true, tight = false, barId = 'olympic' }: Props) {
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
  // True scale (SPEC 5.6): the width sets the scale and the height; the plates only move the camera.
  const layout = makeLayout({ unit, perSide: value, width, bar: barId });
  // A horn is one Olympic sleeve long; a bar uses its own sleeve.
  const sleeve = barSpec(horn ? 'olympic' : barId, unit).sleeve;
  const biggest = Math.max(...sizes.map((w) => plateSpec(w, unit).diameter));
  const { total } = sumLoad({ bar, perSide: value, collars, unit, other });
  const math = formatMathLine(bar, value, collars, unit, baseLabel, other);
  const outer = outermost(value);
  // The exact breakdown stays readable by screen readers (Codex 2.0d): hidden on screen, described by the total.
  const mathId = `math${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const readoutRef = useRef<HTMLDivElement>(null);
  const fit = useReadoutFit(readoutRef, `${total}|${unit}|${!!mathAction}|${bar !== null}`);

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
    if (!fitsSleeve(next, unit, sleeve)) return sleeveFull();
    tick();
    onChange(next);
  };

  const removeOuter = () => {
    if (!value.length) return;
    tick();
    onChange(withoutOutermost(value));
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
    <div className={styles.root} data-compact={compact} data-tight={tight || undefined} data-action={mathAction ? 'true' : undefined}>
      <div ref={readoutRef} className={styles.readout} data-fit-level={fit || undefined}>
        {/* Type it | total | Clear on one row in every size: never down by the Done button (1.7e). */}
        <div className={styles.readoutSide} data-fit="side">
          {typeIt}
        </div>
        <span id={mathId} className={styles.srOnly} data-sr-math="">
          {math}
        </span>
        <div className={styles.readoutMain}>
          {total === null ? (
            // Unknown bar or start: no number yet, never a guessed total; the plates stay drawn below.
            <>
              <p className={`${styles.total} num`} aria-live="polite" aria-label="Total not known yet" aria-describedby={mathId} data-testid="plate-total" data-math={math} data-fit="total">
                —<span className={styles.unit}>{unit}</span>
              </p>
              <p className={styles.note} data-testid="plate-note">
                {horn ? 'Starting weight not set' : 'Bar weight not set'}
              </p>
              {mathAction && (
                <div className={styles.mathAction} data-fit="action">
                  {mathAction}
                </div>
              )}
            </>
          ) : (
            <>
              <p className={`${styles.total} num`} aria-live="polite" aria-describedby={mathId} data-testid="plate-total" data-math={math} data-fit="total">
                {formatAmount(total)}
                <span className={styles.unit}>{unit}</span>
              </p>
              {mathAction && (
                <div className={styles.mathAction} data-fit="action">
                  {mathAction}
                </div>
              )}
            </>
          )}
        </div>
        <div className={styles.readoutSide} data-end="" data-fit="side">
          {clear}
        </div>
      </div>

      {corner && <div className={styles.corner}>{corner}</div>}
      <div ref={wrapRef} className={styles.stage}>
        <div ref={scope}>
          <BarSvg
            layout={layout}
            unit={unit}
            colorMode={colorMode}
            reduce={!!reduce}
            outer={outer}
            onRemove={removeOuter}
          />
        </div>
        {hint && <Hint id="plates" className={styles.hint} point="down" />}
      </div>
      {/* One quiet line: the plates on each side as coloured chips; "Sleeve is full" takes its place for a moment. */}
      <div className={styles.below} data-full={full || undefined}>
        <PlateChips unit={unit} perSide={value} label="Each side" className={styles.chips} />
        <p className={styles.full} role="status" data-visible={full}>
          {full ? (horn ? 'Horn is full' : 'Sleeve is full') : ''}
        </p>
      </div>
      {horn && (
        <p className={styles.perSide} data-testid="picker-title">
          Machine · plates per side
        </p>
      )}

      <div className={styles.tray} role="group" aria-label="Plates" data-scroll={sizes.length > 7} data-many={sizes.length > 6} {...(sizes.length > 6 ? { 'data-scroller-x': '' } : {})}>
        {sizes.map((w) => (
          <TrayPlate key={w} weight={w} unit={unit} size={plateSpec(w, unit).diameter / biggest} onAdd={add} />
        ))}
      </div>

      {extraLink && <div className={styles.links}>{extraLink}</div>}

      {bar !== null && (
        <TypeItSheet
          open={typing}
          onClose={() => setTyping(false)}
          unit={unit}
          bar={bar}
          baseLabel={baseLabel}
          inventory={sizes}
          collars={collars}
          sleeveLength={sleeve}
          onApply={onChange}
        />
      )}
    </div>
  );
}

type TrayProps = {
  weight: number;
  unit: Unit;
  /** Diameter relative to the biggest plate in the tray (0 to 1), for the little swatch. */
  size: number;
  onAdd: (weight: number, count: number) => void;
};

/** Tray plate: tap adds one to each side, long press (400 ms) adds two to each side. */
function TrayPlate({ weight, unit, size, onAdd }: TrayProps) {
  const timer = useRef<number>(undefined);
  const longPressed = useRef(false);
  // The tray keeps its numbers and wears the plate's colour as a stripe (PLAN 2.0d).
  const color = plateColor(weight, unit);
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
      data-color={color}
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
        style={{ ['--plate' as string]: PAINT[color].fill, ['--size' as string]: size.toFixed(3), height: `${Math.round(12 + 18 * size)}px` }}
        aria-hidden="true"
      />
      <span className={`${styles.trayWeight} num`}>{formatAmount(weight)}</span>
    </button>
  );
}
