// PLAN 3.3a: an original line drawing for every SPEC 3 equipment item, drawn in house for AnyGym.
// One style for all 27: a 48 unit box, one 2 unit stroke in currentColor (lime when the tile is
// picked), round caps and joins, no fills. Side or front views, the shape a person spots across a
// gym floor. Nothing here is traced from an app, a photo or an icon set.
import type { ReactNode } from 'react';
import type { EquipmentId } from '../../db/types';

/** The one stroke every drawing uses. */
export const ART_STROKE = 2;

const DRAWINGS: Record<EquipmentId, ReactNode> = {
  // A rack's two uprights with J hooks, the bar resting on them, a plate each end.
  barbell_rack: (
    <>
      <path d="M13 7v34M35 7v34M8 41h10M30 41h10M13 22h3M35 22h-3" />
      <path d="M3 19h42" />
      <rect x="5" y="12" width="4" height="14" rx="1.5" />
      <rect x="39" y="12" width="4" height="14" rx="1.5" />
    </>
  ),
  // The bar with its zig zag grip in the middle, collars and plates at both ends.
  ez_curl_bar: (
    <>
      <path d="M11 24h5l2.5-3 3 6 3-6 3 6 2.5-3h5" />
      <rect x="5" y="16" width="4" height="16" rx="1.5" />
      <rect x="39" y="16" width="4" height="16" rx="1.5" />
      <path d="M2 24h3M43 24h3" />
    </>
  ),
  // Two heads and a handle: a hex dumbbell seen from the side.
  dumbbells: (
    <>
      <path d="M17 24h14" />
      <rect x="10" y="15" width="7" height="18" rx="2" />
      <rect x="31" y="15" width="7" height="18" rx="2" />
      <path d="M10 20H7v8h3M38 20h3v8h-3" />
    </>
  ),
  // A round bell with its loop handle and a flat base.
  kettlebells: (
    <>
      <path d="M17 21c-1.5-11 15.5-11 14 0" />
      <path d="M18 41a12 12 0 1 1 12 0z" />
    </>
  ),
  // A long pad on two legs.
  flat_bench: (
    <>
      <rect x="5" y="19" width="38" height="6" rx="3" />
      <path d="M12 25v14M36 25v14M8 39h8M32 39h8" />
    </>
  ),
  // A seat and a back pad set at an angle, with the ladder that holds it.
  adjustable_bench: (
    <>
      <rect x="23" y="25" width="19" height="5" rx="2.5" />
      <rect x="3" y="25" width="19" height="5" rx="2.5" transform="rotate(45 22.5 27.5)" />
      <path d="M27 30v10M39 30v10M23 40h20M13 22l10 12" />
    </>
  ),
  // The slanted frame: a hip pad up top, the heel rollers low at the back.
  hyperextension_bench: (
    <>
      <path d="M8 41h32M12 41l18-22M36 41 30 19" />
      <rect x="24" y="13" width="14" height="5" rx="2.5" transform="rotate(-38 31 15.5)" />
      <circle cx="15.5" cy="31" r="3" />
      <path d="M18.5 31h4" />
    </>
  ),
  // A doorway with the bar across it, the grips marked.
  pull_up_bar: (
    <>
      <path d="M8 42V6h32v36" />
      <path d="M5 16h38" />
      <path d="M13 13.5v5M17 13.5v5M31 13.5v5M35 13.5v5" />
    </>
  ),
  // Two parallel handles on their posts, joined low, seen from the front.
  dip_station: (
    <>
      <path d="M6 16h12M30 16h12" />
      <path d="M12 16v26M36 16v26M12 31h24" />
      <path d="M7 42h10M31 42h10" />
    </>
  ),
  // Two uprights on rails, the bar fixed between them, the safety stops low.
  smith_machine: (
    <>
      <path d="M6 7h36M6 41h36M11 7v34M37 7v34" />
      <path d="M4 21h40" />
      <rect x="14" y="15" width="3" height="12" rx="1" />
      <rect x="31" y="15" width="3" height="12" rx="1" />
      <path d="M11 33h4M37 33h-4" />
    </>
  ),
  // A reclined seat at the bottom, the sled and foot plate up the angled rail.
  leg_press: (
    <>
      <path d="M4 41h40M18 41 40 13" />
      <path d="M31 9l12 9.5" />
      <path d="M33 21l4 3" />
      <path d="M5 23l5 11h10" />
      <path d="M10 34v7" />
    </>
  ),
  // Seat and back, the arm reaching forward to the shin roller.
  leg_extension: (
    <>
      <path d="M10 10v20" />
      <rect x="10" y="27" width="17" height="5" rx="2.5" />
      <path d="M15 32v9M8 41h22" />
      <path d="M27 30l8 7" />
      <circle cx="38" cy="38" r="3.5" />
      <path d="M10 18l-2 6" />
    </>
  ),
  // A lying pad on its frame, the arm rising behind to the heel roller.
  leg_curl: (
    <>
      <rect x="4" y="22" width="30" height="5" rx="2.5" />
      <path d="M10 27v14M28 27v14M6 41h26" />
      <path d="M34 24.5l6-8" />
      <circle cx="41.5" cy="14" r="3.5" />
    </>
  ),
  // An upright seat and back, two handles pushed straight ahead.
  chest_press_machine: (
    <>
      <rect x="10" y="9" width="6" height="22" rx="3" />
      <rect x="10" y="31" width="16" height="5" rx="2.5" />
      <path d="M16 36v5M9 41h20" />
      <path d="M16 17h18M34 12v10M16 25h12" />
    </>
  ),
  // The back pad between two arm pads that swing in, as a V.
  pec_deck: (
    <>
      <rect x="20" y="8" width="8" height="22" rx="3" />
      <path d="M20 14 8 10v18M28 14l12-4v18" />
      <rect x="17" y="30" width="14" height="5" rx="2.5" />
      <path d="M24 35v6M15 41h18" />
    </>
  ),
  // The seat and tall back, two handles beside the head pressing up.
  shoulder_press_machine: (
    <>
      <rect x="20" y="10" width="8" height="21" rx="3" />
      <rect x="16" y="31" width="16" height="5" rx="2.5" />
      <path d="M24 36v5M15 41h18" />
      <path d="M10 6v14l10 2M38 6v14l-10 2" />
    </>
  ),
  // Shoulder pads on a column, the raised step for the toes below.
  calf_raise_machine: (
    <>
      <path d="M9 6v35M5 41h34" />
      <path d="M9 14h20" />
      <rect x="18" y="11" width="9" height="5" rx="2.5" />
      <rect x="29" y="11" width="9" height="5" rx="2.5" />
      <rect x="20" y="35" width="14" height="6" rx="1.5" />
    </>
  ),
  // A seat with two thigh pads opening out to the sides.
  hip_adductor_abductor: (
    <>
      <rect x="20" y="7" width="8" height="20" rx="3" />
      <rect x="17" y="27" width="14" height="5" rx="2.5" />
      <path d="M19 30 9 38M29 30l10 8" />
      <rect x="4" y="35" width="9" height="5" rx="2.5" transform="rotate(-38 8.5 37.5)" />
      <rect x="35" y="35" width="9" height="5" rx="2.5" transform="rotate(38 39.5 37.5)" />
      <path d="M24 32v9M18 41h12" />
    </>
  ),
  // The tall frame: the weight stack, a pulley up top, the cable down to a handle.
  cable_station: (
    <>
      <path d="M8 41V6h16M4 41h22" />
      <rect x="11" y="24" width="9" height="16" rx="1.5" />
      <path d="M11 29h9M11 34h9" />
      <circle cx="24" cy="9" r="3" />
      <path d="M26.5 11 37 31" />
      <path d="M33 32.5h8" />
    </>
  ),
  // A wide bar hanging from the top pulley, the seat with its knee pad below.
  lat_pulldown: (
    <>
      <path d="M32 41V5h-8M26 41h12" />
      <path d="M24 5v9" />
      <path d="M8 17c5-3.5 27-3.5 32 0" />
      <rect x="13" y="25" width="13" height="4" rx="2" />
      <rect x="13" y="33" width="13" height="4" rx="2" />
      <path d="M19.5 37v4M14 41h12" />
    </>
  ),
  // Low seat and foot plate on a floor rail, the cable to a V handle.
  seated_row: (
    <>
      <path d="M4 41h38M40 41V9" />
      <rect x="6" y="33" width="13" height="4" rx="2" />
      <path d="M31 27l2 14" />
      <path d="M40 23 23 26" />
      <path d="M23 26l-3-3.5M23 26l-3 3.5" />
    </>
  ),
  // A long band with a handle at each end.
  resistance_bands: (
    <>
      <path d="M11 13c8 0 6 22 13 22s5-22 13-22" />
      <rect x="4" y="9" width="7" height="8" rx="2.5" />
      <rect x="37" y="9" width="7" height="8" rx="2.5" />
    </>
  ),
  // Two handles and the rope's loop under them.
  jump_rope: (
    <>
      <rect x="9" y="6" width="5" height="11" rx="2.5" />
      <rect x="34" y="6" width="5" height="11" rx="2.5" />
      <path d="M11.5 17c-4 26 29 26 25 0" />
    </>
  ),
  // The running belt, the post up to the console, the handrail.
  treadmill: (
    <>
      <rect x="3" y="34" width="34" height="6" rx="3" />
      <path d="M33 34 38 10M34 9h9M36.5 17H29" />
    </>
  ),
  // A flywheel up front, the seat post and the bars, on a floor base.
  bike: (
    <>
      <circle cx="34" cy="30" r="7" />
      <path d="M18 14l5 22h11M23 36 17 41M23 36l6 5M10 41h30" />
      <path d="M13 13h9" />
      <path d="M34 30 37 12h5" />
      <path d="M21 25h13" />
    </>
  ),
  // Steps climbing to the right, the rail beside them.
  stair_climber: (
    <>
      <path d="M6 41v-7h8v-7h8v-7h8v-7h6" />
      <path d="M6 41h36M42 41V8M42 16l-6 0" />
    </>
  ),
  // The long rail, the seat that slides on it, the flywheel and its handle.
  rower: (
    <>
      <path d="M4 37h30" />
      <circle cx="38" cy="31" r="6" />
      <rect x="9" y="31" width="11" height="4" rx="2" />
      <path d="M26 29l2 8" />
      <path d="M33 29h-9M24 26.5v5" />
      <path d="M6 37v4M38 37v4M32 41h10" />
    </>
  ),
};

/** The drawing for one equipment item, sized by its box (CSS), in currentColor. */
export function EquipmentArt({ id, className }: { id: EquipmentId; className?: string }) {
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
      {DRAWINGS[id]}
    </svg>
  );
}

export const ART_IDS = Object.keys(DRAWINGS) as EquipmentId[];
