// Glossary for the ⓘ info sheets (SPEC 13.7). Plain words: what it is and how to spot it.
// Only true standards (SPEC 5.3) get a weight; everything else says to check the sticker or
// stamp. Never a guessed "typical" weight. Every entry starts unreviewed: the Review screen
// (SPEC 9.4, PLAN 2.4) lists them for approval, illustration included.
import type { ComponentType } from 'react';
import * as Art from '../components/info/illustrations';

export type GlossaryEntry = {
  id: string;
  term: string;
  /** One or two plain sentences: what it is, how to spot it in a gym. */
  sentences: string[];
  /** The standard weight, "Check the sticker or stamp, it varies", or null for workout terms. */
  weightLine: string | null;
  /** Line illustration, or null when it cannot be drawn accurately (the sheet shows words only). */
  illustration: ComponentType | null;
  reviewed: false;
};

export const VARIES = 'Check the sticker or stamp, it varies';

/** The only entries allowed to show a number (SPEC 5.3 standards). */
export const STANDARD_WEIGHT_IDS = ['olympic-barbell', 'womens-bar', 'collars-clips'] as const;

type Draft = Omit<GlossaryEntry, 'reviewed'>;

const ENTRIES: Draft[] = [
  // Bars
  {
    id: 'olympic-barbell',
    term: 'Olympic barbell',
    sentences: [
      'The long standard bar for squats, bench and deadlifts.',
      'Look for thick sleeves at both ends that spin, and rough grip marks on the middle.',
    ],
    weightLine: 'Olympic bar: 45 lb / 20 kg',
    illustration: Art.OlympicBarArt,
  },
  {
    id: 'womens-bar',
    term: "Women's bar",
    sentences: [
      'A slightly shorter Olympic bar with a thinner grip.',
      'Look for the thinner grip and no grip marks in the very middle.',
    ],
    weightLine: "Women's bar: 35 lb / 15 kg",
    illustration: Art.WomensBarArt,
  },
  {
    id: 'ez-curl-bar',
    term: 'EZ curl bar',
    sentences: [
      'A short bar with zigzag bends in the middle, easier on the wrists for curls and arm moves.',
      'Usually on a rack with the dumbbells or the fixed weight bars.',
    ],
    weightLine: VARIES,
    illustration: Art.EzBarArt,
  },
  {
    id: 'trap-bar',
    term: 'Trap (hex) bar',
    sentences: [
      'A six sided frame you stand inside, with a handle on each side.',
      'Used for deadlifts and carries; plates go on the sleeves sticking out of the sides.',
    ],
    weightLine: VARIES,
    illustration: Art.TrapBarArt,
  },
  {
    id: 'fixed-barbell',
    term: 'Fixed weight barbell',
    sentences: [
      'A short bar with the plates welded on, so you cannot change the weight.',
      'They sit on a rack in a row; the weight is printed on the ends.',
    ],
    weightLine: VARIES,
    illustration: Art.FixedBarbellArt,
  },
  {
    id: 'smith-machine',
    term: 'Smith machine',
    sentences: [
      'A barbell fixed to two rails, so it only moves straight up and down.',
      'Twist the bar to hook it on or off the rails.',
    ],
    weightLine: VARIES,
    illustration: Art.SmithMachineArt,
  },
  // Cables
  {
    id: 'cable-station',
    term: 'Cable station',
    sentences: [
      'A tower with a weight stack and a cable over a pulley; you clip a handle on the end.',
      'The pulley slides up or down so you can pull from high, low or in between.',
    ],
    weightLine: VARIES,
    illustration: Art.CableStationArt,
  },
  {
    id: 'rope',
    term: 'Rope attachment',
    sentences: [
      'A thick rope with a knob on each end that clips onto a cable.',
      'Used for triceps pushdowns and face pulls; usually hanging by the cable station.',
    ],
    weightLine: VARIES,
    illustration: Art.RopeArt,
  },
  {
    id: 'straight-bar',
    term: 'Straight bar attachment',
    sentences: [
      'A short metal bar with a ring in the middle that clips onto a cable.',
      'Used for pushdowns, curls and rows on the cable station.',
    ],
    weightLine: VARIES,
    illustration: Art.StraightBarAttachmentArt,
  },
  {
    id: 'v-handle',
    term: 'V handle',
    sentences: [
      'A cable handle with two grips close together, so your palms face each other.',
      'Most often used for seated rows and close grip pulldowns.',
    ],
    weightLine: VARIES,
    illustration: null, // words only: drawing failed the tester audit
  },
  {
    id: 'd-handle',
    term: 'D handle',
    sentences: [
      'A single hand cable handle shaped like the letter D.',
      'Used for one arm moves: rows, flyes and pushdowns.',
    ],
    weightLine: VARIES,
    illustration: null, // words only: drawing failed the tester audit
  },
  // Machines
  {
    id: 'plate-loaded-machine',
    term: 'Plate loaded machine',
    sentences: [
      'A machine with no weight stack: you slide plates onto its horns instead.',
      'Some start heavier than zero before any plates go on, which is why we ask once.',
    ],
    weightLine: VARIES,
    illustration: Art.PlateLoadedMachineArt,
  },
  {
    id: 'weight-stack-machine',
    term: 'Weight stack machine',
    sentences: [
      'A machine with a column of flat plates; you pick the weight by putting the pin in a plate.',
      'Use the number next to the pin. The steps between plates differ from machine to machine.',
    ],
    weightLine: VARIES,
    illustration: Art.WeightStackArt,
  },
  {
    id: 'leg-press',
    term: 'Leg press',
    sentences: [
      'You sit leaning back and push a big footplate away with your legs.',
      'Many are plate loaded, with the plates on horns at the sides of the sled.',
    ],
    weightLine: VARIES,
    illustration: Art.LegPressArt,
  },
  {
    id: 'hack-squat',
    term: 'Hack squat',
    sentences: [
      'A squat machine: you stand on a sloped footplate with your back on a pad and shoulders under pads.',
      'The pad slides along angled rails as you squat.',
    ],
    weightLine: VARIES,
    illustration: null, // not drawn: no line drawing was accurate enough yet
  },
  {
    id: 'pec-deck',
    term: 'Pec deck',
    sentences: [
      'A seated machine where you bring two arm pads or handles together in front of your chest.',
      'Many also work backwards for the rear shoulders.',
    ],
    weightLine: VARIES,
    illustration: Art.PecDeckArt,
  },
  {
    id: 'lat-pulldown',
    term: 'Lat pulldown',
    sentences: [
      'You sit with your knees under a pad and pull a long bar down from overhead.',
      'Look for a tall machine with a seat and a wide bar hanging from a cable.',
    ],
    weightLine: VARIES,
    illustration: Art.LatPulldownArt,
  },
  {
    id: 'seated-row',
    term: 'Seated row',
    sentences: [
      'You sit with your feet on a footplate and pull a handle from a low cable toward your belly.',
      'Some gyms have a machine version with a chest pad instead of a cable.',
    ],
    weightLine: VARIES,
    illustration: null, // words only: drawing failed the tester audit
  },
  // Benches and stations
  {
    id: 'preacher-bench',
    term: 'Preacher bench',
    sentences: [
      'A seat with a slanted pad in front; you rest the backs of your arms on it and curl.',
      'It often has hooks on top to hold an EZ bar.',
    ],
    weightLine: null,
    illustration: Art.PreacherBenchArt,
  },
  {
    id: 'adjustable-bench',
    term: 'Adjustable bench',
    sentences: [
      'A bench whose back tilts from flat to upright, so one bench does flat, incline and seated moves.',
      'Look for a pin or ladder under the back pad.',
    ],
    weightLine: null,
    illustration: Art.AdjustableBenchArt,
  },
  {
    id: 'decline-bench',
    term: 'Decline bench',
    sentences: [
      'A bench that slopes so your head is lower than your hips.',
      'Rollers at the high end hold your legs in place.',
    ],
    weightLine: null,
    illustration: Art.DeclineBenchArt,
  },
  {
    id: 'hyperextension-bench',
    term: 'Hyperextension bench',
    sentences: [
      'An angled bench with hip pads and an ankle roller, for lower back and glute moves.',
      'You hook your heels under the roller and bend forward over the pads.',
    ],
    weightLine: null,
    illustration: null, // not drawn: no line drawing was accurate enough yet
  },
  {
    id: 'dip-station',
    term: 'Dip station',
    sentences: [
      'Two parallel bars at about hip height; you hold yourself up between them and lower your body.',
      'Often part of a tower that also has a pull up bar.',
    ],
    weightLine: null,
    illustration: Art.DipStationArt,
  },
  {
    id: 'landmine',
    term: 'Landmine',
    sentences: [
      'A pivot on the floor that holds one end of a barbell, so you lift the other end in an arc.',
      'Look for a short tube on a hinge, on the floor or on a rack.',
    ],
    weightLine: null,
    illustration: Art.LandmineArt,
  },
  // Free weights and small kit
  {
    id: 'kettlebell',
    term: 'Kettlebell',
    sentences: ['A ball shaped weight with a handle on top.', 'The weight is printed or color coded on the side.'],
    weightLine: VARIES,
    illustration: Art.KettlebellArt,
  },
  {
    id: 'resistance-band',
    term: 'Resistance band',
    sentences: [
      'A stretchy rubber band or loop; the further you stretch it, the harder it pulls.',
      'Colors usually mean different strengths, but they differ by brand.',
    ],
    weightLine: null,
    illustration: null, // words only: drawing failed the tester audit
  },
  {
    id: 'collars-clips',
    term: 'Collars and clips',
    sentences: [
      'They lock the plates on the bar so nothing slides off.',
      'Spring clips are so light we count them as nothing; competition collars are heavier.',
    ],
    weightLine: 'Competition collars: 2.5 kg each',
    illustration: null, // words only: drawing failed the tester audit
  },
  {
    id: 'bumper-vs-iron',
    term: 'Bumper vs iron plates',
    sentences: [
      'Bumper plates are thick rubber and safe to drop; iron plates are thinner metal and are not.',
      'Most bumpers are the same height, so lighter ones are just thinner.',
    ],
    weightLine: VARIES,
    illustration: null, // words only: drawing failed the tester audit
  },
  // Workout words shown in the app
  {
    id: 'pair',
    term: 'Pair (back to back sets)',
    sentences: [
      'Two exercises done one after the other with no rest in between.',
      'Rest after both, then repeat the pair.',
    ],
    weightLine: null,
    illustration: Art.PairArt,
  },
  {
    id: 'normal-set',
    term: 'Normal set',
    sentences: ['A regular set at your target weight and reps.', 'It counts toward beating last time.'],
    weightLine: null,
    illustration: null,
  },
  {
    id: 'warm-up-set',
    term: 'Warm up set',
    sentences: [
      'A lighter set before your real sets, to get your body ready.',
      'It does not count toward beating last time.',
    ],
    weightLine: null,
    illustration: Art.WarmUpArt,
  },
  {
    id: 'drop-set',
    term: 'Drop set',
    sentences: [
      'When a set gets hard, lower the weight and keep going straight away.',
      'Often done on the last set of an exercise.',
    ],
    weightLine: null,
    illustration: Art.DropSetArt,
  },
  {
    id: 'until-you-cant',
    term: 'All out',
    sentences: ['Do reps until you cannot do one more with good form.', 'Best kept for the last set of an exercise.'],
    weightLine: null,
    illustration: null,
  },
  {
    id: 'rest-timer',
    term: 'Rest timer',
    sentences: ['The countdown between sets.', 'It starts on its own when you log a set.'],
    weightLine: null,
    illustration: Art.RestTimerArt,
  },
  {
    id: 'reps',
    term: 'Reps',
    sentences: ['One rep is doing the move once.', 'Doing it ten times in a row is ten reps.'],
    weightLine: null,
    illustration: Art.RepsArt,
  },
  {
    id: 'sets',
    term: 'Sets',
    sentences: ['A set is a group of reps done in a row, then you rest.', 'Three sets of ten means ten reps, rest, three times.'],
    weightLine: null,
    illustration: Art.SetsArt,
  },
];

export const GLOSSARY: readonly GlossaryEntry[] = ENTRIES.map((e) => ({ ...e, reviewed: false as const }));

const BY_ID = new Map(GLOSSARY.map((e) => [e.id, e]));

/** The entry for an id, or undefined. */
export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}
