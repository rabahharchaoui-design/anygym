// PLAN 3.6f: the focus tiles' icons. Each area has its own outline, so no two read alike at a glance
// (the older small figures differed by a few pixels): a faint frame and the area itself at full
// strength, in the 2 unit round stroke of the app's icons. Simple signs, never a muscle map.
// PLAN 3.6i swaps these for the approved 3D set: the tiles only know the names in FOCUS_ICONS.
import { BicepsFlexed, Grab, PersonStanding, Scale, Wind, type LucideIcon } from 'lucide-react';
import { drawnIcon } from './BodyIcons';

const FAINT = 0.4;
const HEAD = <circle cx="12" cy="4.5" r="2.5" opacity={FAINT} />;

export const FOCUS_ICONS: Record<string, LucideIcon> = {
  // A front bust; the chest line under the collar.
  'Focus:chest': drawnIcon('chest', (
    <>
      {HEAD}
      <path d="M4.5 21v-6a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5v6" opacity={FAINT} />
      <path d="M7.5 14.5c1 2 3.5 2 4.5 0 1 2 3.5 2 4.5 0" />
    </>
  )),
  // The back from behind: the spine, and the lats sweeping from the shoulders in to the waist.
  'Focus:back': drawnIcon('back', (
    <>
      {HEAD}
      <path d="M12 10v10.5" opacity={FAINT} />
      <path d="M6.5 10h11M6.5 10c-2.5 3.5-1.5 7.5 2 10.5M17.5 10c2.5 3.5 1.5 7.5-2 10.5" />
    </>
  )),
  // The head between two round shoulder caps.
  'Focus:shoulders': drawnIcon('shoulders', (
    <>
      {HEAD}
      <path d="M9 12h6M8 20h8" opacity={FAINT} />
      <path d="M9 12a5 5 0 0 0-5 5v3M15 12a5 5 0 0 1 5 5v3" />
    </>
  )),
  'Focus:arms': BicepsFlexed,
  // The trunk, and the lines of the abs.
  'Focus:core': drawnIcon('core', (
    <>
      <rect x="6" y="3" width="12" height="18" rx="4" opacity={FAINT} />
      <path d="M12 6.5v11M8.5 9.5h7M8.5 14h7" />
    </>
  )),
  // The hips from behind, two round halves.
  'Focus:glutes': drawnIcon('glutes', (
    <>
      <path d="M7 3.5c-1 2-1.5 4-1.5 6M17 3.5c1 2 1.5 4 1.5 6" opacity={FAINT} />
      <path d="M5.5 9.5c0 5 2 8.5 4.5 8.5 1.5 0 2-1.5 2-3.5 0 2 .5 3.5 2 3.5 2.5 0 4.5-3.5 4.5-8.5" />
    </>
  )),
  // Two legs under the hip line.
  'Focus:legs': drawnIcon('legs', (
    <>
      <path d="M6 3.5h12" opacity={FAINT} />
      <path d="M8.5 3.5c-.5 4 .5 6 .5 9 0 3-1 5-1 8M15.5 3.5c.5 4-.5 6-.5 9 0 3 1 5 1 8" />
    </>
  )),
  'Focus:posture': PersonStanding,
  'Focus:grip': Grab,
  'Focus:mobility': Wind,
  'Focus:balance': Scale,
};
