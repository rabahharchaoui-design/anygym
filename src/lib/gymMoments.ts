// The gym's celebration moments (PLAN 3.6b), pure: a workout's real records (records.ts, from logged
// history only) and its first workout fact, as moments for src/ui/celebrate. Words only: every
// number arrives already formatted through load.ts (records.ts, formatTotal); nothing is computed here.
//   - One moment per lift (an exercise on one kind of load, bar and gym history), its biggest win.
//   - A new heaviest weight on a main lift (data/mainLifts.ts) asks for the full screen.
//   - The first finished workout asks for the full screen. It is its own fact: with no history
//     there is no record to claim, so it never borrows record words.
import type { Moment } from '../ui/celebrate/types';
import { biggerGain } from './load';
import type { SetRecord } from './records';

export type LiftGroup = { exerciseId: string; name: string; /** A heavy compound: squats, deadlifts, presses, rows on a bar. */ main: boolean; records: readonly SetRecord[] };

/** The record set a lift is remembered for: the largest gain over the earlier workouts (a tie: the earlier set). */
const biggest = (records: readonly SetRecord[]): SetRecord | undefined =>
  records.reduce<SetRecord | undefined>((a, b) => (!a || biggerGain(b.gainOverHistory, a.gainOverHistory) ? b : a), undefined);

/** One moment per lift with a record, in workout order. */
export function liftMoments(groups: readonly LiftGroup[]): Moment[] {
  const out: Moment[] = [];
  for (const g of groups) {
    // Each heaviest set beat the ones before it today, so the last one is the top weight.
    const top = g.main ? [...g.records].reverse().find((r) => r.heaviest) : undefined;
    if (top?.heaviest) {
      const h = top.heaviest;
      out.push({ id: `lift:${top.setId}`, kind: 'lift_record', big: true, weight: h.gainOverHistory, title: g.name, hero: h.weight, caption: 'Heaviest ever', detail: h.text, ...(h.plus ? { plus: h.plus } : {}) });
      continue;
    }
    const r = biggest(g.records);
    if (r) out.push({ id: `lift:${r.setId}`, kind: 'lift_record', big: false, weight: r.gainOverHistory, title: g.name, hero: r.setText, caption: 'New best', detail: r.text, ...(r.plus ? { plus: r.plus } : {}) });
  }
  return out;
}

/**
 * The first finished workout. `total` is the total lifted as the finish screen shows it ("4,250 lb"),
 * or null when nothing with a weight was lifted: then the sets done are the number.
 */
export function firstWorkoutMoment(sessionId: string, total: string | null, sets: number): Moment {
  const hero = total ?? `${sets} ${sets === 1 ? 'set' : 'sets'}`;
  const caption = total ? 'lifted today' : 'done today';
  return { id: `first:${sessionId}`, kind: 'first_workout', big: true, weight: 0, title: 'First workout', hero, caption, detail: `${hero} ${caption}` };
}
