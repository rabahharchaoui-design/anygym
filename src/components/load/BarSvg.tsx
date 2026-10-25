// The drawn bar (SPEC 5.3, 5.6): a premium Olympic bar edge on. Every position and size comes
// from plateLayout.ts; this file only paints. Gradients and one pattern are defined once and
// shared by every plate, so the drawing stays cheap (no filters).
import { useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlateColors, Unit } from '../../db/types';
import { formatAmount, formatWeight } from '../../lib/load';
import { plateSpec, type PlateSpec } from '../../lib/plates';
import type { BarLayout, PlateRect, Rect, Side } from '../../lib/plateLayout';
import { FADE } from '../../ui/motion';
import styles from './PlateDiagram.module.css';

/** Plate slide on: quick spring with a tiny settle bounce (damping ratio about 0.6). */
const PLATE_SPRING = { type: 'spring', stiffness: 520, damping: 27, opacity: { duration: 0.1 } } as const;
/** Plate slide off: fast and clean. */
const PLATE_OFF = { type: 'tween', duration: 0.18, ease: [0.4, 0, 1, 1] } as const;

/** Plate body colours. Black iron reads as rubber coated iron; colour coded follows IWF. */
const FILL: Record<PlateSpec['color'], { fill: string; ink: string }> = {
  black: { fill: '#1C1C1F', ink: '#B9B9C0' },
  red: { fill: '#D2302B', ink: '#FFFFFF' },
  blue: { fill: '#2C5FD0', ink: '#FFFFFF' },
  yellow: { fill: '#EDBE2C', ink: '#1A1A1A' },
  green: { fill: '#2A9A4B', ink: '#FFFFFF' },
  white: { fill: '#E6E6E9', ink: '#1A1A1A' },
  chrome: { fill: '#AEB3BB', ink: '#1A1A1A' },
};

export function plateLook(weight: number, unit: Unit, mode: PlateColors) {
  if (mode === 'black') {
    // The 45 carries the raised white label (SPEC 5.3).
    return { fill: FILL.black.fill, ink: unit === 'lb' && weight === 45 ? '#FFFFFF' : FILL.black.ink, matte: true, edge: '#3A3A40' };
  }
  return { ...FILL[plateSpec(weight, unit).color], matte: false, edge: 'rgba(255,255,255,0.28)' };
}

type Props = {
  layout: BarLayout;
  unit: Unit;
  colorMode: PlateColors;
  reduce: boolean;
  /** Pixels at the bottom reserved for labels under thin plates. */
  band: number;
  outer: number | null;
  onRemove: () => void;
};

export function BarSvg({ layout, unit, colorMode, reduce, band, outer, onRemove }: Props) {
  const raw = useId();
  const uid = `bar${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const ref = (name: string) => `url(#${uid}-${name})`;
  const { width, height, sleeves, shoulders, caps, shaft, plates, labels, sides, frame } = layout;

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
  const floor = height - band;
  const cy = floor / 2;
  const tallest = Math.max(sleeves.right.height, ...plates.map((p) => p.height));

  const sideHit = (side: Side) => {
    const s = sleeves[side];
    const top = Math.min(...plates.map((p) => p.y), s.y - 24);
    const bottom = Math.max(...plates.map((p) => p.y + p.height), s.y + s.height + 24, floor + band);
    return { x: s.x, y: top, width: s.width + caps[side].width, height: bottom - top };
  };

  // Knurl zones on the visible shaft: a grip zone at each end and the centre knurl.
  const grip = Math.min(14, shaft.width * 0.3);
  const centre = Math.min(9, shaft.width * 0.18);

  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="plate-svg"
      role="img"
      aria-label={frame ? 'Machine horn' : 'Barbell'}
    >
      <defs>
        {/* Brushed steel shaft: soft, satin. */}
        <linearGradient id={`${uid}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7E838B" />
          <stop offset="0.28" stopColor="#D6D9DE" />
          <stop offset="0.55" stopColor="#A4A8AF" />
          <stop offset="1" stopColor="#53575E" />
        </linearGradient>
        {/* Polished chrome: a sharp specular band near the top, dark core, reflected rim light. */}
        <linearGradient id={`${uid}-chrome`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5E636B" />
          <stop offset="0.14" stopColor="#FFFFFF" />
          <stop offset="0.26" stopColor="#DADDE2" />
          <stop offset="0.55" stopColor="#8C9199" />
          <stop offset="0.82" stopColor="#3F434A" />
          <stop offset="1" stopColor="#9DA2A9" />
        </linearGradient>
        <linearGradient id={`${uid}-collar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#555A61" />
          <stop offset="0.16" stopColor="#E9EBEE" />
          <stop offset="0.5" stopColor="#868B92" />
          <stop offset="0.85" stopColor="#33363C" />
          <stop offset="1" stopColor="#7C8188" />
        </linearGradient>
        <linearGradient id={`${uid}-frame`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3A3B42" />
          <stop offset="1" stopColor="#222328" />
        </linearGradient>
        {/* Fine diamond knurl. */}
        <pattern id={`${uid}-knurl`} width="2.6" height="2.6" patternUnits="userSpaceOnUse">
          <path d="M0 0L2.6 2.6M2.6 0L0 2.6" stroke="#1B1C20" strokeOpacity="0.55" strokeWidth="0.55" />
        </pattern>
        {/* Plate rim: lit from above, falls off toward the floor (a disc seen edge on). */}
        <linearGradient id={`${uid}-cyl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.30" />
          <stop offset="0.1" stopColor="#FFFFFF" stopOpacity="0.10" />
          <stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.82" stopColor="#000000" stopOpacity="0.26" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.48" />
        </linearGradient>
        <linearGradient id={`${uid}-cylMatte`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="0.2" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.03" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.45" />
        </linearGradient>
        {/* Beveled faces: both plate faces roll off into shadow. */}
        <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.5" />
          <stop offset="0.22" stopColor="#000000" stopOpacity="0" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.07" />
          <stop offset="0.78" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.55" />
        </linearGradient>
        {/* Steel hub insert around the sleeve. */}
        <linearGradient id={`${uid}-hub`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A3D43" />
          <stop offset="0.28" stopColor="#8C9097" />
          <stop offset="0.55" stopColor="#3C3F45" />
          <stop offset="1" stopColor="#101113" />
        </linearGradient>
        <linearGradient id={`${uid}-spec`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.85" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft floor shadow under the bar. */}
      <ellipse cx={width / 2} cy={cy + tallest / 2 + 1.5} rx={width * 0.46} ry={4.5} fill={ref('shadow')} />
      <ellipse cx={width / 2} cy={cy + tallest / 2 + 1} rx={width * 0.3} ry={2.2} fill={ref('shadow')} />

      {frame ? (
        <rect {...frame} rx={5} fill={ref('frame')} stroke="#4A4B52" strokeWidth={1} />
      ) : (
        <g>
          <rect {...shaft} fill={ref('steel')} />
          <rect x={shaft.x + 1} y={shaft.y} width={grip} height={shaft.height} fill={ref('knurl')} />
          <rect x={shaft.x + shaft.width - 1 - grip} y={shaft.y} width={grip} height={shaft.height} fill={ref('knurl')} />
          <rect x={shaft.x + shaft.width / 2 - centre / 2} y={shaft.y} width={centre} height={shaft.height} fill={ref('knurl')} />
          {/* Break marks: the shaft between the sleeves is shortened, not to scale. */}
          <path
            d={`M${shaft.x + shaft.width * 0.36} ${shaft.y - 3} l2 ${shaft.height + 6} M${shaft.x + shaft.width * 0.64 - 2} ${shaft.y - 3} l2 ${shaft.height + 6}`}
            stroke="var(--surface-1)"
            strokeWidth="1.5"
          />
        </g>
      )}
      {sides.map((side) => (
        <g key={side}>
          <rect {...sleeves[side]} fill={ref('chrome')} />
          <Flange rect={shoulders[side]} side={side} fill={ref('collar')} />
          <rect {...caps[side]} rx={Math.min(1.5, caps[side].width / 2)} fill={ref('collar')} />
        </g>
      ))}

      {sides.map((side) => (
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
                <Plate key={key} plate={p} layout={layout} unit={unit} colorMode={colorMode} reduce={reduce} uid={uid} />
              ))}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {labels
              .filter((l) => l.side === side)
              .map((l) => (
                <motion.text
                  key={`${l.side}-${l.weight}`}
                  className={styles.underLabel}
                  data-under-label={l.text}
                  data-weight={l.weight}
                  data-count={l.count}
                  y={l.y}
                  fontSize={l.size}
                  textAnchor="middle"
                  dominantBaseline="central"
                  initial={{ x: l.x, opacity: 0 }}
                  animate={{ x: l.x, opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={reduce ? FADE : PLATE_SPRING}
                >
                  {l.text}
                </motion.text>
              ))}
          </AnimatePresence>
        </g>
      ))}
    </svg>
  );
}

/** Inner collar: a raised flange where the shaft meets the sleeve, with a lip toward the plates. */
function Flange({ rect, side, fill }: { rect: Rect; side: Side; fill: string }) {
  if (!rect.width) return null;
  const lip = Math.max(1, rect.width * 0.28);
  const lipX = side === 'right' ? rect.x + rect.width - lip : rect.x;
  return (
    <g>
      <rect {...rect} rx={Math.min(1.5, rect.width / 3)} fill={fill} />
      <rect x={lipX} y={rect.y - 1} width={lip} height={rect.height + 2} rx={0.8} fill={fill} />
      <rect x={lipX} y={rect.y - 1} width={lip} height={rect.height + 2} rx={0.8} fill="#000" opacity={0.18} />
    </g>
  );
}

type PlateProps = {
  plate: PlateRect;
  layout: BarLayout;
  unit: Unit;
  colorMode: PlateColors;
  reduce: boolean;
  uid: string;
};

function Plate({ plate, layout, unit, colorMode, reduce, uid }: PlateProps) {
  const look = plateLook(plate.weight, unit, colorMode);
  const s = layout.sleeves[plate.side];
  const { width: w, height: h, y } = plate;
  // Slides on from the free end of the sleeve, off the same way.
  const offX = plate.side === 'right' ? s.x + s.width + 10 : s.x - w - 10;
  const from = reduce ? { x: plate.x, opacity: 0 } : { x: offX, opacity: 0 };
  const rx = Math.min(w * 0.32, 4);
  const lip = Math.max(1.2, h * 0.022);
  const rim = h * 0.085; // the raised outer rim, then the recessed face
  const hubH = Math.min(h * 0.6, s.height * 2);
  const cy = y + h / 2;
  return (
    <motion.g
      data-plate=""
      data-side={plate.side}
      data-weight={plate.weight}
      initial={from}
      animate={{ x: plate.x, opacity: 1 }}
      exit={reduce ? { opacity: 0, transition: FADE } : { x: offX, opacity: 0, transition: PLATE_OFF }}
      transition={reduce ? FADE : PLATE_SPRING}
    >
      <rect x={0} y={y} width={w} height={h} rx={rx} fill={look.fill} />
      <rect x={0} y={y} width={w} height={h} rx={rx} fill={`url(#${uid}-${look.matte ? 'cylMatte' : 'cyl'})`} />
      <rect x={0} y={y} width={w} height={h} rx={rx} fill={`url(#${uid}-bevel)`} />
      {/* Lighter lip on the rim, top and bottom, and the line where the rim meets the face. */}
      {/* Specular band across the top third: the rim catching the light. */}
      <rect x={w * 0.08} y={y + h * 0.07} width={w * 0.84} height={h * 0.26} rx={Math.min(w * 0.3, 3)} fill={`url(#${uid}-spec)`} />
      {/* Beveled rim lip: a clear lighter edge all round. */}
      <rect x={0.6} y={y + 0.6} width={Math.max(0, w - 1.2)} height={h - 1.2} rx={Math.max(0, rx - 0.6)} fill="none" stroke={look.edge} strokeWidth={1.2} />
      <rect x={w * 0.12} y={y + 0.4} width={w * 0.76} height={lip} rx={lip / 2} fill="#FFFFFF" opacity={look.matte ? 0.28 : 0.32} />
      <rect x={w * 0.12} y={y + h - lip - 0.4} width={w * 0.76} height={lip} rx={lip / 2} fill="#FFFFFF" opacity={0.08} />
      <path d={`M${w * 0.1} ${y + rim}H${w * 0.9}M${w * 0.1} ${y + h - rim}H${w * 0.9}`} stroke="#000" strokeOpacity={0.35} strokeWidth={0.75} />
      {/* Darker steel hub ring around the sleeve, standing a hair proud of the faces. */}
      <rect
        x={-0.6}
        y={cy - hubH / 2}
        width={w + 1.2}
        height={hubH}
        rx={Math.min(1.5, w * 0.2)}
        fill={`url(#${uid}-hub)`}
        stroke="#0A0A0C"
        strokeWidth={0.8}
      />
      <path d={`M0 ${cy - hubH / 2 + 0.8}H${w}`} stroke="#9EA2A9" strokeOpacity={0.55} strokeWidth={0.8} />
      {plate.label !== null && (
        <text
          className={styles.plateLabel}
          x={w / 2}
          y={y + Math.max(rim + plate.label * 0.7, (cy - hubH / 2 - y) / 2)}
          fill={look.ink}
          fontSize={plate.label}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {formatAmount(plate.weight)}
        </text>
      )}
    </motion.g>
  );
}
