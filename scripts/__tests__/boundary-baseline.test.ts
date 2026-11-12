import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import { compareBoundary } from '../boundary-baseline.mjs';

describe('screens may not import src/db (PLAN 3.6x)', () => {
  it('an exact list passes', () => {
    expect(compareBoundary(['a.tsx', 'b.tsx'], ['b.tsx', 'a.tsx'])).toEqual({ stale: [], unlisted: [] });
  });
  it('a new offender is unlisted', () => {
    expect(compareBoundary(['a.tsx'], ['a.tsx', 'new.tsx']).unlisted).toEqual(['new.tsx']);
  });
  it('a listed file that stopped importing src/db is stale, so the list can only shrink', () => {
    expect(compareBoundary(['a.tsx', 'b.tsx'], ['a.tsx']).stale).toEqual(['b.tsx']);
  });
});
