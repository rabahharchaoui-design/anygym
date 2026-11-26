// PLAN H2 (SPEC 20.3): the muscles one workout trained and the ones it only worked. PLAN R4 (2): a
// muscle is named only after TRAINED_MIN_SETS working sets of its own as a PRIMARY muscle; the group's
// pooled sets still train the group (groupsTrained) for recovery.
import { describe, expect, it } from 'vitest';
import type { Muscle } from '../../order';
import { TRAINED_MIN_SETS, groupsTrained, musclesNamed, musclesWorkedOnly, type LoggedSet, type LoggedWorkout } from '..';

const work = (primary: Muscle[], secondary: Muscle[] = []): LoggedSet => ({ kind: 'work', primary, secondary });
const n = (k: number, s: LoggedSet): LoggedSet[] => Array.from({ length: k }, () => ({ ...s }));
const w = (...s: LoggedSet[][]): LoggedWorkout => ({ at: 0, sets: s.flat() });

describe('musclesNamed (PLAN H2, R4)', () => {
  it('one working set of bench trains nothing: chest was only worked', () => {
    const one = w(n(1, work(['chest'], ['triceps'])));
    expect(musclesNamed(one)).toEqual([]);
    expect(musclesWorkedOnly(one)).toEqual(['chest']);
  });

  it(`${TRAINED_MIN_SETS} working sets train the primary muscle, never the helpers`, () => {
    const bench = w(n(TRAINED_MIN_SETS, work(['chest'], ['triceps', 'front delts'])));
    expect(musclesNamed(bench)).toEqual(['chest']);
    expect(musclesWorkedOnly(bench)).toEqual([]);
  });

  it('warmups, drop sets and unsure sets never count toward the 3', () => {
    const mixed = w(n(2, work(['quads'])), [{ kind: 'warmup', primary: ['quads'] }, { kind: 'drop', primary: ['quads'] }, { kind: 'work', primary: ['quads'], uncertain: true }]);
    expect(musclesNamed(mixed)).toEqual([]);
    expect(musclesWorkedOnly(mixed)).toEqual(['quads']);
  });

  it('a group trained by 3 sets across its muscles trains the group but names neither (R4: curls and pushdowns)', () => {
    const arms = w(n(2, work(['biceps'])), n(1, work(['triceps'])));
    expect(groupsTrained(arms)).toEqual(['arms']);
    expect(musclesNamed(arms)).toEqual([]);
    expect(musclesWorkedOnly(arms).sort()).toEqual(['biceps', 'triceps']);
  });

  it('each muscle on its own sets: 3 named, 2 only worked', () => {
    const day = w(n(3, work(['back'])), n(2, work(['side delts'])), n(4, work(['quads', 'glutes'])));
    expect(musclesNamed(day).sort()).toEqual(['back', 'glutes', 'quads']);
    expect(musclesWorkedOnly(day)).toEqual(['side delts']);
  });
});
