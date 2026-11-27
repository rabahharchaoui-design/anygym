// PLAN R4 (2): the group still decides recovery (SPEC 20.3), but a sentence names a muscle only when
// that muscle was the primary on 3 or more working sets itself. 2 curls and 1 pushdown train arms,
// and name neither biceps nor triceps.
import { describe, expect, it } from 'vitest';
import type { Muscle } from '../../order';
import { TRAINED_MIN_SETS, groupsTrained, lastTrainedGroups, musclesNamed, musclesWorkedOnly, type LoggedSet, type LoggedWorkout } from '..';

const work = (primary: Muscle[]): LoggedSet => ({ kind: 'work', primary });
const n = (k: number, s: LoggedSet): LoggedSet[] => Array.from({ length: k }, () => ({ ...s }));
const w = (...s: LoggedSet[][]): LoggedWorkout => ({ at: 1, sets: s.flat() });

describe('musclesNamed (PLAN R4 2)', () => {
  it('2 curls and 1 pushdown: arms is trained, no muscle is named', () => {
    const arms = w(n(2, work(['biceps'])), n(1, work(['triceps'])));
    expect(groupsTrained(arms)).toEqual(['arms']);
    expect(lastTrainedGroups([arms], 10)).toEqual({ arms: 1 });
    expect(musclesNamed(arms)).toEqual([]);
    expect(musclesWorkedOnly(arms).sort()).toEqual(['biceps', 'triceps']);
  });

  it(`${TRAINED_MIN_SETS} curls and 1 pushdown: biceps is named, triceps only worked`, () => {
    const day = w(n(3, work(['biceps'])), n(1, work(['triceps'])));
    expect(musclesNamed(day)).toEqual(['biceps']);
    expect(musclesWorkedOnly(day)).toEqual(['triceps']);
  });

  it('a set with two primaries counts once for each', () => {
    const squats = w(n(3, work(['quads', 'glutes'])));
    expect(musclesNamed(squats).sort()).toEqual(['glutes', 'quads']);
  });

  it('warmups and unsure sets never count toward a name', () => {
    const mixed = w(n(2, work(['chest'])), [{ kind: 'warmup', primary: ['chest'] }, { kind: 'work', primary: ['chest'], uncertain: true }]);
    expect(musclesNamed(mixed)).toEqual([]);
  });
});
