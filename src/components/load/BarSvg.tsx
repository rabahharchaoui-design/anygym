// The drawn bar (SPEC 5.3, 5.6): a premium Olympic bar edge on. Every position and size comes
// from plateLayout.ts; this file only paints. Gradients and one pattern are defined once and
// shared by every plate, so the drawing stays cheap (no filters).
import { useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { PlateColors, Unit } from '../../db/types';
import { formatAmount, formatWeight } from '../../lib/load';
import { plateSpec, type PlateSpec } from '../../lib/plates';
import { BADGE, FACE, MARKER_LINE, TALL, type BarLayout, type PlateRect, type Rect, type Side } from '../../lib/plateLayout';
import { FADE } from '../../ui/motion';
import styles from './PlateDiagram.module.css';

/** Plate slide on: quick spring with a tiny settle bounce (damping ratio about 0.6). */
const PLATE_SPRING = { type: 'spring', stiffness: 520, damping: 27, opacity: { duration: 0.1 } } as const;
/** Plate slide off: fast and clean. */
const PLATE_OFF = { type: 'tween', duration: 0.18, ease: [0.4, 0, 1, 1] } as const;

/** Plate body colours. Black iron reads as rubber coated iron; colour coded follows IWF. */
const FILL: Record<PlateSpec['color'], { fill: string; ink: string }> = {
  black: { fill: '#1C1C1F', ink: '#F4F4F6' },
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
    return { fill: FILL.black.fill, ink: FILL.black.ink, matte: true, edge: '#3A3A40' };
  }
  return { ...FILL[plateSpec(weight, unit).color], matte: false, edge: 'rgba(255,255,255,0.28)' };
}

type Props = {
  layout: BarLayout;
  unit: Unit;
  colorMode: PlateColors;
  reduce: boolean;
  outer: number | null;
  onRemove: () => void;
};

/** Knurl on a men's shaft, as shares of the shaft length from its centre (IWF style marks). */
const GRIP_IN = 210 / 1310;
const GRIP_OUT = 610 / 1310;
const CENTRE_KNURL = 60 / 1310;

export function BarSvg({ layout, unit, colorMode, reduce, outer, onRemove }: Props) {
  const raw = useId();
  const uid = `bar${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const ref = (name: string) => `url(#${uid}-${name})`;
  const { width, height, sleeves, shoulders, caps, shaft, plates, sides, frame, overflow } = layout;

  // Every plate of a size gets a stable key (its nth occurrence), so a heavier plate added later
  // slides in at its place while lighter ones glide outward.
  const seen = new Map<string, number>();
  const keyed = plates.map((p) => {
    const k = p.more ? `${p.side}-more` : `${p.side}-${p.weight}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return { p, key: `${k}-${n}` };
  });
  const removeLabel = outer === null ? undefined : `Remove outermost ${formatWeight(outer, unit)} plate`;
  const cy = sleeves.right.y + sleeves.right.height / 2;
  const tallest = Math.max(sleeves.right.height, ...plates.map((p) => p.height));

  const sideHit = (side: Side) => {
    // The whole side, from the collar to the drawing's edge, top to bottom: one big target.
    const s = sleeves[side];
    const xs = [s.x, s.x + s.width + caps[side].width, side === 'right' ? width : 0, ...plates.filter((p) => p.side === side).flatMap((p) => [p.x, p.x + p.width])];
    const lo = Math.min(...xs);
    const hi = Math.max(...xs);
    return { x: lo, y: 0, width: hi - lo, height };
  };

  // Knurl zones at their real places: two grip zones and, on a men's bar, the centre knurl.
  const mid = shaft.x + shaft.width / 2;
  const gripW = (GRIP_OUT - GRIP_IN) * shaft.width;
  const centreW = layout.bar === 'womens' ? 0 : 2 * CENTRE_KNURL * shaft.width;

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
          <rect {...shaft} fill={ref('steel')} data-bar-part="shaft" />
          <rect x={mid - GRIP_OUT * shaft.width} y={shaft.y} width={gripW} height={shaft.height} fill={ref('knurl')} />
          <rect x={mid + GRIP_IN * shaft.width} y={shaft.y} width={gripW} height={shaft.height} fill={ref('knurl')} />
          {centreW > 0 && <rect x={mid - centreW / 2} y={shaft.y} width={centreW} height={shaft.height} fill={ref('knurl')} />}
        </g>
      )}
      {sides.map((side) => (
        <g key={side}>
          <rect {...sleeves[side]} fill={ref('chrome')} data-bar-part="sleeve" data-side={side} />
          <Flange rect={shoulders[side]} side={side} fill={ref('collar')} />
          <rect {...caps[side]} rx={Math.min(1.5, caps[side].width / 2)} fill={overflow ? 'var(--amber)' : ref('collar')} />
          {overflow > 0 && <Overflow cap={caps[side]} side={side} />}
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
        </g>
      ))}
    </svg>
  );
}

/** Past the sleeve end: a small amber arrow beyond the end cap (SPEC 5.3 overflow state). */
function Overflow({ cap, side }: { cap: Rect; side: Side }) {
  const h = Math.max(6, cap.height * 0.9);
  const cy = cap.y + cap.height / 2;
  const x0 = side === 'right' ? cap.x + cap.width + 1 : cap.x - 1;
  const tip = side === 'right' ? x0 + 4 : x0 - 4;
  return <path data-testid="sleeve-overflow" d={`M${x0} ${cy - h / 2}L${tip} ${cy}L${x0} ${cy + h / 2}Z`} fill="var(--amber)" />;
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
  // Details scale with the plate, so a thin plate at true scale is not all outline.
  const stroke = Math.min(1.2, w * 0.14);
  const lip = Math.min(Math.max(1, h * 0.022), w * 0.3);
  const rim = h * 0.085; // the raised outer rim, then the recessed face
  const hubH = Math.min(h * 0.6, s.height * 2);
  const cy = y + h / 2;
  // Tall plates carry the number above the hub (and the badge below it); short ones across the middle.
  const tall = h >= TALL;
  const numberY = tall ? (y + rim + cy - hubH / 2) / 2 : cy;
  const badgeY = (y + h - rim + cy + hubH / 2) / 2;
  return (
    <motion.g
      data-plate=""
      data-side={plate.side}
      data-weight={plate.weight}
      data-weights={plate.weights.join(',')}
      data-count={plate.weights.length}
      data-label={plate.text}
      data-more={plate.more || undefined}
      data-lines={plate.more ? plate.lines.join('|') : undefined}
      aria-label={plate.more ? `then ${andList(plate.weights.map(formatAmount))} ${unit}` : plate.weights.length > 1 ? `${plate.weights.length} × ${formatWeight(plate.weight, unit)}` : formatWeight(plate.weight, unit)}
      initial={from}
      animate={{ x: plate.x, opacity: 1 }}
      exit={reduce ? { opacity: 0, transition: FADE } : { x: offX, opacity: 0, transition: PLATE_OFF }}
      transition={reduce ? FADE : PLATE_SPRING}
    >
      {plate.more ? (
        <Marker plate={plate} overflow={layout.overflow > 0} />
      ) : (
        <>
          <rect x={0} y={y} width={w} height={h} rx={rx} fill={look.fill} />
          <rect x={0} y={y} width={w} height={h} rx={rx} fill={`url(#${uid}-${look.matte ? 'cylMatte' : 'cyl'})`} />
          <rect x={0} y={y} width={w} height={h} rx={rx} fill={`url(#${uid}-bevel)`} />
          {/* Lighter lip on the rim, top and bottom, and the line where the rim meets the face. */}
          {/* Specular band across the top third: the rim catching the light. */}
          <rect x={w * 0.08} y={y + h * 0.07} width={w * 0.84} height={h * 0.26} rx={Math.min(w * 0.3, 3)} fill={`url(#${uid}-spec)`} />
          {/* Beveled rim lip: a clear lighter edge all round. */}
          <rect x={stroke / 2} y={y + stroke / 2} width={Math.max(0, w - stroke)} height={h - stroke} rx={Math.max(0, rx - stroke / 2)} fill="none" stroke={look.edge} strokeWidth={stroke} />
          <rect x={w * 0.12} y={y + 0.4} width={w * 0.76} height={lip} rx={lip / 2} fill="#FFFFFF" opacity={look.matte ? 0.28 : 0.32} />
          <rect x={w * 0.12} y={y + h - lip - 0.4} width={w * 0.76} height={lip} rx={lip / 2} fill="#FFFFFF" opacity={0.08} />
          <path d={`M${w * 0.1} ${y + rim}H${w * 0.9}M${w * 0.1} ${y + h - rim}H${w * 0.9}`} stroke="#000" strokeOpacity={0.35} strokeWidth={Math.min(0.75, stroke)} />
          {/* Darker steel hub ring around the sleeve, standing a hair proud of the faces (tall plates). */}
          {tall && (
            <rect
              x={-0.6}
              y={cy - hubH / 2}
              width={w + 1.2}
              height={hubH}
              rx={Math.min(1.5, w * 0.2)}
              fill={`url(#${uid}-hub)`}
              stroke="#0A0A0C"
              strokeWidth={Math.min(0.8, stroke)}
            />
          )}
          {tall && <path d={`M0 ${cy - hubH / 2 + 0.8}H${w}`} stroke="#9EA2A9" strokeOpacity={0.55} strokeWidth={Math.min(0.8, stroke)} />}
          {/* The weight printed on the face (SPEC 5.6: fat numbered plates), "×3" under it for a run. */}
          <text className={styles.plateLabel} x={w / 2} y={numberY} fill={look.ink} fontSize={FACE} textAnchor="middle" dominantBaseline="central" data-face="">
            {plate.face}
          </text>
          {plate.badge && (
            <text className={styles.plateBadge} x={w / 2} y={badgeY} fill={look.ink} fontSize={BADGE} textAnchor="middle" dominantBaseline="central" data-badge="">
              {plate.badge}
            </text>
          )}
        </>
      )}
    </motion.g>
  );
}

/** "25, 10 and 5" */
function andList(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? '');
}

/**
 * The overflow marker on the sleeve: a dark disc edge on with the weights it stands for stacked on
 * its face ("25" over "10"), amber edged when plates run past the real sleeve end (SPEC 5.3).
 */
function Marker({ plate, overflow }: { plate: PlateRect; overflow: boolean }) {
  const { width: w, height: h, y, lines } = plate;
  const top = y + h / 2 - ((lines.length - 1) * MARKER_LINE) / 2;
  return (
    <>
      <rect x={0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={Math.min(4, w * 0.3)} fill="#26272C" stroke={overflow ? 'var(--amber)' : '#6B6E76'} strokeWidth={1} strokeDasharray="3 2" />
      {lines.map((line, i) => (
        <text key={i} className={styles.plateBadge} x={w / 2} y={top + i * MARKER_LINE} fill={overflow ? 'var(--amber)' : '#F4F4F6'} fontSize={BADGE} textAnchor="middle" dominantBaseline="central" {...(i === 0 ? { 'data-face': '' } : { 'data-line': '' })}>
          {line}
        </text>
      ))}
    </>
  );
}
