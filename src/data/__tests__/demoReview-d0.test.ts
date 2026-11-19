// PLAN D0: G's hand review (data/reviews/demo-review-2026-11-19.json) decides every catalog demo.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const bytes = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const MUSCLE_FILES = ['data/catalog.json', 'data/muscle-overrides.json', 'data/exercise-map.json', 'data/exercise-cues.json'];
const raw = JSON.parse(readFileSync('data/reviews/demo-review-2026-11-19.json', 'utf8')) as { decisions: Record<string, { verdict: string; note?: string }> };
const verdict = (id: string) => raw.decisions[id]!.verdict;

describe('demo review applied to the catalog', async () => {
  const before = Object.fromEntries(MUSCLE_FILES.map((p) => [p, bytes(p)]));
  const { CATALOG, musclesForCatalog } = await import('../muscles');
  const { DEMO_REVIEW, infoForCatalog, photoEligibility, ownerPreviewForCatalog } = await import('../exerciseInfo');
  const ids = CATALOG.map((e) => e.id);

  it('the shipped review is accepted', () => {
    expect(DEMO_REVIEW?.verdicts.size).toBe(138);
  });

  it('99 catalog demos shown, 39 hidden, exactly as G judged them', () => {
    const shown = ids.filter((id) => infoForCatalog(id).demo !== null);
    expect(shown.length).toBe(99);
    expect(ids.length - shown.length).toBe(39);
    for (const id of ids) expect(photoEligibility(id) !== 'none', id).toBe(verdict(id) === 'approved');
  });

  it('spot checks: Barbell_Squat shown, Barbell_Deadlift and Russian_Twist hidden', () => {
    expect(infoForCatalog('Barbell_Squat').demo).not.toBeNull();
    expect(infoForCatalog('Barbell_Deadlift').demo).toBeNull();
    expect(infoForCatalog('Russian_Twist').demo).toBeNull();
    // Hidden from people, still there for the owner to look at in #/review.
    expect(ownerPreviewForCatalog('Barbell_Deadlift').demo).not.toBeNull();
  });

  it('a hidden demo keeps its text cues and muscles (the honest empty state)', () => {
    const cues = JSON.parse(readFileSync('data/exercise-cues.json', 'utf8')) as { exercises: Record<string, { cues: { text: string }[] }> };
    for (const id of ids.filter((i) => verdict(i) !== 'approved')) {
      const info = infoForCatalog(id);
      expect(info.demo, id).toBeNull();
      expect(info.cues, id).toEqual((cues.exercises[id]?.cues ?? []).map((c) => c.text));
    }
    expect(infoForCatalog('Barbell_Deadlift').cues.length).toBeGreaterThan(0);
  });

  it('never changes muscle data: files byte identical, every sheet carries the same muscles', () => {
    for (const p of MUSCLE_FILES) expect(bytes(p), p).toBe(before[p]);
    for (const id of ids) expect(JSON.stringify(infoForCatalog(id).muscles), id).toBe(JSON.stringify(musclesForCatalog(id)));
  });

  it('a review made for another catalog is refused: no catalog demo shows at all', async () => {
    vi.resetModules();
    vi.doMock('../../../data/reviews/demo-review-2026-11-19.json', () => ({ default: { ...raw, format: 'anygym-review-v1', catalogSha: 'not-this-catalog' } }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mod = await import('../exerciseInfo');
    expect(mod.DEMO_REVIEW).toBeNull();
    expect(String(error.mock.calls[0]?.[0])).toMatch(/Demo review refused: it was made for catalog not-this-catalog/);
    expect(ids.filter((id) => mod.infoForCatalog(id).demo !== null)).toEqual([]);
    error.mockRestore();
    vi.doUnmock('../../../data/reviews/demo-review-2026-11-19.json');
    vi.resetModules();
  });
});

describe('the D1 replacement list', () => {
  const list = JSON.parse(readFileSync('data/reviews/demo-replacements-2026-11-19.json', 'utf8')) as { groups: { name: string; ids: { id: string; verdict: string; note?: string }[] }[] };
  const rows = list.groups.flatMap((g) => g.ids);

  it('is exactly the 39 ids G hid, each once, with his verdict and note', () => {
    const hidden = Object.entries(raw.decisions).filter(([, d]) => d.verdict !== 'approved');
    expect(rows.length).toBe(39);
    expect(new Set(rows.map((r) => r.id)).size).toBe(39);
    for (const [id, d] of hidden) expect(rows.find((r) => r.id === id), id).toEqual({ id, verdict: d.verdict, ...(d.note ? { note: d.note } : {}) });
  });

  it('in PLAN D1 order: the 8 wrong demos, the 4 form critical lifts, then the other fix cues', () => {
    expect(list.groups.map((g) => [g.name, g.ids.length])).toEqual([['wrong demo', 8], ['form critical lifts', 4], ['other fix cues', 27]]);
    expect(list.groups[0]!.ids.every((r) => r.verdict === 'wrong-demo')).toBe(true);
    expect(list.groups[1]!.ids.map((r) => r.id)).toEqual(['Barbell_Deadlift', 'Romanian_Deadlift', 'Sumo_Deadlift', 'Smith_Machine_Stiff-Legged_Deadlift']);
  });
});
