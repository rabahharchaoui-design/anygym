import { describe, expect, it } from 'vitest';
import { DRAFTS_NOT_SAVED, clearDraft, clearSessionDrafts, loadDraft, onDraftStorageFail, saveDraft, settleDraft, type Draft } from '../drafts';
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

  it('PLAN 1.10d (5): storage that throws never loses a draft when switching cards; warns once', () => {
    const s = memory();
    s.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    let warned = 0;
    const off = onDraftStorageFail(() => warned++);
    const hold: Draft = { id: 'h', load: null, watch: { startedAt: 5_000, accumulated: 2_000 } };
    // The squat card saves, then collapses (unmounts) while the plank card is used.
    expect(saveDraft('w1', 'squat', plates, s)).toBe(false);
    expect(saveDraft('w1', 'plank', hold, s)).toBe(false);
    expect(saveDraft('w1', 'squat', { ...plates, reps: 9 }, s)).toBe(false);
    // Back on the squat card (a fresh mount reads the draft again): weight and reps are there.
    expect(loadDraft('w1', 'squat', s)).toEqual({ ...plates, reps: 9 });
    expect(loadDraft('w1', 'plank', s)).toEqual(hold);
    expect(warned).toBe(1);
    expect(DRAFTS_NOT_SAVED).toBe('Drafts will not survive a reload on this phone');
    // Logged: cleared in memory too, even though storage could not be written.
    clearDraft('w1', 'squat', s);
    expect(loadDraft('w1', 'squat', s)).toBeNull();
    clearSessionDrafts('w1', s);
    expect(loadDraft('w1', 'plank', s)).toBeNull();
    off();
  });

  it('memory is the source of truth while the app is open; storage is the copy for a reload', () => {
    const s = memory();
    expect(saveDraft('w1', 'squat', plates, s)).toBe(true);
    s.setItem('anygym-drafts', '{}'); // storage wiped behind the app's back
    expect(loadDraft('w1', 'squat', s)).toEqual(plates);
    // A reload (a new page life) reads storage: here a fresh storage object stands in for it.
    const after = memory();
    after.setItem('anygym-drafts', JSON.stringify({ w1: { squat: plates } }));
    expect(loadDraft('w1', 'squat', after)).toEqual(plates);
  });

  it('with no storage at all, drafts still live in memory', () => {
    let warned = 0;
    const off = onDraftStorageFail(() => warned++);
    expect(saveDraft('mem-only', 'x', plates, null)).toBe(false);
    expect(loadDraft('mem-only', 'x', null)).toEqual(plates);
    clearDraft('mem-only', 'x', null);
    expect(loadDraft('mem-only', 'x', null)).toBeNull();
    expect(warned).toBeLessThanOrEqual(1);
    off();
  });

  it('Codex 1.10d (3): each storage write is the whole memory copy: A failed, B saved → a reload has both; a cleared draft stays cleared', () => {
    const s = memory();
    const real = s.setItem;
    let broken = true;
    s.setItem = (k, v) => {
      if (broken) throw new Error('QuotaExceededError');
      real(k, v);
    };
    const off = onDraftStorageFail(() => {});
    real('anygym-drafts', JSON.stringify({ w1: { old: { ...plates, id: 'old' } } })); // from before a reload
    expect(saveDraft('w1', 'a', { ...plates, id: 'a' }, s)).toBe(false);
    clearDraft('w1', 'old', s); // fails to reach storage too
    broken = false;
    expect(saveDraft('w1', 'b', { ...plates, id: 'b' }, s)).toBe(true);
    const stored = JSON.parse(s.getItem('anygym-drafts')!) as Record<string, Record<string, Draft>>;
    expect(Object.keys(stored.w1!).sort()).toEqual(['a', 'b']);
    // A reload (a fresh page life, here a fresh storage object with the same contents) sees both.
    const after = memory();
    after.setItem('anygym-drafts', s.getItem('anygym-drafts')!);
    expect(loadDraft('w1', 'a', after)!.id).toBe('a');
    expect(loadDraft('w1', 'b', after)!.id).toBe('b');
    expect(loadDraft('w1', 'old', after)).toBeNull();
    off();
  });

  it('Codex 1.10d (2): a landed Log clears only the version it submitted; newer edits stay, under the next id', () => {
    const s = memory();
    saveDraft('w1', 'squat', { ...plates, rev: 3 }, s);
    expect(settleDraft('w1', 'squat', 3, 'next', s)).toBeNull();
    expect(loadDraft('w1', 'squat', s)).toBeNull();

    saveDraft('w1', 'squat', { ...plates, reps: 12, rev: 5 }, s); // edited during the write
    expect(settleDraft('w1', 'squat', 4, 'next', s)).toEqual({ ...plates, id: 'next', reps: 12, rev: 5 });
    expect(loadDraft('w1', 'squat', s)).toEqual({ ...plates, id: 'next', reps: 12, rev: 5 });
    expect(settleDraft('w1', 'none', 1, 'x', s)).toBeNull();
    s.setItem('anygym-drafts', JSON.stringify({ w9: { x: { id: 'a', load: null, rev: 'x' } } }));
    expect(loadDraft('w9', 'x', s)).toBeNull();
  });
});
