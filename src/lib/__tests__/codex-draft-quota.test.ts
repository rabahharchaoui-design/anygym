import { describe, expect, it } from 'vitest';
import { clearSessionDrafts, loadDraft, saveDraft, type Draft } from '../drafts';

describe('draft recovery when phone storage fills (SPEC 13.3)', () => {
  // CODEX FOUND BUG: A failed localStorage write silently discards the latest draft when its exercise card is remounted.
  it('keeps the latest reps and plates when storage fills after an earlier draft was saved', () => {
    const values = new Map<string, string>();
    let full = false;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (full) throw new DOMException('Synthetic full storage', 'QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => { values.delete(key); },
    };
    const before: Draft = { id: 'synthetic-draft', reps: 8, plates: [45], load: { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] } };
    const changed: Draft = { ...before, reps: 12, plates: [45, 5], load: { kind: 'barbell', unit: 'lb', total: 145, barWeight: 45, perSide: [45, 5] } };
    try {
      saveDraft('synthetic-session', 'squat', before, storage);
      expect(loadDraft('synthetic-session', 'squat', storage)).toEqual(before);
      full = true;
      saveDraft('synthetic-session', 'squat', changed, storage);
      // This is a card switch in the same runtime, not recovery after a device restart.
      expect(loadDraft('synthetic-session', 'squat', storage)).toEqual(changed);
    } finally {
      full = false;
      clearSessionDrafts('synthetic-session', storage);
    }
  });
});
