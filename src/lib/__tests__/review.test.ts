import { describe, expect, it } from 'vitest';
import { buildExport, canDecide, clearDecision, decide, emptyReview, exportName, nextIndex, parseReview, progress, progressText } from '../review';

const ids = ['a', 'b', 'c'];

describe('review state', () => {
  it('counts progress over catalog ids only', () => {
    let s = decide(emptyReview(), 'a', 'approved', '', 1);
    s = decide(s, 'gone', 'approved', '', 2);
    expect(progressText(progress(s, ids))).toBe('1 / 3 reviewed');
  });
  it('fix cues needs a note; others ignore it', () => {
    expect(canDecide('fix-cues', '  ')).toBe(false);
    expect(decide(emptyReview(), 'a', 'fix-cues', ' ', 1).decisions).toEqual({});
    expect(decide(emptyReview(), 'a', 'fix-cues', ' shorter ', 1).decisions.a).toEqual({ verdict: 'fix-cues', note: 'shorter', at: 1 });
    expect(canDecide('approved', '')).toBe(true);
  });
  it('a later decision replaces; clear removes', () => {
    let s = decide(emptyReview(), 'a', 'approved', '', 1);
    s = decide(s, 'a', 'wrong-demo', '', 2);
    expect(s.decisions.a!.verdict).toBe('wrong-demo');
    expect(clearDecision(s, 'a').decisions).toEqual({});
  });
  it('moves to the next undecided exercise, wrapping', () => {
    const s = decide(decide(emptyReview(), 'b', 'approved', '', 1), 'c', 'approved', '', 1);
    expect(nextIndex(s, ids, -1)).toBe(0);
    expect(nextIndex(emptyReview(), ids, 0)).toBe(1);
    expect(nextIndex(decide(s, 'a', 'approved', '', 1), ids, 0)).toBe(1);
  });
  it('exports the documented shape with the catalog sha', () => {
    const s = decide(decide(emptyReview(), 'a', 'approved', '', 1), 'x', 'approved', '', 1);
    const out = buildExport(s, ids, 'abc123', Date.UTC(2026, 9, 31));
    expect(out).toEqual({
      format: 'anygym-review-v1',
      catalogSha: 'abc123',
      exportedAt: '2026-10-31T00:00:00.000Z',
      reviewed: 1,
      total: 3,
      decisions: { a: { verdict: 'approved', at: 1 } },
    });
    expect(exportName(Date.UTC(2026, 9, 31))).toBe('anygym-review-2026-10-31.json');
  });
  it('parses stored JSON defensively', () => {
    expect(parseReview(null)).toEqual(emptyReview());
    expect(parseReview('{nope')).toEqual(emptyReview());
    expect(parseReview(JSON.stringify({ decisions: { a: { verdict: 'bogus', at: 1 }, b: { verdict: 'approved', at: 2 } } })).decisions).toEqual({ b: { verdict: 'approved', at: 2 } });
  });
});
