import { describe, expect, it } from 'vitest';
import { whenWords } from '../quickWhy';

// 3.5t follow up: "yesterday" is a calendar day, so it is the same answer at 00:30 and at 23:30.
describe('whenWords counts local calendar days', () => {
  const at = new Date(2026, 10, 10, 23, 50).getTime(); // 10 Nov, 23:50
  it('00:30 the next day: yesterday', () => expect(whenWords(at, new Date(2026, 10, 11, 0, 30).getTime())).toBe('yesterday'));
  it('23:30 the next day: yesterday', () => expect(whenWords(at, new Date(2026, 10, 11, 23, 30).getTime())).toBe('yesterday'));
  it('23:30 the same day: today', () => expect(whenWords(new Date(2026, 10, 11, 0, 5).getTime(), new Date(2026, 10, 11, 23, 30).getTime())).toBe('today'));
  it('two days back', () => expect(whenWords(at, new Date(2026, 10, 12, 0, 30).getTime())).toBe('2 days ago'));
});
