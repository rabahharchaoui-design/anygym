// PLAN R4 (5): "two weeks in a row" only across the same set count and whole weight, every workout of
// the week before at the top too; "with reps to spare" on that claim only with Easy in both weeks.
import { describe, expect, it } from 'vitest';
import { weeklyLevelUp } from '../../coach';
import { stackLoad } from '../../load';
import { DAY, NOW, bar, lift, nov, pin, sess } from './fixtures';

const reason = (l: ReturnType<typeof lift>) => weeklyLevelUp([l], [], NOW)?.earned[0]?.reason;

describe('two weeks in a row and reps to spare (R4 5)', () => {
  const prev = nov(2) - 4 * DAY; // Thu 29 Oct: the week before
  it('same scheme and whole weight both weeks, Easy both weeks', () => {
    const l = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200), [8, 12], 'easy'), sess(prev, [12, 12, 12], bar(200), [8, 12], 'easy')] });
    expect(reason(l)).toBe('+15 lb: you hit 3 × 12 two weeks in a row, with reps to spare');
  });
  it('Easy only in the latest week: no "with reps to spare" on a two week claim', () => {
    const l = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200), [8, 12], 'easy'), sess(prev, [12, 12, 12], bar(200))] });
    expect(reason(l)).toBe('+15 lb: you hit 3 × 12 two weeks in a row');
  });
  it('a different set count the week before: not two weeks in a row', () => {
    const l = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200)), sess(prev, [12, 12], bar(200))] });
    expect(reason(l)).toBe('+10 lb: you hit 3 × 12 last week');
  });
  it('the same pin with an add-on the week before is another whole weight: not two weeks in a row', () => {
    const cable = (load: ReturnType<typeof pin>, date: number) => sess(date, [15, 15], load, [12, 15]);
    const l = lift({ exerciseId: 'cable-fly', name: 'Cable Fly', pattern: 'chest isolation', sessions: [cable(pin(50), nov(4)), cable(stackLoad(50, 'lb', 5), prev)] });
    expect(reason(l)).toMatch(/you hit 2 × 15 last week$/);
    const same = lift({ exerciseId: 'cable-fly', name: 'Cable Fly', pattern: 'chest isolation', sessions: [cable(pin(50), nov(4)), cable(pin(50), prev)] });
    expect(reason(same)).toMatch(/you hit 2 × 15 two weeks in a row$/);
  });
  it('an earlier workout of the week before below the top: not two weeks in a row', () => {
    const l = lift({ sessions: [sess(nov(5), [12, 12, 12], bar(200)), sess(prev, [12, 12, 12], bar(200)), sess(prev - 2 * DAY, [12, 11, 10], bar(200))] });
    expect(reason(l)).toBe('+10 lb: you hit 3 × 12 last week');
  });
});
