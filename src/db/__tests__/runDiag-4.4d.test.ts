// PLAN 4.4d (2): the run diagnostics log lives in its own small database, so the main one (and
// every saved run) is untouched and a backup never carries it.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { RunDiagDB, appendDiag, deleteDiag, hasDiag, pruneDiag, readDiag } from '../runDiag';
import { AnyGymDB, SCHEMA_VERSION } from '../schema';
import { TABLE_NAMES } from '../../lib/backup';
import { diagNote, type DiagEntry } from '../../lib/run/diag';

let n = 0;
const names: string[] = [];
const fresh = () => {
  const name = `diag-${n++}`;
  names.push(name);
  return new RunDiagDB(name);
};
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});
const e = (t: number): DiagEntry => diagNote(0, t, 'watch:restarted');

describe('4.4d run diagnostics storage', () => {
  it('chunks read back in order as one log', async () => {
    const db = fresh();
    await appendDiag({ runId: 'a', seq: 2, startedAt: 1, entries: [e(3), e(4)] }, db);
    await appendDiag({ runId: 'a', seq: 1, startedAt: 1, entries: [e(1), e(2)] }, db);
    await appendDiag({ runId: 'b', seq: 1, startedAt: 5, entries: [e(9)] }, db);
    await appendDiag({ runId: 'a', seq: 3, startedAt: 1, entries: [] }, db);
    expect((await readDiag('a', db)).map((x) => x[0])).toEqual([1, 2, 3, 4]);
    expect(await hasDiag('b', db)).toBe(true);
    await deleteDiag('b', db);
    expect(await hasDiag('b', db)).toBe(false);
    expect(await readDiag('none', db)).toEqual([]);
  });

  it('only the newest runs keep their log', async () => {
    const db = fresh();
    for (let i = 0; i < 7; i++) await appendDiag({ runId: `r${i}`, seq: 1, startedAt: i * 1000, entries: [e(i)] }, db);
    await pruneDiag(5, db);
    const left = new Set((await db.chunks.toArray()).map((c) => c.runId));
    expect([...left].sort()).toEqual(['r2', 'r3', 'r4', 'r5', 'r6']);
  });

  it('the main database is untouched: same schema version, no diagnostics table, not in a backup', async () => {
    const name = `main-${n++}`;
    names.push(name);
    const main = new AnyGymDB(name);
    await main.open();
    expect(main.verno).toBe(SCHEMA_VERSION);
    expect(main.tables.map((t) => t.name)).not.toContain('chunks');
    expect(TABLE_NAMES as readonly string[]).not.toContain('chunks');
    main.close();
  });
});
