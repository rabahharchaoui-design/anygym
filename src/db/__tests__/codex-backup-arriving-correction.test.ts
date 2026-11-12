import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { makeGym } from '../gyms';
import { exportBackup, restoreReplace } from '../backup';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import { finishWorkout, logSet, startWorkout, UnsavedWritesError } from '../workouts';
import { parseBackup, serializeBackup } from '../../lib/backup';
import { stackLoad } from '../../lib/load';

let source: AnyGymDB;
let destination: AnyGymDB;
let seq = 0;
beforeEach(async () => {
  source = new AnyGymDB(`codex-backup-arriving-source-${seq}`);
  destination = new AnyGymDB(`codex-backup-arriving-destination-${seq++}`);
  await Promise.all([source.open(), destination.open()]);
});
afterEach(async () => { await Promise.all([source.delete(), destination.delete()]); });

// SPEC 0/2/9, completed PLAN 2.0h/2.0l/3.2b. Unlike the superseded
// correction test, create NEW pending input after export's initial held read.
describe('backup includes corrections durable before its table snapshot', () => {
  for (const timing of ['before export', 'at snapshot'] as const) {
    // CODEX FOUND BUG: A correction retained after backup’s initial held read is omitted even when the backup includes a later committed set.
    // Deferred with the two tab variants (orchestrator, Nov 12): 'at snapshot' needs a failed journal
    // write and a backup export interleaved in the same instant. Known gap, kept as an expected failure.
    (timing === 'at snapshot' ? it.fails : it)(`${timing}: restore, restart, Retry and Finish keep the full corrected resistance exactly once`, async () => {
      const gym = makeGym({ name: 'Synthetic gym', type: 'full', unit: 'kg', isActive: true }, 1);
      await source.gyms.add(gym);
      const session = await startWorkout(gym.id, source, 1000);
      const original = await logSet({ id: 'correct-me', sessionId: session.id,
        exerciseId: 'lat-pulldown', reps: 10, load: stackLoad(50, 'kg') }, source);
      const correction = { kind: 'edit' as const, setId: original.id,
        change: { reps: 19, load: stackLoad(60, 'kg', 1.25) } };
      const retain = async () => {
        const put = source.journal.put;
        source.journal.put = (() => Promise.reject(new Error('synthetic journal failure'))) as unknown as typeof put;
        try {
          await expect(saveMutation(session.id, 'lat-pulldown', correction, source, 2000, null))
            .rejects.toThrow('synthetic journal failure');
        } finally { source.journal.put = put; }
        expect((await pendingMutations(session.id, source, null)).map((e) => e.mutation)).toEqual([correction]);
      };
      if (timing === 'before export') await retain();
      const transaction = source.transaction.bind(source);
      let intercepted = false;
      // Same deterministic boundary as codex-3.2b; no sleeps or real tab needed.
      const run = transaction as (...args: unknown[]) => Promise<unknown>;
      source.transaction = (async (...args: unknown[]) => {
        if (timing === 'at snapshot' && !intercepted && args[0] === 'r') {
          intercepted = true;
          await retain();
          // Force the backup to include a later commit: it cannot be a snapshot
          // from before the correction while also containing this marker set.
          await logSet({ id: 'later-set', sessionId: session.id,
            exerciseId: 'lat-pulldown', reps: 7, load: stackLoad(20, 'kg') }, source);
        }
        return run(...args);
      }) as typeof source.transaction;
      let backup;
      try { backup = await exportBackup(source, 3000, null); }
      finally { source.transaction = transaction; }
      if (timing === 'at snapshot') {
        expect(intercepted).toBe(true);
        expect(backup.tables.sets.some((s) => s.id === 'later-set')).toBe(true);
      }
      const parsed = parseBackup(serializeBackup(backup));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error('Backup failed validation');
      await restoreReplace(parsed.backup, destination, null);
      const name = destination.name;
      destination.close();
      destination = new AnyGymDB(name);
      await destination.open();
      expect((await pendingMutations(session.id, destination, null)).map((e) => e.mutation)).toEqual([correction]);
      await expect(finishWorkout(session.id, destination, 4000, undefined, undefined, null))
        .rejects.toBeInstanceOf(UnsavedWritesError);
      expect(await retryMutations(session.id, destination, null)).toBe(true);
      expect(await retryMutations(session.id, destination, null)).toBe(true);
      await finishWorkout(session.id, destination, 5000, undefined, undefined, null);
      expect(await destination.sets.get(original.id)).toEqual({ ...original, ...correction.change });
      expect(await destination.sets.count()).toBe(timing === 'at snapshot' ? 2 : 1);
      expect(await destination.journal.count()).toBe(0);
    });
  }
});
