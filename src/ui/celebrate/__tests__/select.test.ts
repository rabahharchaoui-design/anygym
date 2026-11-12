import { describe, expect, it } from 'vitest';
import { KIND_ORDER, rankMoments, selectCelebrations, stagingFor, tierOf } from '../select';
import type { Moment } from '../types';

const lift = (id: string, weight: number, big = false): Moment => ({ id: `lift:${id}`, kind: 'lift_record', big, weight, title: id, hero: '185 lb', caption: 'Heaviest ever', detail: '185 lb × 6, heaviest ever' });
const first: Moment = { id: 'first:s1', kind: 'first_workout', big: true, weight: 0, title: 'First workout', hero: '4,250 lb', caption: 'lifted today', detail: '4,250 lb lifted today' };

describe('selectCelebrations (PLAN 3.6b tier rules)', () => {
  it('nothing to celebrate: nothing in any tier, in either place', () => {
    expect(selectCelebrations([], 'summary')).toEqual({ big: null, medium: [], small: [] });
    expect(selectCelebrations([], 'active')).toEqual({ big: null, medium: [], small: [] });
  });

  it('while active nothing is BIG or MEDIUM, however rare: every moment is SMALL, in the order it happened', () => {
    const s = selectCelebrations([lift('row', 1.1), lift('bench', 1.05, true), first], 'active');
    expect(s.big).toBeNull();
    expect(s.medium).toEqual([]);
    expect(s.small.map((m) => m.id)).toEqual(['lift:row', 'lift:bench', 'first:s1']);
  });

  it('an ordinary record on the summary is MEDIUM, never BIG', () => {
    const s = selectCelebrations([lift('curl', 1.2)], 'summary');
    expect(s.big).toBeNull();
    expect(s.medium.map((m) => m.id)).toEqual(['lift:curl']);
    expect(s.small).toEqual([]);
  });

  it('one rare moment on the summary is BIG and is not repeated as a card', () => {
    const s = selectCelebrations([lift('bench', 1.05, true)], 'summary');
    expect(s.big?.id).toBe('lift:bench');
    expect(s.medium).toEqual([]);
  });

  it('two rare moments: one BIG (the bigger gain), the other MEDIUM', () => {
    const s = selectCelebrations([lift('bench', 1.05, true), lift('squat', 1.11, true)], 'summary');
    expect(s.big?.id).toBe('lift:squat');
    expect(s.medium.map((m) => m.id)).toEqual(['lift:bench']);
  });

  it('never more than one BIG, and the ones that lost the screen lead the cards', () => {
    const s = selectCelebrations([lift('curl', 1.5), lift('bench', 1.05, true), lift('row', 1.2), lift('squat', 1.11, true), lift('press', 1.02, true)], 'summary');
    expect(s.big?.id).toBe('lift:squat');
    expect(s.medium.map((m) => m.id)).toEqual(['lift:bench', 'lift:press', 'lift:curl', 'lift:row']);
  });

  it('a rarer kind beats a bigger number: the first workout wins the screen over a lift record', () => {
    const s = selectCelebrations([lift('bench', 9, true), first], 'summary');
    expect(s.big?.id).toBe('first:s1');
    expect(s.medium.map((m) => m.id)).toEqual(['lift:bench']);
  });

  it('a tie goes to the one that happened first; floating noise is a tie', () => {
    expect(selectCelebrations([lift('a', 1.1, true), lift('b', 1.1, true)], 'summary').big?.id).toBe('lift:a');
    expect(selectCelebrations([lift('a', 1.1, true), lift('b', 1.1 + 1e-12, true)], 'summary').big?.id).toBe('lift:a');
    expect(selectCelebrations([lift('a', 5, true), lift('b', Infinity, true), lift('c', Infinity, true)], 'summary').big?.id).toBe('lift:b');
  });

  it('the same moment given twice is one moment', () => {
    const s = selectCelebrations([lift('bench', 1.05, true), lift('bench', 1.05, true), lift('curl', 1.2), lift('curl', 1.2)], 'summary');
    expect(s.big?.id).toBe('lift:bench');
    expect(s.medium.map((m) => m.id)).toEqual(['lift:curl']);
  });

  it('a BIG already shown is never shown again: it leads the cards, in the same order', () => {
    const fresh = selectCelebrations([lift('curl', 1.5), lift('bench', 1.05, true), lift('squat', 1.11, true)], 'summary');
    const spent = selectCelebrations([lift('curl', 1.5), lift('bench', 1.05, true), lift('squat', 1.11, true)], 'summary', { bigSpent: true });
    expect(spent.big).toBeNull();
    expect(spent.medium.map((m) => m.id)).toEqual(['lift:squat', 'lift:bench', 'lift:curl']);
    expect([fresh.big!, ...fresh.medium].map((m) => m.id)).toEqual(spent.medium.map((m) => m.id));
  });

  it('tierOf names the tier a moment got', () => {
    const s = selectCelebrations([lift('bench', 1.05, true), lift('curl', 1.2)], 'summary');
    expect(tierOf(s, 'lift:bench')).toBe('big');
    expect(tierOf(s, 'lift:curl')).toBe('medium');
    expect(tierOf(s, 'lift:nope')).toBeNull();
    expect(tierOf(selectCelebrations([lift('curl', 1.2)], 'active'), 'lift:curl')).toBe('small');
  });

  it('rankMoments: kinds by KIND_ORDER, then weight, stable', () => {
    expect(KIND_ORDER[0]).toBe('first_workout');
    expect(rankMoments([lift('a', 1), first, lift('b', 2)]).map((m) => m.id)).toEqual(['first:s1', 'lift:b', 'lift:a']);
  });

  it('reduced motion keeps the tiers and the words; only the staging changes', () => {
    expect(stagingFor(false)).toEqual({ particles: true, countUp: true, travel: true });
    expect(stagingFor(null)).toEqual({ particles: true, countUp: true, travel: true });
    expect(stagingFor(true)).toEqual({ particles: false, countUp: false, travel: false });
  });
});
