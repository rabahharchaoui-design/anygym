// SPEC 22 day scenarios (PLAN 3.4a): a day as listed, the order a top evidence based coach puts it
// in, and the Up next pick after the first exercise(s). Every expected value was reasoned against
// the SPEC 22 rules (noted per scenario), then frozen; a change here is a change of coaching.
import { EQUIPMENT_IDS, type EquipmentId } from '../../../db/types';
import type { GymKit } from '../../picker';
import type { Goal, Muscle } from '../../order';

const kit = (equipment: EquipmentId[], dumbbells = true): GymKit => ({
  equipment,
  dumbbellRange: dumbbells && equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null,
});

export const FULL_GYM: GymKit = {
  equipment: [...EQUIPMENT_IDS],
  dumbbellRange: { min: 5, max: 120, step: 5 },
};
/** A hotel gym with dumbbells to 50 lb and a bench, nothing else (SPEC 7.5 plan 3, minus the cable). */
export const HOTEL_DUMBBELLS: GymKit = kit(['dumbbells', 'flat_bench']);
export const BODYWEIGHT: GymKit = kit([]);
export const HOME_BANDS: GymKit = kit(['resistance_bands', 'pull_up_bar']);
export const MACHINES_ONLY: GymKit = kit([
  'leg_press',
  'leg_extension',
  'leg_curl',
  'chest_press_machine',
  'pec_deck',
  'lat_pulldown',
  'seated_row',
  'shoulder_press_machine',
  'cable_station',
  'calf_raise_machine',
]);

/** A unit: one exercise id, or a pair (ids done back to back). */
export type ScenarioUnit = string | string[];

export type Scenario = {
  name: string;
  gym: GymKit;
  goal?: Goal;
  focus?: Muscle[];
  easyOn?: string[];
  recent?: Muscle[];
  /** The day as listed. */
  day: ScenarioUnit[];
  /** SPEC 22 order. */
  order: ScenarioUnit[];
  /** Done before asking Up next (default: the first unit of `order`). */
  done?: string[];
  /** The one big Up next suggestion. */
  upNext: string;
};

export const SCENARIOS: Scenario[] = [
  // Rule 1 big presses first, rule 3 no triceps before the presses, rule 4 fly and triceps follow bench, lateral raise follows the overhead press. Up next: a pull balances the push.
  {
    name: 'push day, triceps listed first',
    gym: FULL_GYM,
    day: ['cable-tricep-pushdown', 'Barbell_Bench_Press_-_Medium_Grip', 'dumbbell-lateral-raise', 'overhead-press', 'machine-seated-chest-fly'],
    order: ['Barbell_Bench_Press_-_Medium_Grip', 'overhead-press', 'machine-seated-chest-fly', 'cable-tricep-pushdown', 'dumbbell-lateral-raise'],
    upNext: 'barbell-bent-over-row',
  },
  // Rows and pull ups before biceps (rule 3); curls and rear delts follow the rows (rule 4). Up next: a press balances the pull.
  {
    name: 'pull day, curls listed first',
    gym: FULL_GYM,
    day: ['barbell-bicep-curl', 'wide-grip-pull-up', 'machine-seated-reverse-fly', 'barbell-bent-over-row', 'lat-machine-wide-grip-pulldown'],
    order: ['barbell-bent-over-row', 'wide-grip-pull-up', 'lat-machine-wide-grip-pulldown', 'barbell-bicep-curl', 'machine-seated-reverse-fly'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Squat and hinge first, the leg press second, isolation after, calves last.
  {
    name: 'legs, isolation listed first',
    gym: FULL_GYM,
    day: ['machine-seated-leg-extension', 'barbell-back-squat', 'machine-lying-leg-curl', 'romanian-deadlift', 'leg-press', 'machine-seated-calf-raise'],
    order: ['barbell-back-squat', 'romanian-deadlift', 'leg-press', 'machine-seated-leg-extension', 'machine-lying-leg-curl', 'machine-seated-calf-raise'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Squat, bench, row while fresh, then the small lifts. Up next after the squat: an upper body lift (another big leg lift would hit the same muscles).
  {
    name: 'full body',
    gym: FULL_GYM,
    day: ['dumbbell-lateral-raise', 'barbell-back-squat', 'Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row', 'crunch'],
    order: ['barbell-back-squat', 'Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row', 'dumbbell-lateral-raise', 'crunch'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Only dumbbells and a bench: big dumbbell lifts first, curls last. Up next is something this gym can do.
  {
    name: 'hotel gym, dumbbells only',
    gym: HOTEL_DUMBBELLS,
    day: ['Dumbbell_Bicep_Curl', 'dumbbell-bench-press', 'single-arm-dumbbell-row', 'Dumbbell_Squat', 'Stiff-Legged_Dumbbell_Deadlift'],
    order: ['Dumbbell_Squat', 'Stiff-Legged_Dumbbell_Deadlift', 'dumbbell-bench-press', 'single-arm-dumbbell-row', 'Dumbbell_Bicep_Curl'],
    upNext: 'dumbbell-bench-press',
  },
  // A dumbbell row balances the push, and the gym has the dumbbells and bench for it.
  {
    name: 'hotel gym, after dumbbell bench',
    gym: HOTEL_DUMBBELLS,
    day: ['dumbbell-bench-press', 'Dumbbell_Flyes', 'Lying_Dumbbell_Tricep_Extension'],
    order: ['dumbbell-bench-press', 'Dumbbell_Flyes', 'Lying_Dumbbell_Tricep_Extension'],
    upNext: 'single-arm-dumbbell-row',
  },
  // Squat and push ups first, lunges and bridges next, abs last.
  {
    name: 'bodyweight only',
    gym: BODYWEIGHT,
    day: ['crunch', 'Pushups', 'Bodyweight_Squat', 'Single_Leg_Glute_Bridge', 'Bodyweight_Walking_Lunge', 'elbow-plank'],
    order: ['Bodyweight_Squat', 'Pushups', 'Bodyweight_Walking_Lunge', 'Single_Leg_Glute_Bridge', 'crunch', 'elbow-plank'],
    upNext: 'Pushups',
  },
  // Nothing done: the biggest lift the floor allows.
  {
    name: 'bodyweight only, nothing done yet',
    gym: BODYWEIGHT,
    day: ['Bodyweight_Squat'],
    order: ['Bodyweight_Squat'],
    done: [],
    upNext: 'Bodyweight_Squat',
  },
  // The deadlift is the biggest lift; strength keeps big lifts coming longer (a 4th compound before any isolation).
  {
    name: 'strength goal, full body',
    gym: FULL_GYM,
    goal: 'strength',
    day: ['barbell-back-squat', 'Barbell_Bench_Press_-_Medium_Grip', 'deadlift', 'overhead-press'],
    order: ['deadlift', 'barbell-back-squat', 'Barbell_Bench_Press_-_Medium_Grip', 'overhead-press'],
    done: ['barbell-back-squat', 'Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row'],
    upNext: 'overhead-press',
  },
  // Free weight lift first, then the secondary compounds in the order given (an honest tie), abs last.
  {
    name: 'fat loss, full body',
    gym: FULL_GYM,
    goal: 'fat_loss',
    day: ['dumbbell-walking-lunge', 'dumbbell-bench-press', 'cable-seated-close-grip-row', 'crunch'],
    order: ['dumbbell-bench-press', 'dumbbell-walking-lunge', 'cable-seated-close-grip-row', 'crunch'],
    upNext: 'barbell-bent-over-row',
  },
  // Go easy on the lower back: no loaded hinge, bent over row or bar squat is suggested.
  {
    name: 'lower back go easy',
    gym: FULL_GYM,
    easyOn: ['lower_back'],
    day: ['leg-press', 'machine-lying-leg-curl'],
    order: ['leg-press', 'machine-lying-leg-curl'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Go easy on the knees: no lunges. After three big lifts, isolation that builds on them.
  {
    name: 'knees go easy',
    gym: FULL_GYM,
    easyOn: ['knees'],
    day: ['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row'],
    order: ['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row'],
    done: ['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row', 'leg-press'],
    upNext: 'leg-extension',
  },
  // SPEC 22 flag 1: squat, then the RDL, then the leg curl, then the rest.
  {
    name: 'hamstring focus legs (the worked example)',
    gym: FULL_GYM,
    focus: ['hamstrings'],
    day: ['barbell-back-squat', 'angled-machine-leg-press', 'machine-lying-leg-curl', 'machine-seated-leg-extension', 'dumbbell-walking-lunge', 'barbell-straight-leg-romanian-deadlift'],
    order: ['barbell-back-squat', 'barbell-straight-leg-romanian-deadlift', 'machine-lying-leg-curl', 'angled-machine-leg-press', 'dumbbell-walking-lunge', 'machine-seated-leg-extension'],
    upNext: 'deadlift',
  },
  // Quad focus: the leg press leads, lunges next (never two squat patterns back to back), isolation after.
  {
    name: 'quad focus legs',
    gym: FULL_GYM,
    focus: ['quads'],
    day: ['machine-leg-press', 'machine-seated-leg-extension', 'machine-lying-leg-curl', 'dumbbell-stationary-lunge', 'kettlebell-goblet-squat'],
    order: ['machine-leg-press', 'dumbbell-stationary-lunge', 'kettlebell-goblet-squat', 'machine-seated-leg-extension', 'machine-lying-leg-curl'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Glutes focus: the hip thrust comes right after the squat.
  {
    name: 'glutes focus',
    gym: FULL_GYM,
    focus: ['glutes'],
    day: ['machine-seated-leg-extension', 'barbell-back-squat', 'hip-thrust', 'machine-lying-leg-curl'],
    order: ['barbell-back-squat', 'hip-thrust', 'machine-seated-leg-extension', 'machine-lying-leg-curl'],
    upNext: 'deadlift',
  },
  // Biceps focus still waits for the rows and pulldowns (rule 3 beats rule 2).
  {
    name: 'arms focus never pre-tires the rows',
    gym: FULL_GYM,
    focus: ['biceps'],
    day: ['cable-seated-close-grip-row', 'barbell-bicep-curl', 'lat-machine-wide-grip-pulldown', 'cable-single-arm-bicep-curl'],
    order: ['cable-seated-close-grip-row', 'lat-machine-wide-grip-pulldown', 'barbell-bicep-curl', 'cable-single-arm-bicep-curl'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Back extensions come after the squat (rule 3).
  {
    name: 'no lower back work before squats',
    gym: FULL_GYM,
    day: ['hyperextension-roman-chair-back-extension', 'barbell-back-squat', 'machine-seated-leg-extension'],
    order: ['barbell-back-squat', 'hyperextension-roman-chair-back-extension', 'machine-seated-leg-extension'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Forearm work comes after the deadlift and rows (rule 3).
  {
    name: 'no grip work before heavy pulls',
    gym: FULL_GYM,
    day: ['forearm-finger-roll', 'deadlift', 'barbell-bent-over-row'],
    order: ['deadlift', 'barbell-bent-over-row', 'forearm-finger-roll'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // A chest and back pair moves as one block (rule 5).
  {
    name: 'an opposing pair stays together',
    gym: FULL_GYM,
    day: ['dumbbell-lateral-raise', ['dumbbell-bench-press', 'single-arm-dumbbell-row'], 'barbell-back-squat'],
    order: ['barbell-back-squat', ['dumbbell-bench-press', 'single-arm-dumbbell-row'], 'dumbbell-lateral-raise'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // The short dynamic warm up opens, the long static holds close.
  {
    name: 'dynamic warm up first, static stretches last',
    gym: FULL_GYM,
    day: ['static-quadricep-stretch', 'dynamic-hip-flexor-stretch', 'static-pigeon-stretch', 'barbell-back-squat', 'machine-seated-leg-extension'],
    order: ['dynamic-hip-flexor-stretch', 'barbell-back-squat', 'machine-seated-leg-extension', 'static-quadricep-stretch', 'static-pigeon-stretch'],
    upNext: 'deadlift',
  },
  // Cardio intervals go after the lifting.
  {
    name: 'cardio finisher last',
    gym: FULL_GYM,
    day: ['30-second-interval-sprint', 'crunch', 'leg-press'],
    order: ['leg-press', 'crunch', '30-second-interval-sprint'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Two presses and two rows alternate instead of running back to back.
  {
    name: 'same pattern never back to back',
    gym: FULL_GYM,
    day: ['Barbell_Bench_Press_-_Medium_Grip', 'dumbbell-bench-press', 'barbell-bent-over-row', 'single-arm-dumbbell-row'],
    order: ['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row', 'dumbbell-bench-press', 'single-arm-dumbbell-row'],
    upNext: 'barbell-bent-over-row',
  },
  // Three equal cable triceps lifts keep the order they were listed in.
  {
    name: 'honest ties keep their order',
    gym: FULL_GYM,
    day: ['cable-rope-tricep-extension', 'cable-tricep-pushdown', 'cable-overhead-tricep-extension'],
    order: ['cable-rope-tricep-extension', 'cable-tricep-pushdown', 'cable-overhead-tricep-extension'],
    upNext: 'barbell-bent-over-row',
  },
  // The barbell incline (the heaviest press) leads, the pair moves as one, triceps after the presses.
  {
    name: 'chest and triceps as written',
    gym: FULL_GYM,
    day: [
      'dumbbell-bench-press',
      ['barbell-incline-bench-press', 'incline-plate-press'],
      'machine-seated-chest-fly',
      'cable-reverse-grip-tricep-pulldown',
      'cable-rope-tricep-extension',
      'dumbbell-single-arm-overhead-tricep-extension',
    ],
    order: [
      ['barbell-incline-bench-press', 'incline-plate-press'],
      'dumbbell-bench-press',
      'machine-seated-chest-fly',
      'dumbbell-single-arm-overhead-tricep-extension',
      'cable-reverse-grip-tricep-pulldown',
      'cable-rope-tricep-extension',
    ],
    upNext: 'barbell-bent-over-row',
  },
  // Rows and pull ups first, biceps after, forearms last.
  {
    name: 'back and biceps as written',
    gym: FULL_GYM,
    day: [
      'wide-grip-pull-up',
      'barbell-bent-over-row',
      'lat-machine-wide-grip-pulldown',
      'cable-seated-close-grip-row',
      'hyperextension-roman-chair-back-extension',
      'barbell-bicep-curl',
      'cable-single-arm-bicep-curl',
      'dumbbell-single-arm-preacher-curl',
      'forearm-finger-roll',
      'wrist-twist',
    ],
    order: [
      'barbell-bent-over-row',
      'wide-grip-pull-up',
      'cable-seated-close-grip-row',
      'lat-machine-wide-grip-pulldown',
      'barbell-bicep-curl',
      'hyperextension-roman-chair-back-extension',
      'dumbbell-single-arm-preacher-curl',
      'cable-single-arm-bicep-curl',
      'forearm-finger-roll',
      'wrist-twist',
    ],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Arnold press first on shoulder day, raises after it, calves last.
  {
    name: 'shoulders and calves as written',
    gym: FULL_GYM,
    day: [
      'dumbbell-arnold-shoulder-press',
      'dumbbell-lateral-raise',
      'machine-seated-reverse-fly',
      'smith-machine-upright-row',
      'dumbbell-front-raise',
      'dumbbell-shrug',
      'machine-seated-calf-raise',
      'leg-press-machine-calf-raise',
    ],
    order: [
      'dumbbell-arnold-shoulder-press',
      'smith-machine-upright-row',
      'dumbbell-lateral-raise',
      'dumbbell-front-raise',
      'dumbbell-shrug',
      'machine-seated-reverse-fly',
      'machine-seated-calf-raise',
      'leg-press-machine-calf-raise',
    ],
    upNext: 'barbell-bent-over-row',
  },
  // Leg press and pulldown first, isolation after.
  {
    name: 'machines only gym',
    gym: MACHINES_ONLY,
    day: ['machine-seated-chest-fly', 'leg-press', 'lat-machine-wide-grip-pulldown', 'machine-seated-leg-extension'],
    order: ['leg-press', 'lat-machine-wide-grip-pulldown', 'machine-seated-leg-extension', 'machine-seated-chest-fly'],
    upNext: 'Pushups',
  },
  // Calves and abs after the main lifts.
  {
    name: 'calves and abs go last',
    gym: FULL_GYM,
    day: ['machine-seated-calf-raise', 'crunch', 'dumbbell-bench-press', 'dumbbell-lateral-raise'],
    order: ['dumbbell-bench-press', 'dumbbell-lateral-raise', 'machine-seated-calf-raise', 'crunch'],
    upNext: 'barbell-bent-over-row',
  },
  // Push ups and pull ups first; a pull balances the push.
  {
    name: 'home with bands and a pull up bar',
    gym: HOME_BANDS,
    day: ['Lateral_Raise_-_With_Bands', 'wide-grip-pull-up', 'Pushups'],
    order: ['Pushups', 'wide-grip-pull-up', 'Lateral_Raise_-_With_Bands'],
    upNext: 'wide-grip-pull-up',
  },
  // Back trained in the last 48 hours: Up next leaves rows and pull ups out.
  {
    name: 'trained back yesterday',
    gym: FULL_GYM,
    recent: ['back', 'biceps', 'rear delts'],
    day: ['Barbell_Bench_Press_-_Medium_Grip', 'machine-seated-chest-fly'],
    order: ['Barbell_Bench_Press_-_Medium_Grip', 'machine-seated-chest-fly'],
    upNext: 'deadlift',
  },
  // Up next after squat: a different pattern for the upper body.
  {
    name: 'after squat',
    gym: FULL_GYM,
    day: ['barbell-back-squat', 'machine-seated-leg-extension'],
    order: ['barbell-back-squat', 'machine-seated-leg-extension'],
    upNext: 'Barbell_Bench_Press_-_Medium_Grip',
  },
  // Up next after bench: a row balances the push.
  {
    name: 'after bench',
    gym: FULL_GYM,
    day: ['Barbell_Bench_Press_-_Medium_Grip', 'cable-tricep-pushdown'],
    order: ['Barbell_Bench_Press_-_Medium_Grip', 'cable-tricep-pushdown'],
    upNext: 'barbell-bent-over-row',
  },
];
