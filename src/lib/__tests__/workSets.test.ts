import { describe, expect, it } from 'vitest';
import { workSetCount } from '../workSets';

describe('workSetCount: warm ups never count (SPEC 2.5)', () => {
  const warm = { kind: 'warmup' as const };
  const work = { kind: 'work' as const };
  it('a session of 3 warm ups and 3 work sets is 3 sets', () => {
    expect(workSetCount([warm, warm, warm, work, work, work])).toBe(3);
  });
  it('drop sets count, only warm ups are left out, none is 0', () => {
    expect(workSetCount([warm, { kind: 'drop' as const }, work])).toBe(2);
    expect(workSetCount([warm, warm])).toBe(0);
    expect(workSetCount([])).toBe(0);
  });
});
