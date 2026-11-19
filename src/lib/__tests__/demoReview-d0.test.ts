// PLAN D0: G's hand review of the demos, applied to the photo gate (pure part).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyDemoReview, DemoReviewError, parseDemoReview } from '../demoReview';

const SHA = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const IDS = new Set(['A', 'B', 'C', 'D']);
const file = (decisions: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ format: 'anygym-review-v1', catalogSha: SHA, decisions, ...extra });
const at = 1;

describe('parseDemoReview', () => {
  it('reads verdicts and trimmed notes', () => {
    const r = parseDemoReview(file({ A: { verdict: 'approved', at }, B: { verdict: 'fix-cues', note: ' Needs better demo ', at } }), SHA, IDS);
    expect(r.verdicts.get('A')).toEqual({ verdict: 'approved' });
    expect(r.verdicts.get('B')).toEqual({ verdict: 'fix-cues', note: 'Needs better demo' });
  });

  it('refuses a file made for another catalog sha, with a plain message', () => {
    const run = () => parseDemoReview(file({ A: { verdict: 'approved', at } }, { catalogSha: 'deadbeef' }), SHA, IDS);
    expect(run).toThrow(DemoReviewError);
    expect(run).toThrow(/made for catalog deadbeef but data\/catalog\.json is f00c92c7/);
  });

  it('refuses another format, an unknown id and an unknown verdict', () => {
    expect(() => parseDemoReview(file({}, { format: 'other' }), SHA, IDS)).toThrow(/format is other/);
    expect(() => parseDemoReview(file({ Z: { verdict: 'approved', at } }), SHA, IDS)).toThrow(/Z is not in the catalog/);
    expect(() => parseDemoReview(file({ A: { verdict: 'maybe', at } }), SHA, IDS)).toThrow(/unknown verdict maybe/);
    expect(() => parseDemoReview(null, SHA, IDS)).toThrow(DemoReviewError);
  });
});

describe('applyDemoReview', () => {
  const review = parseDemoReview(
    file({ A: { verdict: 'approved', at }, B: { verdict: 'wrong-demo', at }, C: { verdict: 'fix-cues', note: 'x', at } }),
    SHA,
    IDS,
  );
  const before = new Map([['B', 'exact' as const], ['C', 'variant' as const], ['D', 'variant' as const]]);

  it('approved shows (exact when new), every other verdict hides, unnamed ids keep the earlier rule', () => {
    const out = applyDemoReview(before, review);
    expect([...out].sort()).toEqual([['A', 'exact'], ['D', 'variant']]);
  });

  it('keeps an earlier kind for an approved id and never changes its input', () => {
    const variant = new Map([['A', 'variant' as const]]);
    expect(applyDemoReview(variant, review).get('A')).toBe('variant');
    expect([...variant]).toEqual([['A', 'variant']]);
    applyDemoReview(before, review);
    expect(before.size).toBe(3);
  });

  it('running it twice changes nothing', () => {
    const once = applyDemoReview(before, review);
    expect([...applyDemoReview(once, review)]).toEqual([...once]);
  });
});

describe("G's Nov 19 review file", () => {
  const raw = JSON.parse(readFileSync('data/reviews/demo-review-2026-11-19.json', 'utf8')) as { catalogSha: string; decisions: Record<string, { verdict: string }> };
  const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8')) as { source: { sha: string }; exercises: { id: string }[] };

  it('belongs to the shipped catalog and covers all 138 exercises: 99 approved, 8 wrong demo, 31 fix cues', () => {
    expect(raw.catalogSha).toBe(catalog.source.sha);
    const review = parseDemoReview(raw, catalog.source.sha, new Set(catalog.exercises.map((e) => e.id)));
    expect(review.verdicts.size).toBe(138);
    const count = (v: string) => [...review.verdicts.values()].filter((d) => d.verdict === v).length;
    expect([count('approved'), count('wrong-demo'), count('fix-cues'), count('wrong-muscles')]).toEqual([99, 8, 31, 0]);
    // Every fix cues verdict carries G's note (it is the D1 brief).
    for (const d of review.verdicts.values()) if (d.verdict === 'fix-cues') expect(d.note?.length).toBeGreaterThan(5);
  });

  it('holds nothing but ids, verdicts, times and notes', () => {
    for (const d of Object.values(raw.decisions)) for (const k of Object.keys(d)) expect(['verdict', 'at', 'note']).toContain(k);
    expect(Object.keys(raw).sort()).toEqual(['catalogSha', 'decisions', 'exportedAt', 'format', 'reviewed', 'total']);
  });
});
