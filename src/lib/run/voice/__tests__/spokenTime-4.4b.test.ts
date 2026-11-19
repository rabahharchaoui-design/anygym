// PLAN 4.4b (9): the voice says the time the clock shows (the clock cuts, never rounds up).
import { describe, expect, it } from 'vitest';
import { formatElapsed } from '../../../timer';
import { timeClips } from '../compose';

describe('spoken time (PLAN 4.4b 9)', () => {
  it('cuts the seconds like the clock: 9:12.6 is said as nine minutes, twelve seconds', () => {
    expect(formatElapsed(552.6)).toBe('9:12');
    expect(timeClips(552.6).map((c) => c.id)).toEqual(['min9', 'sec12']);
    expect(timeClips(59.9).map((c) => c.id)).toEqual(['sec59']);
  });
  it("for every tenth of a second over two hours, the spoken minutes and seconds are the clock's", () => {
    for (let t = 0; t < 7200; t += 0.1) {
      const [m, s] = formatElapsed(t).split(':').slice(-2).map(Number);
      const ids = timeClips(t).map((c) => c.id);
      if (s! > 0) expect(ids, String(t)).toContain(`sec${s}`);
      if (m! > 0) expect(ids, String(t)).toContain(`min${m}`);
    }
  });
});
