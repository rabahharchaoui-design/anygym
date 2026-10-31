// The four muscle map bodies (SPEC 4.5 "PREMIUM MAP", PLAN 2.2a): upstream art plus our region
// names. The art files are generated copies of react-native-body-highlighter; this file is ours.
import type { ArtPart } from './types';
import { maleFront } from './maleFront';
import { maleBack } from './maleBack';
import { femaleFront } from './femaleFront';
import { femaleBack } from './femaleBack';
import { OUTLINES } from './outlines';

/** Our region names (kept from PLAN 2.2; src/lib/muscles.ts resolves catalog muscles to these). */
export const REGIONS = [
  'chest', 'obliques', 'abs', 'biceps', 'triceps', 'neck', 'front-deltoids', 'head', 'adductor', 'quadriceps', 'knees',
  'calves', 'forearm', 'trapezius', 'back-deltoids', 'upper-back', 'lower-back', 'gluteal', 'hamstring', 'left-soleus',
  'right-soleus',
] as const;

export type Region = (typeof REGIONS)[number];
export type View = 'front' | 'back';
export type BodyKind = 'male' | 'female';

/** Upstream slugs that are the same muscle under the same name here. */
const SAME = new Set<string>([
  'chest', 'obliques', 'abs', 'biceps', 'triceps', 'neck', 'forearm', 'trapezius', 'calves', 'quadriceps', 'gluteal',
  'hamstring', 'upper-back', 'lower-back',
]);

/** Upstream slug to our region, or null for the resting body (hair, head, hands, feet, ankles, knees, tibialis). */
export function regionFor(slug: string, view: View): Region | null {
  if (SAME.has(slug)) return slug as Region;
  if (slug === 'adductors') return 'adductor';
  // One deltoid drawing per view: the front view shows the front delts, the back view the rear delts.
  if (slug === 'deltoids') return view === 'front' ? 'front-deltoids' : 'back-deltoids';
  return null;
}

export interface BodyShape {
  slug: string;
  /** null: drawn as resting body, never lit or tappable. */
  region: Region | null;
  /** hair and head get their own quiet tone. */
  tone: 'muscle' | 'head';
  paths: string[];
}

export interface BodyDrawing {
  viewBox: string;
  outline: string;
  shapes: BodyShape[];
}

const toShapes = (parts: ArtPart[], view: View): BodyShape[] =>
  parts.map((p) => ({
    slug: p.slug,
    region: regionFor(p.slug, view),
    tone: p.slug === 'hair' || p.slug === 'head' ? 'head' : 'muscle',
    paths: [...(p.path.common ?? []), ...(p.path.left ?? []), ...(p.path.right ?? [])],
  }));

// viewBoxes from the upstream wrappers.
export const BODIES: Record<BodyKind, Record<View, BodyDrawing>> = {
  male: {
    front: { viewBox: '0 0 724 1448', outline: OUTLINES.maleFront, shapes: toShapes(maleFront, 'front') },
    back: { viewBox: '724 0 724 1448', outline: OUTLINES.maleBack, shapes: toShapes(maleBack, 'back') },
  },
  female: {
    front: { viewBox: '-50 -40 734 1538', outline: OUTLINES.femaleFront, shapes: toShapes(femaleFront, 'front') },
    back: { viewBox: '756 0 774 1448', outline: OUTLINES.femaleBack, shapes: toShapes(femaleBack, 'back') },
  },
};

/** Regions a view can light, for picking the view that opens. */
export function regionsIn(body: BodyKind, view: View): Set<Region> {
  return new Set(BODIES[body][view].shapes.flatMap((s) => (s.region ? [s.region] : [])));
}

/** Plain-word region names for the tap line. */
export const REGION_NAMES: Record<Region, string> = {
  chest: 'Chest',
  obliques: 'Obliques',
  abs: 'Abs',
  biceps: 'Biceps',
  triceps: 'Triceps',
  neck: 'Neck',
  'front-deltoids': 'Front delts',
  head: 'Head',
  adductor: 'Inner thighs',
  quadriceps: 'Quads',
  knees: 'Knees',
  calves: 'Calves',
  forearm: 'Forearms',
  trapezius: 'Traps',
  'back-deltoids': 'Rear delts',
  'upper-back': 'Upper back',
  'lower-back': 'Lower back',
  gluteal: 'Glutes',
  hamstring: 'Hamstrings',
  'left-soleus': 'Calves',
  'right-soleus': 'Calves',
};
