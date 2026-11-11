// PLAN 3.5v: the one screen review adds Undo and reason chips. The stored format (kv 'review:v1',
// one JSON string) and the export stay exactly as they were: decisions saved before still read.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { readReview, restoreReviewDecision, saveReviewDecision } from '../review';
import { REASON_WORDS, REVIEW_KEY, VERDICT_WORDS, WRONG_CUES_NOTE, WRONG_REASONS, buildExport, canDecide, decide, emptyReview, muscleChips, restoreDecision } from '../../lib/review';

let db: AnyGymDB;
beforeEach(async () => {
  db = new AnyGymDB(`review-35v-${Math.random()}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

describe('review 3.5v: Undo and reasons keep the saved format', () => {
  it('Undo of a first decision removes it; Undo of a changed one puts the earlier one back', async () => {
    await saveReviewDecision(db, 'a', 'approved', '', 1);
    await saveReviewDecision(db, 'b', 'wrong-demo', '', 2);
    expect((await restoreReviewDecision(db, 'b', undefined, 3)).decisions).toEqual({ a: { verdict: 'approved', at: 1 } });
    const before = (await readReview(db)).decisions.a;
    await saveReviewDecision(db, 'a', 'wrong-muscles', '', 4);
    await restoreReviewDecision(db, 'a', before, 5);
    expect((await readReview(db)).decisions).toEqual({ a: { verdict: 'approved', at: 1 } });
  });

  it('decisions stored before 3.5v read unchanged, and the stored value keeps its shape', async () => {
    const old = { decisions: { x: { verdict: 'fix-cues', note: 'Shorter', at: 7 }, y: { verdict: 'approved', at: 8 } } };
    await db.kv.put({ key: REVIEW_KEY, value: JSON.stringify(old), at: 8 });
    expect(await readReview(db)).toEqual(old);
    await saveReviewDecision(db, 'z', 'fix-cues', WRONG_CUES_NOTE, 9);
    await restoreReviewDecision(db, 'y', undefined, 10);
    const raw = JSON.parse((await db.kv.get(REVIEW_KEY))!.value ?? '');
    expect(raw).toEqual({ decisions: { x: old.decisions.x, z: { verdict: 'fix-cues', note: 'Wrong cues', at: 9 } } });
    expect(buildExport(raw, ['x', 'y', 'z'], 'sha', 0)).toMatchObject({ format: 'anygym-review-v1', reviewed: 2, total: 3, decisions: raw.decisions });
  });

  it('the reason chips are the three old verdicts; Wrong cues is a Fix cues with a note that passes', () => {
    expect(WRONG_REASONS.map((r) => REASON_WORDS[r])).toEqual(['Wrong demo', 'Wrong muscles', 'Wrong cues']);
    expect(WRONG_REASONS[0]).toBe('wrong-demo');
    expect(canDecide('fix-cues', WRONG_CUES_NOTE)).toBe(true);
    expect(Object.keys(VERDICT_WORDS).sort()).toEqual(['approved', 'fix-cues', 'wrong-demo', 'wrong-muscles']);
  });

  it('restoreDecision is pure and leaves the others alone', () => {
    const s = decide(decide(emptyReview(), 'a', 'approved', '', 1), 'b', 'wrong-demo', '', 2);
    expect(restoreDecision(s, 'b', undefined)).toEqual({ decisions: { a: s.decisions.a } });
    expect(restoreDecision(s, 'b', { verdict: 'approved', at: 0 }).decisions.b).toEqual({ verdict: 'approved', at: 0 });
    expect(s.decisions.b?.verdict).toBe('wrong-demo');
  });

  it('muscle chips: each primary name once, capitalised, at most three and how many more', () => {
    const t = (label: string) => ({ label });
    expect(muscleChips([t('upper chest'), t('front delts'), t('upper chest')])).toEqual({ chips: ['Upper chest', 'Front delts'], more: 0 });
    expect(muscleChips([t('a'), t('b'), t('c'), t('d'), t('e')])).toEqual({ chips: ['A', 'B', 'C'], more: 2 });
    expect(muscleChips([])).toEqual({ chips: [], more: 0 });
  });
});
