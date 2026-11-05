import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import type { AnyGymDB } from '../../db/schema';

const opened: AnyGymDB[] = [];
async function tab() {
  vi.resetModules();
  const rows = await import('../extraSets');
  const { db } = await import('../../db/schema');
  opened.push(db);
  return { rows, db };
}
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  const { AnyGymDB } = await import('../../db/schema');
  await new AnyGymDB('anygym').delete();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// Completed PLAN 2.2d / 3.2c: the existing blocked-storage case covers counts,
// but not independent dropped-set markers or the effect of Undo on those markers.
it('blocked localStorage: stale tabs retain both deleted rows, and Undo restores only its own row after restart', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => { throw new Error('synthetic quota exceeded'); },
    removeItem: () => undefined,
  });
  const a = await tab();
  await a.db.kv.clear();
  a.rows.addExtraSet('s', 'squat');
  await a.rows.settleExtraSets();
  const b = await tab();
  b.rows.hydrateExtraSets((await b.db.kv.get('anygym-extra-sets'))!.value);
  a.rows.markDeleted('s', 'squat-lift', 'squat');
  await a.rows.settleExtraSets();
  b.rows.markDeleted('s', 'bench-lift', 'bench');
  await b.rows.settleExtraSets();
  const restarted = await tab();
  restarted.rows.hydrateExtraSets((await restarted.db.kv.get('anygym-extra-sets'))!.value);
  expect(restarted.rows.liveRowAdjustments('s', new Set())).toEqual({ bench: -1 });
  // Putting the squat set back by Undo must restore its row exactly once.
  expect(restarted.rows.liveRowAdjustments('s', new Set(['squat-lift']))).toEqual({ squat: 1, bench: -1 });
  expect(restarted.rows.liveRowAdjustments('s', new Set(['bench-lift']))).toEqual({});
  // A later Edit → Delete retains the squat row; clearing that marker cannot clear bench's.
  a.rows.markDeleted('s', 'squat-lift', null);
  await a.rows.settleExtraSets();
  const again = await tab();
  again.rows.hydrateExtraSets((await again.db.kv.get('anygym-extra-sets'))!.value);
  expect(again.rows.liveRowAdjustments('s', new Set())).toEqual({ squat: 1, bench: -1 });
  const stored = JSON.parse((await again.db.kv.get('anygym-extra-sets'))!.value!);
  expect(stored.dropped).toEqual({ 'bench-lift': 'bench' });
});
