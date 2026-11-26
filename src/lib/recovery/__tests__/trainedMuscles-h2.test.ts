// PLAN H2 (SPEC 20.3): the muscles one workout trained and the ones it only worked, from the one
// trained rule (TRAINED_MIN_SETS working sets with the group as a PRIMARY muscle).
import { describe, expect, it } from 'vitest';
import type { Muscle } from '../../order';
import { TRAINED_MIN_SETS, groupsTrained, musclesTrained, musclesWorkedOnly, type LoggedSet, type LoggedWorkout } from '..';

const work = (primary: Muscle[], secondary: Muscle[] = []): LoggedSet => ({ kind: 'work', primary, secondary });
const n = (k: number, s: LoggedSet): LoggedSet[] => Array.from({ length: k }, () => ({ ...s }));
const w = (...s: LoggedSet[][]): LoggedWorkout => ({ at: 0, sets: s.flat() });

describe('musclesTrained (PLAN H2)', () => {
  it('one working set of bench trains nothing: chest was only worked', () => {
    const one = w(n(1, work(['chest'], ['triceps'])));
    expect(musclesTrained(one)).toEqual([]);
    expect(musclesWorkedOnly(one)).toEqual(['chest']);
  });

  it(`${TRAINED_MIN_SETS} working sets train the primary muscle, never the helpers`, () => {
    const bench = w(n(TRAINED_MIN_SETS, work(['chest'], ['triceps', 'front delts'])));
    expect(musclesTrained(bench)).toEqual(['chest']);
    expect(musclesWorkedOnly(bench)).toEqual([]);
  });

  it('warmups, drop sets and unsure sets never count toward the 3', () => {
    const mixed = w(n(2, work(['quads'])), [{ kind: 'warmup', primary: ['quads'] }, { kind: 'drop', primary: ['quads'] }, { kind: 'work', primary: ['quads'], uncertain: true }]);
    expect(musclesTrained(mixed)).toEqual([]);
    expect(musclesWorkedOnly(mixed)).toEqual(['quads']);
  });

  it('a group trained by 3 sets across its muscles trains each of them (curls and pushdowns: arms)', () => {
    const arms = w(n(2, work(['biceps'])), n(1, work(['triceps'])));
    expect(groupsTrained(arms)).toEqual(['arms']);
    expect(musclesTrained(arms).sort()).toEqual(['biceps', 'triceps']);
  });

  it('agrees with groupsTrained: a muscle is trained exactly when its group is', () => {
    const day = w(n(3, work(['back'])), n(2, work(['side delts'])), n(4, work(['quads', 'glutes'])));
    expect(musclesTrained(day).sort()).toEqual(['back', 'glutes', 'quads']);
    expect(musclesWorkedOnly(day)).toEqual(['side delts']);
  });
});
