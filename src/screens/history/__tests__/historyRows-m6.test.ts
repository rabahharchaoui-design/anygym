import { describe, expect, it } from 'vitest';
import type { Run, Session } from '../../../db/types';
import { thisWeekLine, type DatedItem } from '../historyFeed';
import { runRowFacts, workoutFacts } from '../historyWords';

const MON = new Date(2026, 10, 23, 9).getTime(); // Monday Nov 23 2026
const DAY = 86_400_000;
const w = (at: number): DatedItem => ({ kind: 'workout', at, workout: { session: { id: String(at), gymId: 'g', startedAt: at, endedAt: at + 1, imported: false }, sets: 1 } });
const r = (at: number): DatedItem => ({ kind: 'run', at, run: { id: String(at) } as Run });

describe('thisWeekLine (board 11)', () => {
  it('counts only rows since Monday', () => {
    expect(thisWeekLine([w(MON + DAY), w(MON), r(MON + 2 * DAY), w(MON - DAY)], MON + 3 * DAY)).toBe('This week: 2 workouts, 1 run');
  });
  it('one workout, no runs', () => expect(thisWeekLine([w(MON)], MON + DAY)).toBe('This week: 1 workout'));
  it('nothing this week says so', () => expect(thisWeekLine([w(MON - 3 * DAY)], MON + DAY)).toBe('This week: nothing yet'));
});

describe('row facts', () => {
  const s = (o: Partial<Session>): Session => ({ id: 'a', gymId: 'g', startedAt: MON, imported: false, ...o });
  it('a workout with a start and a finish: minutes, sets under', () => expect(workoutFacts(s({ endedAt: MON + 52 * 60_000 }), 20)).toEqual({ main: '52 min', detail: '20 sets' }));
  it('an imported workout: sets alone, no made up time', () => expect(workoutFacts(s({ imported: true, endedAt: MON + 1 }), 3)).toEqual({ main: '3 sets' }));
  it('a workout left open for hours never shows the hours', () => expect(workoutFacts(s({ endedAt: MON + 13 * 3_600_000 }), 4).main).toBe('Over 4 h'));
  it('a run with no GPS distance says so in words', () => {
    const facts = runRowFacts({ id: 'x', startedAt: 0, endedAt: 1, type: 'free', movingSec: 600, elapsedSec: 600, distanceM: 0, points: [], gaps: [], splits: [] } as Run, 'km');
    expect(facts.main).toBe('');
    expect(facts.detail).toBe('No distance recorded');
  });
});
