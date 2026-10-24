import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'motion/react';
import type { Collars, PlateColors, Unit } from '../../db/types';
import { fitsSleeve, formatAmount, formatMathLine, formatWeight, sumLoad } from '../../lib/load';
import { plateSpec, type PlateSpec } from '../../lib/plates';
import { barLayout, outermost, withPlates, withoutOutermost, type PlateRect, type Side } from '../../lib/plateLayout';
import { FADE, SPRING } from '../motion';
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
};

const HEIGHT = 168;
const LONG_PRESS_MS = 400;
const FULL_MS = 1500;

/** Plate face colours. Black iron is near black with a hairline edge; colour coded follows IWF. */
const FILL: Record<PlateSpec['color'], { fill: string; ink: string }> = {
  black: { fill: '#1C1C1F', ink: '#C9C9CF' },
  red: { fill: '#D9302C', ink: '#FFFFFF' },
  blue: { fill: '#2F64D6', ink: '#FFFFFF' },
  yellow: { fill: '#F2C230', ink: '#1A1A1A' },
  green: { fill: '#2E9E4F', ink: '#FFFFFF' },
  white: { fill: '#EDEDEF', ink: '#1A1A1A' },
  chrome: { fill: '#B9BDC5', ink: '#1A1A1A' },
};

function plateLook(weight: number, unit: Unit, mode: PlateColors) {
  if (mode === 'black') {
    // The 45 carries the raised white label (SPEC 5.3).
    return { fill: FILL.black.fill, ink: unit === 'lb' && weight === 45 ? '#FFFFFF' : FILL.black.ink, edge: '#3A3A41' };
  }
  const look = FILL[plateSpec(weight, unit).color];
  return { ...look, edge: 'rgba(0,0,0,0.35)' };
}

/** Plate diagram (SPEC 5.3): tap plates on, tap the bar to take the outermost off, live total and math. */
export function PlateDiagram({ unit, bar, inventory, collars, colorMode, value, onChange }: Props) {
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
  const layout = barLayout({ unit, perSide: value, inventory: sizes, width, height: HEIGHT, labelOf: formatAmount });
  const { total } = sumLoad({ bar, perSide: value, collars, unit });
  const math = formatMathLine(bar, value, collars, unit);
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

  return (
    <div className={styles.root}>
      <div className={styles.readout}>
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
        <p className={styles.full} role="status" data-visible={full}>
          {full ? 'Sleeve is full' : ''}
        </p>
      </div>

      <div className={styles.tray} role="group" aria-label="Plates">
        {sizes.map((w) => (
          <TrayPlate key={w} weight={w} unit={unit} colorMode={colorMode} onAdd={add} />
        ))}
      </div>

      <div className={styles.links}>
        {bar !== null && (
          <button type="button" className={`${styles.link} pressable`} onClick={() => setTyping(true)}>
            Type it
          </button>
        )}
        <button
          type="button"
          className={`${styles.link} pressable`}
          onClick={() => onChange([])}
          disabled={!value.length}
        >
          Clear
        </button>
      </div>

      {bar !== null && (
        <TypeItSheet
          open={typing}
          onClose={() => setTyping(false)}
          unit={unit}
          bar={bar}
          inventory={sizes}
          collars={collars}
          onApply={onChange}
        />
      )}
    </div>
  );
}

type BarProps = {
  layout: ReturnType<typeof barLayout>;
  unit: Unit;
  colorMode: PlateColors;
  reduce: boolean;
  outer: number | null;
  onRemove: () => void;
};

function BarSvg({ layout, unit, colorMode, reduce, outer, onRemove }: BarProps) {
  const { width, height, sleeves, shoulders, shaft, plates } = layout;
  // Every plate of a size gets a stable key (its nth occurrence), so a heavier plate added later
  // slides in at its place while lighter ones glide outward.
  const seen = new Map<string, number>();
  const keyed = plates.map((p) => {
    const k = `${p.side}-${p.weight}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { p, key: `${k}-${n}` };
  });
  const removeLabel = outer === null ? undefined : `Remove outermost ${formatWeight(outer, unit)} plate`;

  const sideHit = (side: Side) => {
    const s = sleeves[side];
    const top = Math.min(...plates.map((p) => p.y), s.y - 24);
    const bottom = Math.max(...plates.map((p) => p.y + p.height), s.y + s.height + 24);
    return { x: s.x, y: top, width: s.width, height: bottom - top };
  };

  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="plate-svg"
      role="img"
      aria-label="Barbell"
    >
      <defs>
        <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D5D8DE" />
          <stop offset="0.45" stopColor="#9EA2AA" />
          <stop offset="1" stopColor="#5E6168" />
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      <rect {...shaft} fill="url(#steel)" />
      {/* Break marks: the shaft between the sleeves is shortened, not to scale. */}
      <path
        d={`M${shaft.x + shaft.width / 2 - 5} ${shaft.y - 5} l4 ${shaft.height + 10} M${shaft.x + shaft.width / 2 + 1} ${shaft.y - 5} l4 ${shaft.height + 10}`}
        stroke="var(--surface-1)"
        strokeWidth="2.5"
      />
      {(['left', 'right'] as const).map((side) => (
        <g key={side}>
          <rect {...sleeves[side]} rx={1.5} fill="url(#steel)" />
          <rect {...shoulders[side]} rx={1.5} fill="url(#steel)" />
        </g>
      ))}

      {(['left', 'right'] as const).map((side) => (
        <g
          key={side}
          className={styles.side}
          role={outer === null ? undefined : 'button'}
          tabIndex={outer === null ? undefined : 0}
          aria-label={removeLabel}
          data-testid={`remove-${side}`}
          onClick={onRemove}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRemove();
            }
          }}
        >
          <rect {...sideHit(side)} fill="transparent" />
          <AnimatePresence initial={false}>
            {keyed
              .filter(({ p }) => p.side === side)
              .map(({ p, key }) => (
                <Plate key={key} plate={p} layout={layout} unit={unit} colorMode={colorMode} reduce={reduce} />
              ))}
          </AnimatePresence>
        </g>
      ))}
    </svg>
  );
}

type PlateProps = {
  plate: PlateRect;
  layout: ReturnType<typeof barLayout>;
  unit: Unit;
  colorMode: PlateColors;
  reduce: boolean;
};

function Plate({ plate, layout, unit, colorMode, reduce }: PlateProps) {
  const look = plateLook(plate.weight, unit, colorMode);
  const s = layout.sleeves[plate.side];
  // Slides on from the free end of the sleeve, off the same way.
  const offX = plate.side === 'right' ? s.x + s.width + 8 : s.x - plate.width - 8;
  const from = reduce ? { x: plate.x, opacity: 0 } : { x: offX, opacity: 0 };
  const rx = Math.min(3, plate.width * 0.25);
  return (
    <motion.g
      data-plate=""
      data-side={plate.side}
      data-weight={plate.weight}
      initial={from}
      animate={{ x: plate.x, opacity: 1 }}
      exit={from}
      transition={reduce ? FADE : { ...SPRING, opacity: { duration: 0.12 } }}
    >
      <rect
        x={0}
        y={plate.y}
        width={plate.width}
        height={plate.height}
        rx={rx}
        fill={look.fill}
        stroke={look.edge}
        strokeWidth={0.75}
      />
      <rect x={0} y={plate.y} width={plate.width} height={plate.height} rx={rx} fill="url(#sheen)" />
      {plate.label !== null && (
        <text
          className={styles.plateLabel}
          x={plate.width / 2}
          y={plate.y + plate.height / 2}
          fill={look.ink}
          fontSize={plate.label}
          transform={`rotate(-90 ${plate.width / 2} ${plate.y + plate.height / 2})`}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {formatAmount(plate.weight)}
        </text>
      )}
    </motion.g>
  );
}

type TrayProps = {
  weight: number;
  unit: Unit;
  colorMode: PlateColors;
  onAdd: (weight: number, count: number) => void;
};

/** Tray plate: tap adds one to each side, long press (400 ms) adds two to each side. */
function TrayPlate({ weight, unit, colorMode, onAdd }: TrayProps) {
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
      <span className={styles.swatch} style={{ background: look.fill, borderColor: look.edge }} aria-hidden="true" />
      <span className={`${styles.trayWeight} num`}>{formatAmount(weight)}</span>
    </button>
  );
}
