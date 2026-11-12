import { useEffect, useLayoutEffect } from 'react';
import type { SetKind } from '../../db/types';
import { newId } from '../../db/ids';
import { idleAfterPaint } from '../../ui/afterPaint';
import { saveDraft, writeDrafts, type Draft } from '../../lib/drafts';
import { logQueue } from '../../lib/logQueue';
import { markSubmitted, rowKey, slotChanges, storedType, type PendingRow } from '../../lib/setTable';
import { captureHold, elapsedMs, startWatch, stopWatch } from '../../lib/timer';
import { unlockAudio } from '../../lib/tone';
import { useTapGuard } from '../../hooks/useTapGuard';
import { tick } from '../../ui/haptics';
import { rowsOf, submitRow } from './rowLog';
import type { ExerciseRows } from './useExerciseRows';

type Deps = {
  rx: ExerciseRows;
  onLogged: (exerciseId: string, kind: SetKind) => void;
  onNotice: (text: string, retry?: () => void) => void;
};

/** Logging a row (one tap on its ✓), retrying a failed one, and the hold timer that checks itself at its target. */
export function useLogRow({ rx, onLogged, onNotice }: Deps) {
  const { w, sessionId, exerciseId, gym, kind, timed, key, setFresh, draftAt, slotOf, rows, current, watch, running, liveSeconds, writeRow, refresh } = rx;

  // A double tap on one ✓ logs one set; checking the next row right after is fine (SPEC 13.3).
  // Race proof, never time based (PLAN 1.12): the row is claimed synchronously with its one
  // submission (logQueue.claim), so a second tap in the same task, during the write, or on a stale
  // render after the write landed resolves to that same submission.
  // Claims are released by the identity the view shows as committed, never by row position (1.7j).
  useLayoutEffect(() => logQueue.release(key, (id) => w.committed.has(id)), [key, w.committed]);
  const log = (row: PendingRow, cap?: number): Promise<boolean> | undefined => {
    // Finish started (synchronous), a write of this exercise is running, or one landed that this
    // render does not show yet (a stale row could be the one just logged).
    if (!kind || logQueue.pending(key) || logQueue.stale(key) || logQueue.closed(sessionId)) return;
    const heldId = draftAt(slotOf(row))?.id;
    if (heldId && logQueue.claimed(key, heldId)) return;
    unlockAudio();
    let seconds = row.seconds;
    if (timed && row.index === current?.index && elapsedMs(watch, Date.now()) > 0) {
      // A running hold is stopped and read at this very moment, never a stale value (1.10c).
      const captured = captureHold(watch, Date.now());
      // An automatic check at the target logs the target, never a tick more.
      seconds = cap !== undefined ? Math.min(cap, captured.seconds) : captured.seconds;
      writeRow(row, { watch: captured.watch, seconds });
    }
    if (row.load === null || (timed ? !seconds : !row.reps)) return;
    // Stored before the write (PLAN 1.7h): the row's id, values and version with its submitted
    // mark, and what the rows above show, so a kill at any point loses and duplicates nothing.
    const before = rowsOf(sessionId, exerciseId);
    const marked = markSubmitted(before, rows, slotOf(row), { load: row.load, type: row.type, gymId: gym.id, ...(timed ? { seconds } : { reps: row.reps }) }, newId);
    writeDrafts(sessionId, slotChanges(exerciseId, before, marked.slots));
    const at = performance.now();
    setFresh((f) => new Map(f).set(marked.draft.id, at));
    tick();
    return logQueue.claim(key, marked.draft.id, () => submitAndTell(marked.draft));
  };

  /** Writes a submitted row; it lands even if this view closed meanwhile (rowLog.ts). */
  const submitAndTell = async (draft: Draft, now = false): Promise<boolean> => {
    // The row already shows checked (its submitted draft is stored): the IndexedDB write and the
    // record lookup it triggers start once the check's frame has painted (critic B1, round 3).
    if (!now) await idleAfterPaint();
    const ok = await submitRow(sessionId, exerciseId, draft, { onLanded: () => onLogged(exerciseId, storedType(draft.type ?? 'normal').kind) });
    if (!ok && !logQueue.closed(sessionId)) onNotice('Could not save that set', () => void retry(draft.id));
    refresh();
    return ok;
  };
  /** Try again on a failed set: the same row (same id), with its values as they are now. */
  const retry = async (id: string) => {
    const at = rowsOf(sessionId, exerciseId).findIndex((d) => d?.id === id);
    const now = at >= 0 ? draftAt(at) : null;
    if (!now || logQueue.pending(key) || logQueue.closed(sessionId)) return;
    const again: Draft = { ...now, submitted: now.rev ?? 0 };
    saveDraft(sessionId, rowKey(exerciseId, at), again);
    await submitAndTell(again, true);
  };

  const toggleWatch = useTapGuard(() => {
    if (!current) return;
    const t = Date.now();
    writeRow(current, {
      watch: running ? stopWatch(watch, t) : startWatch(watch, t),
    });
  });

  // The hold reached its target: it checks itself, logging exactly the target (with the tick).
  const holdTarget = timed ? current?.seconds : undefined;
  useEffect(() => {
    if (!timed || !running || !current || !holdTarget || liveSeconds < holdTarget) return;
    void log(current, holdTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, running, liveSeconds, holdTarget, current?.index]);

  return { log, toggleWatch };
}
