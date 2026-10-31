// PLAN 2.0e (4): a backup right after startup without localStorage has every pending draft the
// IndexedDB copy handed back, before any exercise was opened; memory edits win, clears stay cleared.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { clearDraft, exportDrafts, hydrateDrafts, saveDraft, type Draft, type DraftsBlob } from '../drafts';

const r17: Draft = { id: 'r17', load: { kind: 'single', unit: 'lb', total: 53 }, reps: 17, rev: 3, unit: 'lb', type: 'normal' };
const plates: Draft = { id: 'p1', load: null, plates: [45, 10], unit: 'lb', rev: 1 };
const hold: Draft = { id: 'h1', load: { kind: 'timed', unit: 'lb', total: 0 }, seconds: 40, watch: { startedAt: 1_000, accumulated: 2_500 }, submitted: 2, rev: 2 };

describe('exportDrafts with no localStorage (PLAN 2.0e)', () => {
  it('reproduction: hydrated at startup, exported at once: every valid draft with ids, revisions, plates and stopwatch', () => {
    const blob: DraftsBlob = { s1: { 'goblet@0': r17, 'squat@0': plates, 'plank@0': hold, 'bad@0': { id: '', load: null } as Draft } };
    hydrateDrafts(JSON.stringify(blob), null);
    expect(exportDrafts(null)).toEqual({ s1: { 'goblet@0': r17, 'squat@0': plates, 'plank@0': hold } });
  });

  it('memory edits win over the hydrated copy, and a cleared draft stays cleared', () => {
    hydrateDrafts(JSON.stringify({ s1: { 'goblet@0': r17, 'squat@0': plates } }), null);
    saveDraft('s1', 'goblet@0', { ...r17, reps: 18, rev: 4 }, null);
    clearDraft('s1', 'squat@0', null);
    expect(exportDrafts(null)).toEqual({ s1: { 'goblet@0': { ...r17, reps: 18, rev: 4 } } });
    clearDraft('s1', 'goblet@0', null);
    expect(exportDrafts(null)).toEqual({});
  });
});
