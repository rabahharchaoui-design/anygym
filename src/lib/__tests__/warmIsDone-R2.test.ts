// PLAN R2: a background save is done only when it ran to the end with no failed files.
import { describe, expect, it } from 'vitest';
import { warmIsDone } from '../photoWarm';

describe('warmIsDone (PLAN R2)', () => {
  it('done only when not stopped and nothing failed', () => {
    expect(warmIsDone({ stopped: false })).toBe(true);
    expect(warmIsDone({ stopped: false, failed: 0 })).toBe(true);
    expect(warmIsDone({ stopped: false, failed: 1 })).toBe(false);
    expect(warmIsDone({ stopped: true, failed: 0 })).toBe(false);
    expect(warmIsDone(undefined)).toBe(false);
  });
});
