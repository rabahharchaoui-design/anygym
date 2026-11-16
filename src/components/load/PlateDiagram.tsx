import { useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { animate } from 'motion/react';
import { useReducedMotionLive } from '../../ui/useReducedMotionLive';
import { tick } from '../../ui/haptics';
import type { BarId, Collars, PlateColors, Unit } from '../../db/types';
import { fitsSleeve, formatAmount, formatMathLine, formatPlatesOn, formatWeight, sumLoad, type Horns } from '../../lib/load';
import { barSpec, plateSpec } from '../../lib/plates';
import { barLayout, hornLayout, outermost, withPlates, withoutOutermost } from '../../lib/plateLayout';
import { Hint } from '../hint/Hint';
import { hints } from '../../lib/hints';
import { PAINT, plateColor } from '../../lib/plateColors';
import { BarSvg } from './BarSvg';
import { PlateChips } from './PlateChips';
import { PlateTotal } from './PlateTotal';
import { TypeItSheet } from './TypeItSheet';
import { useReadoutFit } from './useReadoutFit';
import styles from './PlateDiagram.module.css';

type Props = {
  /** Under the total ("Change bar"): the bar control, always in view. */
  mathAction?: ReactNode;
  /** The first time "tap plates" hint (the machine's own on a horn); off while a question above must be answered first. */
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
  /** Share of the screen's height the drawing may take, instead of the picker's own (import editor). */
  drawingShare?: number;
  /** A machine horn (PLAN 3.6h2): 1 when the machine loads on one side, so the plates count once; null while not answered (PLAN 3.7a: no total). */
  horns?: Horns | null;
};

const LONG_PRESS_MS = 400;
const FULL_MS = 1500;
/** Share of the screen's height the drawing may take (no layout shift: fixed per screen). */
const HEIGHT_SHARE = 0.17;
/** With a question above (unknown bar or start): a shorter drawing, so the tray stays in view. */
const HEIGHT_SHARE_TIGHT = 0.15;
/** A machine horn is drawn bigger (its plates are as tall as the horn is long). */
const HORN_SHARE = 0.22;
/** A horn on a short screen (320 x 568), so the tray and Done fit without scrolling. */
const HORN_SHARE_SHORT = 0.18;
/** A horn while its start or sides question is open: the whole tray clears Done's fade (PLAN 3.7a, 360 x 640). */
const HORN_SHARE_TIGHT = 0.13;
/** Short screens (the 320 x 568 floor) while a question is open: smaller still, so tray and Done fit. */
const HORN_SHARE_TIGHT_SHORT = 0.1;
/** Reduced motion: the old and new drawings overlap and crossfade. */
const CROSSFADE_MS = 150;

/**
 * Plate diagram (SPEC 5.3, 5.6, PLAN 2.0d): tap plates on, tap a sleeve to take the outermost pair
 * off, the big live total over a picture of the loaded bar and one quiet "Each side" line. The math
 * line is not shown; it stays exact underneath (data-math on the total, for the exactness tests).
 */
export function PlateDiagram({ unit, bar, inventory, collars, other = 0, colorMode, value, onChange, variant = 'bar', extraLink, compact = false, corner, mathAction, hint = true, tight = false, barId = 'olympic', drawingShare, horns: hornsIn = 2 }: Props) {
  // Read live (2.0d critic): turning reduced motion on mid sheet takes effect at once.
  const reduce = useReducedMotionLive();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [screenH, setScreenH] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  // The zoom held by a removal: taking a plate off never zooms in (2.0d critic r2).
  const [hold, setHold] = useState<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [typing, setTyping] = useState(false);
  const fullTimer = useRef<number>(undefined);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth) || 340);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const screen = () => setScreenH(window.innerHeight);
    window.addEventListener('resize', screen);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', screen);
    };
  }, []);

  useLayoutEffect(() => () => window.clearTimeout(fullTimer.current), []);

  const sizes = [...inventory].sort((a, b) => b - a);
  const horn = variant === 'horn';
  // One side or both not answered yet (PLAN 3.7a): only the plates put on are sure, never a total.
  const sidesUnknown = horn && hornsIn === null;
  const horns: Horns = horn && hornsIn !== null ? hornsIn : 2;
  // "Each side" on a bar and a two sided machine; "On the machine" when its plates count once.
  const sideLabel = sidesUnknown ? 'Put on' : horns === 1 ? 'On the machine' : 'Each side';
  const baseLabel = horn ? 'start' : 'bar';
  const makeLayout = horn ? hornLayout : barLayout;
  // True scale (SPEC 5.6): the width sets the scale and the height; the plates only move the camera.
  const short = screenH < 600;
  const share = horn ? (tight ? (short ? HORN_SHARE_TIGHT_SHORT : HORN_SHARE_TIGHT) : short ? HORN_SHARE_SHORT : HORN_SHARE) : tight ? (short ? HORN_SHARE_TIGHT_SHORT : HEIGHT_SHARE_TIGHT) : HEIGHT_SHARE;
  // In a busy sheet on a short screen a horn takes even less (its plates still fit: it shrinks).
  const maxHeight = Math.round(screenH * (drawingShare === undefined ? share : horn && short ? drawingShare * 0.8 : drawingShare));
  const layout = makeLayout({ unit, perSide: value, width, bar: barId, maxHeight, hold });
  // Every change of plates except a removal lets the camera choose freely again.
  const change = (next: number[]) => {
    setHold(undefined);
    setFull(false);
    onChange(next);
  };

  // Reduced motion (read live): a real crossfade. The drawing as it was is laid over the new one
  // and fades out while the new one fades in, both in CROSSFADE_MS; nothing fades to black.
  const ghostOf = useRef<Element | null>(null);
  const sig = `${value.join(',')}|${layout.zoom.toFixed(4)}|${width}|${unit}`;
  const lastSig = useRef(sig);
  useLayoutEffect(() => {
    const host = stageRef.current;
    const svg = host?.querySelector('svg');
    if (reduce && host && svg && ghostOf.current && lastSig.current !== sig) {
      const ghost = ghostOf.current as SVGElement;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setAttribute('data-ghost', '');
      for (const el of [ghost, ...ghost.querySelectorAll('*')]) {
        for (const a of ['data-testid', 'data-plate', 'role', 'tabindex', 'aria-label', 'data-bar-part']) el.removeAttribute(a);
      }
      Object.assign(ghost.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' }); // not cssText: the CSP (PLAN 2.2f)
      host.appendChild(ghost);
      const out = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CROSSFADE_MS, easing: 'ease-out' });
      out.onfinish = () => ghost.remove();
      out.oncancel = () => ghost.remove();
      svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CROSSFADE_MS, easing: 'ease-out' });
    }
    lastSig.current = sig;
    ghostOf.current = reduce && svg ? svg.cloneNode(true) as Element : null;
  });
  // A horn is one Olympic sleeve long; a bar uses its own sleeve.
  const sleeve = barSpec(horn ? 'olympic' : barId, unit).sleeve;
  const biggest = Math.max(...sizes.map((w) => plateSpec(w, unit).diameter));
  const { total } = sumLoad({ bar, perSide: value, collars, unit, other, horns });
  const math = sidesUnknown ? formatPlatesOn(value, unit) : formatMathLine(bar, value, collars, unit, baseLabel, other, horns);
  const outer = outermost(value);
  // The exact breakdown stays readable by screen readers (Codex 2.0d): hidden on screen, described by the total.
  const mathId = `math${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const readoutRef = useRef<HTMLDivElement>(null);
  const fit = useReadoutFit(readoutRef, `${total}|${unit}|${!!mathAction}|${bar !== null}`);

  const sleeveFull = () => {
    setFull(true);
    hints.dismiss(horn ? 'machine' : 'plates');
    window.clearTimeout(fullTimer.current);
    fullTimer.current = window.setTimeout(() => setFull(false), FULL_MS);
    if (!reduce && stageRef.current) {
      void animate(stageRef.current, { x: [0, -7, 7, -4, 4, 0] }, { duration: 0.32, ease: 'easeOut' });
    }
  };

  const add = (weight: number, count: number) => {
    const next = withPlates(value, weight, count);
    if (!fitsSleeve(next, unit, sleeve)) return sleeveFull();
    tick();
    // A plate is on: the first time hint has done its job.
    hints.dismiss(horn ? 'machine' : 'plates');
    change(next);
  };

  const removeOuter = () => {
    if (!value.length) return;
    tick();
    window.clearTimeout(fullTimer.current);
    setFull(false);
    setHold(layout.zoom);
    onChange(withoutOutermost(value));
  };

  const typeIt =
    bar !== null && !sidesUnknown ? (
      <button type="button" className={`${styles.link} pressable`} onClick={() => setTyping(true)}>
        Type it
      </button>
    ) : null;
  // Clear is secondary (gray): accent is kept for Type it and Change bar (2.0d critic).
  const clear = (
    <button type="button" className={`${styles.link} ${styles.quiet} pressable`} onClick={() => change([])} disabled={!value.length}>
      Clear
    </button>
  );

  return (
    <div className={styles.root} data-compact={compact} data-dense={drawingShare !== undefined || undefined} data-horn={horn || undefined} data-tight={tight || undefined} data-action={mathAction ? 'true' : undefined}>
      <div ref={readoutRef} className={styles.readout} data-fit-level={fit || undefined}>
        {/* Type it | total | Clear on one row in every size: never down by the Done button (1.7e). */}
        <div className={styles.readoutSide} data-fit="side">
          {typeIt}
        </div>
        {/* hidden: never seen or measured, still read as the total's description (aria-describedby). */}
        <span id={mathId} className={styles.srOnly} data-sr-math="" hidden>
          {math}
        </span>
        <div className={styles.readoutMain}>
          <PlateTotal total={total} horn={horn} sidesUnknown={sidesUnknown} horns={horns} bar={bar} value={value} unit={unit} math={math} mathId={mathId} mathAction={mathAction} />
        </div>
        <div className={styles.readoutSide} data-end="" data-fit="side">
          {clear}
        </div>
      </div>

      {/* In a busy sheet (the import editor) a question on top is answered first: the picture and
          the tray follow once it is (the total above already says what is known). */}
      {!(tight && drawingShare !== undefined) && (
      <>
      {corner && <div className={styles.corner}>{corner}</div>}
      <div ref={wrapRef} className={styles.stage}>
        <div ref={stageRef} className={styles.host}>
          <BarSvg layout={layout} unit={unit} colorMode={colorMode} reduce={reduce} outer={outer} onRemove={removeOuter} />
        </div>
        {/* "Sleeve is full": a short message just above the tray for a moment; the chips stay. */}
        <p className={styles.full} role="status" data-visible={full} data-testid="sleeve-full">
          {full ? (horn ? 'Horn is full' : 'Sleeve is full') : ''}
        </p>
      </div>
      {/* One quiet line, always one line: the plates on each side as coloured chips. */}
      <div className={styles.below}>
        <PlateChips unit={unit} perSide={value} label={sideLabel} className={styles.chips} fit />
      </div>
      {horn && drawingShare === undefined && (
        <p className={styles.perSide} data-testid="picker-title">
          {sidesUnknown ? 'Machine · plates' : horns === 1 ? 'Machine · plates on one side' : 'Machine · plates per side'}
        </p>
      )}

      {/* The first time hint: only on an empty picture with nothing to answer first, just above the
          tray it explains, never over a tile; gone once a plate is on. */}
      <div className={styles.trayWrap}>
      {hint && value.length === 0 && <Hint id={horn ? 'machine' : 'plates'} className={styles.hint} point="down" />}
      <div className={styles.tray} role="group" aria-label="Plates" data-scroll={sizes.length > 7} data-many={sizes.length > 6} {...(sizes.length > 7 ? { 'data-scroller-x': '' } : {})}>
        {sizes.map((w) => (
          <TrayPlate key={w} weight={w} unit={unit} size={plateSpec(w, unit).diameter / biggest} onAdd={add} once={horns === 1 || sidesUnknown} />
        ))}
      </div>
      </div>

      </>
      )}
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
          horns={horns}
          sideLabel={sideLabel}
          onApply={change}
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
  /** One sided machine (PLAN 3.6h2): the plate goes on the machine, not "to each side". */
  once?: boolean;
};

/** Tray plate: tap adds one to each side, long press (400 ms) adds two to each side. */
function TrayPlate({ weight, unit, size, onAdd, once = false }: TrayProps) {
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
      aria-label={once ? `Add ${label} plate` : `Add ${label} plate to each side`}
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
        style={{ ['--plate' as string]: PAINT[color].fill, ['--edge' as string]: PAINT[color].edge ?? 'transparent', ['--size' as string]: size.toFixed(3), height: `${Math.round(12 + 18 * size)}px` }}
        aria-hidden="true"
      />
      <span className={`${styles.trayWeight} num`}>{formatAmount(weight)}</span>
    </button>
  );
}
