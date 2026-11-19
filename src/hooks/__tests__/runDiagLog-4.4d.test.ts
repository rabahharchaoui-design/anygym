// PLAN 4.4d (2): the recorder keeps every position with its fate, the countdown's too, writes them
// in chunks, stops at the cap and forgets a discarded run.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { runDiagLog } from '../runDiagLog';
import { readDiag } from '../../db/runDiag';
import { DIAG_FATES } from '../../lib/run/diag';

const fix = (lat: number) => ({ lat, lng: -74, accuracy: 30, speed: null, stamp: null });
const settle = () => new Promise((r) => setTimeout(r, 30));

describe('4.4d diagnostics recorder', () => {
  it('logs the countdown, every fix with its fate and still flag, and errors, in order', async () => {
    runDiagLog.early(900, fix(40));
    runDiagLog.begin('run-a', 1000, true);
    runDiagLog.fix(2000, fix(40.0001), 'rejected:accuracy', false);
    runDiagLog.flush();
    runDiagLog.note(2500, 'error:unavailable');
    runDiagLog.fix(3000, fix(40.0002), 'held:still', true);
    runDiagLog.flush(true);
    runDiagLog.fix(4000, fix(40.0003), 'kept', false); // after the end: not logged
    runDiagLog.flush();
    await settle();
    const log = await readDiag('run-a');
    expect(log.map((e) => [e[0], DIAG_FATES[e[6]], e[7]])).toEqual([
      [-100, 'before-run', 0],
      [1000, 'rejected:accuracy', 0],
      [1500, 'error:unavailable', 0],
      [2000, 'held:still', 1],
    ]);
  });

  it('a discarded run loses its log', async () => {
    runDiagLog.begin('run-b', 0, true);
    runDiagLog.fix(10, fix(40), 'kept', false);
    runDiagLog.flush();
    await settle();
    runDiagLog.discard('run-b');
    await settle();
    expect(await readDiag('run-b')).toEqual([]);
  });
});
