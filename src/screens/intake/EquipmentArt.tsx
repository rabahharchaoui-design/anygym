// PLAN 3.3a: an original line drawing for every SPEC 3 equipment item, drawn in house for AnyGym.
// One style for all 27: a 48 unit box, one 2 unit stroke in currentColor, round caps and joins, no
// fills, footprints normalised to about 36 to 40 units so no drawing reads as a thin strip or
// crowds its box. Each drawing has two layers: the frame, and the part that moves or that you hold.
// On a tile both take the tile's colour (lime when picked); in the ⓘ sheet the moving part turns
// lime in the same stroke (round 2, B4). Nothing here is traced from an app, a photo or an icon set.
import type { ReactNode } from 'react';
import type { EquipmentId } from '../../db/types';

/** The one stroke every drawing uses. */
export const ART_STROKE = 2;

/** One weight stack style for every cable machine: the plates, the guide rod through them. */
function Stack({ x, y, w = 9, h = 16 }: { x: number; y: number; w?: number; h?: number }) {
  const lines = [];
  for (let ly = y + 4; ly < y + h - 1; ly += 4) lines.push(`M${x} ${ly}h${w}`);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={1.5} />
      <path d={`${lines.join('')}M${x + w / 2} ${y - 3}v3`} />
    </>
  );
}

type Drawing = { frame: ReactNode; part: ReactNode };

const DRAWINGS: Record<EquipmentId, Drawing> = {
  // A rack's two uprights with J hooks; the bar and its plates rest on them.
  barbell_rack: {
    frame: <path d="M13 7v34M35 7v34M8 41h10M30 41h10M13 22h3M35 22h-3" />,
    part: (
      <>
        <path d="M3 19h42" />
        <rect x="5" y="11" width="4" height="16" rx="1.5" />
        <rect x="39" y="11" width="4" height="16" rx="1.5" />
      </>
    ),
  },
  // The bar's zig zag grip between big plates.
  ez_curl_bar: {
    frame: (
      <>
        <rect x="4" y="12" width="5" height="24" rx="2" />
        <rect x="39" y="12" width="5" height="24" rx="2" />
        <rect x="9" y="17" width="3" height="14" rx="1" />
        <rect x="36" y="17" width="3" height="14" rx="1" />
      </>
    ),
    part: <path d="M12 24h4l2.5-4 3 8 2.5-8 2.5 8 3-8 2.5 4h4" />,
  },
  // Two heads and the handle you hold.
  dumbbells: {
    frame: (
      <>
        <rect x="9" y="13" width="8" height="22" rx="2" />
        <rect x="31" y="13" width="8" height="22" rx="2" />
        <path d="M9 19H5v10h4M39 19h4v10h-4" />
      </>
    ),
    part: <path d="M17 24h14" />,
  },
  // A round bell and the loop handle you hold.
  kettlebells: {
    frame: <path d="M17.5 38a10.5 10.5 0 1 1 13 0z" />,
    part: <path d="M18 21c-1.5-10 13.5-10 12 0" />,
  },
  // A long pad on two legs.
  flat_bench: {
    frame: <path d="M12 26v13M36 26v13M8 39h8M32 39h8" />,
    part: <rect x="5" y="20" width="38" height="6" rx="3" />,
  },
  // A seat and a back pad set at an angle, with the strut that holds it.
  adjustable_bench: {
    frame: (
      <>
        <rect x="23" y="25" width="19" height="5" rx="2.5" />
        <path d="M27 30v10M39 30v10M23 40h20M13 22l10 12" />
      </>
    ),
    part: <rect x="3" y="25" width="19" height="5" rx="2.5" transform="rotate(45 22.5 27.5)" />,
  },
  // A slanted frame: the hip pad you bend over up top, the foot plate and heel roller low.
  hyperextension_bench: {
    frame: (
      <>
        <path d="M6 42h36M10 42l20-24M38 42l-8-24" />
        <path d="M9 36l9-4" />
        <circle cx="15" cy="28.5" r="2.5" />
      </>
    ),
    part: <rect x="22" y="12" width="16" height="6" rx="3" transform="rotate(-30 30 15)" />,
  },
  // A doorway with the bar across it, the grips marked.
  pull_up_bar: {
    frame: <path d="M8 42V6h32v36" />,
    part: <path d="M5 16h38M13 13.5v5M17 13.5v5M31 13.5v5M35 13.5v5" />,
  },
  // Two parallel handles side by side on their posts, the far one set higher (perspective).
  dip_station: {
    frame: <path d="M8 18v24M18 18v24M28 13v26M40 13v26M5 42h6M15 42h6M25 39h6M37 39h6M18 31h10" />,
    part: <path d="M5 18h16M25 13h18" />,
  },
  // Two guide rails each side, the bar riding them on hooks, safety stops low.
  smith_machine: {
    frame: <path d="M6 6h36M6 42h36M9 6v36M13 6v36M35 6v36M39 6v36M9 33h4M35 33h4" />,
    part: <path d="M3 21h42M11 21v-4.5h2.5M37 21v-4.5h-2.5M5 17v8M43 17v8" />,
  },
  // A reclined seat at the bottom, the sled and foot plate up the angled rail.
  leg_press: {
    frame: <path d="M4 41h40M18 41 40 13M5 23l5 11h10M10 34v7" />,
    part: <path d="M31 9l12 9.5M33 21l4 3" />,
  },
  // Seat and back; the arm swings up to the shin roller.
  leg_extension: {
    frame: (
      <>
        <path d="M10 8v22M10 18l-3 6" />
        <rect x="10" y="27" width="18" height="5" rx="2.5" />
        <path d="M15 32v9M7 41h24" />
      </>
    ),
    part: (
      <>
        <path d="M28 30l8 7" />
        <circle cx="39" cy="38.5" r="3.5" />
      </>
    ),
  },
  // A lying pad on its frame; the arm rises behind to the heel roller.
  leg_curl: {
    frame: (
      <>
        <rect x="4" y="22" width="30" height="5" rx="2.5" />
        <path d="M10 27v14M28 27v14M6 41h26" />
      </>
    ),
    part: (
      <>
        <path d="M34 24.5l6-8" />
        <circle cx="41.5" cy="13" r="3.5" />
      </>
    ),
  },
  // An upright seat and back; two handles push straight ahead.
  chest_press_machine: {
    frame: (
      <>
        <rect x="10" y="8" width="6" height="23" rx="3" />
        <rect x="10" y="31" width="17" height="5" rx="2.5" />
        <path d="M16 36v5M8 41h21" />
      </>
    ),
    part: <path d="M16 17h20M36 11v12M16 25h14" />,
  },
  // The back pad between two arm pads that swing in, as a V.
  pec_deck: {
    frame: (
      <>
        <rect x="20" y="7" width="8" height="23" rx="3" />
        <rect x="16" y="30" width="16" height="5" rx="2.5" />
        <path d="M24 35v6M14 41h20" />
      </>
    ),
    part: <path d="M20 13 7 9v20M28 13l13-4v20" />,
  },
  // The seat and tall back; two handles beside the head press up.
  shoulder_press_machine: {
    frame: (
      <>
        <rect x="20" y="10" width="8" height="21" rx="3" />
        <rect x="15" y="31" width="18" height="5" rx="2.5" />
        <path d="M24 36v6M14 42h20" />
      </>
    ),
    part: <path d="M9 5v15l11 2M39 5v15l-11 2" />,
  },
  // A column with its weight stack; the shoulder pad arm rides up; the toe step below.
  calf_raise_machine: {
    frame: (
      <>
        <path d="M38 6v36M5 42h38" />
        <Stack x={40.5} y={22} w={4} h={16} />
        <rect x="12" y="36" width="16" height="6" rx="1.5" />
      </>
    ),
    part: (
      <>
        <path d="M38 14H16M16 14v-5" />
        <rect x="12" y="15" width="16" height="6" rx="3" />
      </>
    ),
  },
  // A seat with its back; two thigh pads swing open and closed on their arms.
  hip_adductor_abductor: {
    frame: (
      <>
        <rect x="20" y="6" width="8" height="18" rx="3" />
        <rect x="13" y="24" width="22" height="5" rx="2.5" />
        <path d="M24 29v13M15 42h18" />
      </>
    ),
    part: (
      <>
        <path d="M16 29 9 37M32 29l7 8" />
        <rect x="4" y="33" width="5" height="10" rx="2.5" />
        <rect x="39" y="33" width="5" height="10" rx="2.5" />
      </>
    ),
  },
  // The tall frame with its weight stack and top pulley; the cable runs down to a handle.
  cable_station: {
    frame: (
      <>
        <path d="M7 42V6h18M4 42h24M24 6v3" />
        <Stack x={10} y={24} />
        <circle cx="24" cy="11" r="2.5" />
      </>
    ),
    part: <path d="M26 12.5 37 32M32.5 33h9" />,
  },
  // The column with its weight stack and the top pulley; the wide bar comes down; seat and knee pad below.
  lat_pulldown: {
    frame: (
      <>
        <path d="M40 42V5H22M32 42h12M22 5v3" />
        <Stack x={42} y={22} w={4} h={16} />
        <rect x="11" y="27" width="14" height="4" rx="2" />
        <rect x="11" y="35" width="14" height="4" rx="2" />
        <path d="M18 39v3M12 42h12M25 37h15" />
      </>
    ),
    part: <path d="M22 8v7M6 18c5-4 27-4 32 0" />,
  },
  // A low seat on the floor rail, the foot plate, the column with its stack; the cable pulls a V handle.
  seated_row: {
    frame: (
      <>
        <path d="M4 42h38M42 42V7M33 7h9M11 38v4M30 26l2 16" />
        <Stack x={33} y={11} w={6} h={14} />
        <rect x="5" y="33" width="13" height="5" rx="2.5" />
        <circle cx="40" cy="32" r="2" />
      </>
    ),
    part: <path d="M38 32H25M25 32l-4-4M25 32l-4 4" />,
  },
  // A long band with a handle at each end.
  resistance_bands: {
    frame: (
      <>
        <rect x="4" y="8" width="7" height="9" rx="2.5" />
        <rect x="37" y="8" width="7" height="9" rx="2.5" />
      </>
    ),
    part: <path d="M11 13c8 0 6 26 13 26s5-26 13-26" />,
  },
  // Two handles and the rope's loop under them.
  jump_rope: {
    frame: (
      <>
        <rect x="9" y="5" width="5" height="12" rx="2.5" />
        <rect x="34" y="5" width="5" height="12" rx="2.5" />
      </>
    ),
    part: <path d="M11.5 17c-4 28 29 28 25 0" />,
  },
  // The post up to the console and the handrail; the running belt below.
  treadmill: {
    frame: <path d="M34 33 39 9M34 8h10M37.5 16H29M6 40v3M33 40v3" />,
    part: <rect x="3" y="33" width="35" height="7" rx="3.5" />,
  },
  // The seat post, the bars and the floor base; the flywheel up front.
  bike: {
    frame: <path d="M18 14l5 22h11M23 36 17 42M23 36l6 6M9 42h32M13 13h9M34 30 37 11h5M21 25h13" />,
    part: <circle cx="34" cy="30" r="7.5" />,
  },
  // The rail beside them; the steps climb to the right.
  stair_climber: {
    frame: <path d="M6 42h36M42 42V7M42 15h-6" />,
    part: <path d="M6 42v-7h8v-7h8v-7h8v-7h6" />,
  },
  // The long rail, the flywheel housing and its monitor arm; the seat slides, the handle pulls.
  rower: {
    frame: (
      <>
        <path d="M4 38h30M6 38v4M30 38v4" />
        <circle cx="36" cy="30" r="8" />
        <path d="M38 22l3-12h4M32 38h8l2 4M24 30l2 8" />
      </>
    ),
    part: (
      <>
        <rect x="8" y="32" width="11" height="4" rx="2" />
        <path d="M28 27h-7M21 24v6" />
      </>
    ),
  },
};

/**
 * The drawing for one equipment item, sized by its box (CSS), in currentColor. `accent`: the moving
 * part in lime, in the same stroke (the ⓘ sheet).
 */
export function EquipmentArt({ id, className, accent }: { id: EquipmentId; className?: string; accent?: boolean }) {
  const d = DRAWINGS[id];
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={ART_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-art={id}
    >
      <g data-frame="">{d.frame}</g>
      <g data-part="" style={accent ? { stroke: 'var(--accent)' } : undefined}>
        {d.part}
      </g>
    </svg>
  );
}

export const ART_IDS = Object.keys(DRAWINGS) as EquipmentId[];
