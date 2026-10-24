import { describe, expect, it } from 'vitest';
import { clearDraft, clearSessionDrafts, loadDraft, saveDraft, type Draft } from '../drafts';
import { captureHold, startWatch } from '../timer';

// PLAN 1.10c fix 2: what the user picked survives collapsing the card and a reload; cleared on log.

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

const plates: Draft = { id: 'p1', load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] }, plates: [45], reps: 8 };

describe('drafts', () => {
  it('round trips a draft per workout and exercise (a reload reads the same thing back)', () => {
    const s = memory();
    saveDraft('w1', 'squat', plates, s);
    saveDraft('w1', 'plank', { id: 'p2', load: { kind: 'timed', unit: 'lb', total: 0 }, watch: { startedAt: 1000, accumulated: 10_000 } }, s);
    expect(loadDraft('w1', 'squat', s)).toEqual(plates);
    expect(loadDraft('w1', 'plank', s)!.watch).toEqual({ startedAt: 1000, accumulated: 10_000 });
    expect(loadDraft('w1', 'bench', s)).toBeNull();
    expect(loadDraft('w2', 'squat', s)).toBeNull();
  });

  it('a running hold restored after a reload still reads the live time', () => {
    const s = memory();
    const watch = startWatch({ startedAt: null, accumulated: 10_000 }, 50_000); // stopped at 10 s, Start again
    saveDraft('w1', 'plank', { id: 'p', load: null, watch }, s);
    const back = loadDraft('w1', 'plank', s)!;
    expect(captureHold(back.watch!, 62_000).seconds).toBe(22);
  });

  it('keeps the unknown bar case: plates without a load', () => {
    const s = memory();
    saveDraft('w1', 'ez-bar-curl', { id: 'e', load: null, plates: [10, 5] }, s);
    expect(loadDraft('w1', 'ez-bar-curl', s)).toEqual({ id: 'e', load: null, plates: [10, 5] });
  });

  it('clears one draft on log, and every draft of a workout on Finish', () => {
    const s = memory();
    saveDraft('w1', 'squat', plates, s);
    saveDraft('w1', 'bench', { ...plates, id: 'b' }, s);
    clearDraft('w1', 'squat', s);
    expect(loadDraft('w1', 'squat', s)).toBeNull();
    expect(loadDraft('w1', 'bench', s)).not.toBeNull();
    clearDraft('w1', 'bench', s);
    expect(s.getItem('anygym-drafts')).toBeNull();
    saveDraft('w1', 'bench', plates, s);
    clearSessionDrafts('w1', s);
    expect(loadDraft('w1', 'bench', s)).toBeNull();
    clearDraft('nope', 'x', s);
  });

  it('only the workout in progress keeps drafts', () => {
    const s = memory();
    saveDraft('old', 'squat', plates, s);
    saveDraft('new', 'squat', plates, s);
    expect(loadDraft('old', 'squat', s)).toBeNull();
    expect(loadDraft('new', 'squat', s)).toEqual(plates);
  });

  it('ignores anything malformed instead of crashing', () => {
    const s = memory();
    for (const bad of ['not json', '[]', 'null']) {
      s.setItem('anygym-drafts', bad);
      expect(loadDraft('w', 'x', s)).toBeNull();
    }
    const cases: unknown[] = [
      null,
      { id: '' , load: null },
      { id: 'a', load: { total: 'x' } },
      { id: 'a', load: 5 },
      { id: 'a', load: null, plates: ['x'] },
      { id: 'a', load: null, plates: 'x' },
      { id: 'a', load: null, reps: 'x' },
      { id: 'a', load: null, watch: { startedAt: 'x', accumulated: 0 } },
      { id: 'a', load: null, watch: { startedAt: null } },
      { id: 'a', load: null, watch: null },
    ];
    for (const c of cases) {
      s.setItem('anygym-drafts', JSON.stringify({ w: { x: c } }));
      expect(loadDraft('w', 'x', s)).toBeNull();
    }
  });

  it('without storage (blocked), it does nothing and never throws', () => {
    expect(loadDraft('w', 'x', null)).toBeNull();
    saveDraft('w', 'x', plates, null);
    clearDraft('w', 'x', null);
    clearSessionDrafts('w', null);
    const full = memory();
    full.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    saveDraft('w', 'x', plates, full);
  });
});
