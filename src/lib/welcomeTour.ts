// The first visit welcome on Today (PLAN 3.5u), as pure state: which steps show, where a tap takes
// it, and when it shows at all. The screen (screens/today/WelcomeTour.tsx) only draws this.

/** What the profile remembers: pending after a first intake, done once finished or skipped. */
export type TourFlag = 'pending' | 'done';

/** What a step points at: the element marked data-tour="<target>". */
export type TourTarget = 'day' | 'pick' | 'quick' | 'tabs';

export type TourStep = { target: TourTarget; line: string };

/** One calm line per step. `pick` stands in for `day` when the intake ended with no plan. */
const ALL_STEPS: readonly TourStep[] = [
  { target: 'day', line: "Today's workout. Tap Start to begin." },
  { target: 'pick', line: 'Pick a plan here when you want one.' },
  { target: 'quick', line: 'Short on time? Get one built to fit.' },
  { target: 'tabs', line: 'Runs, history and plans live here.' },
];

/** The steps for what is on Today right now: a step whose element is not there is left out, never pointed at nothing. */
export function tourSteps(present: ReadonlySet<TourTarget>): TourStep[] {
  return ALL_STEPS.filter((s) => present.has(s.target) && !(s.target === 'pick' && present.has('day')));
}

/** Only right after a first intake, on a settled Today with no workout in progress. */
export function shouldShowTour(flag: TourFlag | undefined, today: { ready: boolean; activeWorkout: boolean }): boolean {
  return flag === 'pending' && today.ready && !today.activeWorkout;
}

export type TourState = { index: number; over: boolean };
export type TourAction = 'next' | 'skip';

export const TOUR_START: TourState = { index: 0, over: false };

/** Next moves on and ends after the last step; Skip ends at once. Over stays over. */
export function tourReducer(state: TourState, action: TourAction, count: number): TourState {
  if (state.over) return state;
  if (action === 'skip' || state.index >= count - 1) return { index: state.index, over: true };
  return { index: state.index + 1, over: false };
}

/** The button that moves on: "Done" on the last step. */
export const nextLabel = (state: TourState, count: number): string => (state.index >= count - 1 ? 'Done' : 'Next');

export type Box = { x: number; y: number; width: number; height: number };

/** The spotlight is the element's box, grown by `pad` on every side. */
export const spotBox = (r: Box, pad: number): Box => ({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 });

/**
 * Where the words go: under the spotlight when they fit above `bottom`, else over it when they fit
 * under `top`, else resting at the bottom (a card taller than the room left).
 */
export function wordsTop(spot: Box, height: number, view: { top: number; bottom: number }, gap: number): number {
  const under = spot.y + spot.height + gap;
  if (under + height <= view.bottom) return under;
  const over = spot.y - gap - height;
  if (over >= view.top) return over;
  return view.bottom - height;
}

/**
 * PLAN 3.6v: on a short screen a lit element taller than the room the words leave is lit down to
 * its key part (the day card down to Start), so the light and the words both fit whole. `extra` is
 * what the light needs besides the element (its padding, the gap and the words); `coreBottom` is
 * where the key part ends (null when the element has none).
 */
export function fitTarget(r: Box, coreBottom: number | null, room: number, extra: number): Box {
  if (coreBottom === null || r.height + extra <= room) return r;
  return { ...r, height: Math.max(0, Math.min(r.height, coreBottom - r.y)) };
}
