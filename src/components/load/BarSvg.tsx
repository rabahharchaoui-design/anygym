// The drawn bar (SPEC 5.3, 5.6, PLAN 2.0d): a premium Olympic bar edge on, colour coded plates with
// no numbers, every plate drawn. Every position and size comes from plateLayout.ts; this file only
// paints and runs the camera zoom. Gradients and one pattern are defined once and shared by every
// plate, so the drawing stays cheap (no filters).
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent } from 'motion/react';
import type { PlateColors, Unit } from '../../db/types';
import { formatAmount, formatWeight } from '../../lib/load';
import { IRON_EDGE, PAINT } from '../../lib/plateColors';
import type { BarLayout, PlateRect, Rect, Side } from '../../lib/plateLayout';
import styles from './PlateDiagram.module.css';

/** Plate slide on: a quick spring with a tiny settle (about 250 ms), drawn from its first frame. */
const PLATE_SPRING = { type: 'spring', visualDuration: 0.24, bounce: 0.18 } as const;
/** Plate slide off: fast and clean, outward. */
const PLATE_OFF = { type: 'tween', duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;
/** The camera zoom: settles in about 250 ms, barely any bounce (PLAN 2.0d). */
const ZOOM_SPRING = { type: 'spring', visualDuration: 0.25, bounce: 0.08 } as const;
/** A plate slides this far (screen px) on and off, at any zoom, so even a thin one is seen moving. */
const SLIDE_PX = 14;

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

/** "45, 45, 25 and 10" */
function andList(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? '');
}

/** What a screen reader hears: every plate on one side, heaviest first (SPEC 0, PLAN 2.0d). */
export function barLabel(perSide: readonly number[], unit: Unit, horn: boolean): string {
  const what = horn ? 'Machine horn' : 'Barbell';
  if (!perSide.length) return `${what}, ${horn ? 'no plates' : 'empty'}`;
  const list = andList([...perSide].sort((a, b) => b - a).map(formatAmount));
  return `${what}. ${horn ? 'Plates' : 'Each side'}: ${list} ${unit}`;
}

const sceneTransform = (z: number, cx: number, cy: number) => `translate(${cx} ${cy}) scale(${z}) translate(${-cx} ${-cy})`;

export function BarSvg({ layout, unit, colorMode, reduce, outer, onRemove }: Props) {
  const raw = useId();
  const uid = `bar${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const ref = (name: string) => `url(#${uid}-${name})`;
  const { width, height, sleeves, shoulders, caps, shaft, plates, sides, frame, zoom, cx, cy, mid, hits } = layout;
  const horn = !!frame;
  // A side pressed right now: a soft light flash under the finger, within the first frame.
  const [pressed, setPressed] = useState<Side | null>(null);

  // The camera: two motion values (zoom and its anchor) drive the scene's transform and spring
  // together, so the empty close up pulls back AND centres in one move when the first plate goes on.
  const scene = useRef<SVGGElement>(null);
  const z = useMotionValue(zoom);
  const ax = useMotionValue(cx);
  const cyRef = useRef(cy);
  cyRef.current = cy;
  const paint = () => scene.current?.setAttribute('transform', sceneTransform(z.get(), ax.get(), cyRef.current));
  useMotionValueEvent(z, 'change', paint);
  useMotionValueEvent(ax, 'change', paint);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) {
      // Reduced motion: the camera cuts; the picture crossfades (PlateDiagram overlays the old one).
      z.jump(zoom);
      ax.jump(cx);
      paint();
      return;
    }
    const a1 = animate(z, zoom, ZOOM_SPRING);
    const a2 = animate(ax, cx, ZOOM_SPRING);
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [zoom, cx, reduce, z, ax]);
  useLayoutEffect(paint, [cy]);

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
  const perSide = plates.filter((p) => p.side === 'right').map((p) => p.weight);
  const tallest = Math.max(0, ...plates.map((p) => p.height));

  // Knurl zones at their real places: two grip zones and, on a men's bar, the centre knurl.
  const shaftMid = shaft.x + shaft.width / 2;
  const gripW = (GRIP_OUT - GRIP_IN) * shaft.width;
  const centreW = layout.bar === 'womens' ? 0 : 2 * CENTRE_KNURL * shaft.width;

  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="plate-svg"
      data-zoom={zoom.toFixed(4)}
      data-thin={layout.thin.toFixed(4)}
      data-cropped={layout.cropped || undefined}
      data-reduce={reduce || undefined}
      role="img"
      aria-label={barLabel(perSide, unit, horn)}
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
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="0.08" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000000" stopOpacity="0.22" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
        </linearGradient>
        {/* Rounded faces: both faces roll off into shadow, so touching plates read as separate discs. */}
        <linearGradient id={`${uid}-bevel`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000000" stopOpacity="0.55" />
          <stop offset="0.18" stopColor="#000000" stopOpacity="0.08" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.1" />
          <stop offset="0.8" stopColor="#000000" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.6" />
        </linearGradient>
        {/* Steel hub insert around the sleeve. */}
        <linearGradient id={`${uid}-hub`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A3D43" />
          <stop offset="0.28" stopColor="#A2A6AD" />
          <stop offset="0.55" stopColor="#4A4D54" />
          <stop offset="1" stopColor="#141518" />
        </linearGradient>
        <radialGradient id={`${uid}-shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000000" stopOpacity="0.85" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g ref={scene} transform={sceneTransform(z.get(), ax.get(), cy)} data-scene="" aria-hidden="true">
        {/* Soft floor shadow where the plates stand (none under an empty bar or horn: it hangs in a rack). */}
        {plates.length > 0 && (
          <>
            <ellipse cx={mid} cy={cy + tallest / 2 + 1.5} rx={width * 0.46} ry={4} fill={ref('shadow')} />
            <ellipse cx={mid} cy={cy + tallest / 2 + 1} rx={width * 0.3} ry={2} fill={ref('shadow')} />
          </>
        )}

        {frame ? (
          <rect {...frame} data-bar-part="frame" rx={Math.min(6, frame.width / 4)} fill={ref('frame')} stroke="#4A4B52" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ) : (
          <g>
            <rect {...shaft} fill={ref('steel')} data-bar-part="shaft" />
            <rect x={shaftMid - GRIP_OUT * shaft.width} y={shaft.y} width={gripW} height={shaft.height} fill={ref('knurl')} />
            <rect x={shaftMid + GRIP_IN * shaft.width} y={shaft.y} width={gripW} height={shaft.height} fill={ref('knurl')} />
            {centreW > 0 && <rect x={shaftMid - centreW / 2} y={shaft.y} width={centreW} height={shaft.height} fill={ref('knurl')} />}
          </g>
        )}
        {sides.map((side) => (
          <g key={side}>
            <rect {...sleeves[side]} fill={ref('chrome')} data-bar-part="sleeve" data-side={side} />
            <Flange rect={shoulders[side]} side={side} fill={ref('collar')} />
            <rect {...caps[side]} rx={Math.min(1.5, caps[side].width / 2)} fill={ref('collar')} data-bar-part="cap" data-side={side} />
          </g>
        ))}

        {sides.map((side) => (
          <g key={side} className={styles.plates} aria-hidden="true">
            <AnimatePresence initial={false}>
              {keyed
                .filter(({ p }) => p.side === side)
                .map(({ p, key }, i, all) => (
                  <Plate key={key} plate={p} sleeve={sleeves[side]} colorMode={colorMode} reduce={reduce} uid={uid} zoom={zoom} outermost={i === all.length - 1} />
                ))}
            </AnimatePresence>
          </g>
        ))}
      </g>

      {/* Tap anywhere on a side, from the sleeve out: the outermost pair comes off (PLAN 2.0d). */}
      {sides.map((side) => {
        const hit = hits[side];
        if (!hit) return null;
        return (
          <g
            key={side}
            className={styles.side}
            role={outer === null ? undefined : 'button'}
            tabIndex={outer === null ? undefined : 0}
            aria-label={removeLabel}
            data-testid={`remove-${side}`}
            data-pressed={(pressed === side && outer !== null) || undefined}
            onClick={onRemove}
            onPointerDown={(e) => e.button === 0 && setPressed(side)}
            onPointerUp={() => setPressed(null)}
            onPointerLeave={() => setPressed(null)}
            onPointerCancel={() => setPressed(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRemove();
              }
            }}
          >
            <rect {...hit} fill="transparent" />
            {/* The press: a soft light wash over the side, shown within one frame. */}
            <rect x={hit.x + 2} y={2} width={Math.max(0, hit.width - 4)} height={Math.max(0, height - 4)} rx={14} className={styles.flash} />
          </g>
        );
      })}
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
  sleeve: Rect;
  colorMode: PlateColors;
  reduce: boolean;
  uid: string;
  /** The camera's zoom now: slides are a set distance on screen at any zoom. */
  zoom: number;
  /** The last plate on the side: the sleeve comes out of its outer face (a hub ring there only). */
  outermost: boolean;
};

/**
 * One plate edge on, no number: the colour coded rim with a lit top edge, shading toward the
 * floor and rounded faces. The plates hide the sleeve; only the outermost shows the steel hub where
 * the sleeve comes out. Dark plates (black, the grays, every black iron plate) wear a 1 px light
 * edge so they never sink into the sheet. Black iron mode keeps the rubber body and shows the
 * plate's colour as a band around the rim.
 */
function Plate({ plate, sleeve, colorMode, reduce, uid, zoom, outermost }: PlateProps) {
  const paint = PAINT[plate.color];
  const iron = colorMode === 'black';
  const { width: w, height: h, y } = plate;
  // Slides on from just outward of its place, and off the same way, by SLIDE_PX on screen.
  const out = (plate.side === 'right' ? 1 : -1) * (SLIDE_PX / Math.max(zoom, 1e-6));
  // Reduced motion: no slide; the whole picture crossfades (PlateDiagram overlays the old drawing).
  const from = reduce ? { x: plate.x, opacity: 1 } : { x: plate.x + out, opacity: 1 };
  const rx = Math.min(w * 0.38, 2.4);
  const lip = Math.max(0.6, Math.min(h * 0.018, 1.4));
  const cy = y + h / 2;
  const edge = iron ? IRON_EDGE : paint.edge;
  // The hub ring on the outer face: a little proud of the plate, a bit fatter than the sleeve.
  const hubW = Math.max(1.2, Math.min(w * 0.35, sleeve.height * 0.45));
  const hubH = Math.min(h * 0.5, sleeve.height * 1.45);
  const hubX = plate.side === 'right' ? w - hubW * 0.55 : -hubW * 0.45;
  return (
    <motion.g
      data-plate=""
      data-side={plate.side}
      data-weight={plate.weight}
      data-color={plate.color}
      data-index={plate.index}
      initial={from}
      animate={{ x: plate.x, opacity: 1 }}
      exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { x: plate.x + out, opacity: 0, transition: PLATE_OFF }}
      transition={reduce ? { duration: 0 } : PLATE_SPRING}
    >
      <rect x={0} y={y} width={w} height={h} rx={rx} fill={iron ? PAINT.black.fill : paint.fill} />
      {iron && <rect x={w * 0.28} y={y + h * 0.05} width={w * 0.44} height={h * 0.9} rx={Math.min(1, w * 0.1)} fill={paint.fill} />}
      <rect x={0} y={y} width={w} height={h} rx={rx} fill={`url(#${uid}-cyl)`} />
      <rect x={0} y={y} width={w} height={h} rx={rx} fill={`url(#${uid}-bevel)`} />
      {/* Lit lip along the top of the rim, a faint one along the bottom. */}
      <rect x={w * 0.14} y={y + 0.3} width={w * 0.72} height={lip} rx={lip / 2} fill={iron ? '#FFFFFF' : paint.rim} opacity={0.75} />
      <rect x={w * 0.14} y={y + h - lip - 0.3} width={w * 0.72} height={lip} rx={lip / 2} fill="#FFFFFF" opacity={0.08} />
      {/* A hairline where the plate meets the next one. */}
      <rect x={w - Math.min(0.5, w * 0.08)} y={y + rx} width={Math.min(0.5, w * 0.08)} height={Math.max(0, h - 2 * rx)} fill={paint.shade} opacity={0.7} />
      {/* Dark plates: a 1 px light edge (on screen, at any zoom). */}
      {edge && <rect x={0.25} y={y + 0.25} width={Math.max(0, w - 0.5)} height={Math.max(0, h - 0.5)} rx={rx} fill="none" stroke={edge} strokeWidth={1} strokeOpacity={0.9} vectorEffect="non-scaling-stroke" data-edge="" />}
      {/* The steel hub where the sleeve comes out of the outermost plate. */}
      {outermost && <rect x={hubX} y={cy - hubH / 2} width={hubW} height={hubH} rx={Math.min(1, hubW * 0.3)} fill={`url(#${uid}-hub)`} data-hub="" />}
    </motion.g>
  );
}
