import { describe, expect, it } from 'vitest';
import { dayKey } from '../dayKey';
import { localDay as reportDay } from '../../db/reports';
import { localDay as startDay } from '../../screens/today/startBudget';
import { backupFileName } from '../backup';
import { weekKey, weekStart } from '../coach/time';

// 3.6x: the local YYYY-MM-DD day was written out five times (db/reports, today/startBudget,
// workout/useTimeBudget, backup file name, coach week key). The two old spellings are kept here as
// written; the shared dayKey and every caller must give the same text for each date.
const oldLong = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const oldShort = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const DATES = [
  new Date(2026, 0, 1, 0, 0, 0),
  new Date(2026, 0, 1, 23, 59, 59),
  new Date(2026, 1, 28, 12),
  new Date(2028, 1, 29, 6),
  new Date(2026, 8, 9, 9),
  new Date(2026, 10, 6, 18, 30),
  new Date(2026, 11, 31, 23, 59),
  new Date(999, 4, 5, 12),
];

describe('dayKey', () => {
  it.each(DATES.map((d) => [d.toString(), d] as const))('%s: the same text as both old copies', (_, d) => {
    expect(dayKey(d)).toBe(oldLong(d));
    expect(dayKey(d)).toBe(oldShort(d));
  });

  it('reads like 2026-11-06', () => {
    expect(dayKey(new Date(2026, 10, 6, 8))).toBe('2026-11-06');
  });

  it('every caller gives what its old copy gave', () => {
    for (const d of DATES) {
      const t = d.getTime();
      expect(reportDay(t)).toBe(oldLong(new Date(t)));
      expect(startDay(d)).toBe(oldLong(d));
      expect(backupFileName(t)).toBe(`anygym-backup-${oldShort(new Date(t))}.json`);
      expect(weekKey(t)).toBe(oldShort(new Date(weekStart(t))));
    }
  });
});
