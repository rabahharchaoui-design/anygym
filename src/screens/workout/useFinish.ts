import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { WorkoutSet } from '../../db/types';
import { UnresolvedDeletesError, UnsavedWritesError, finishWorkout } from '../../db/workouts';
import { changeCount, dropMutations, pendingMutations, retryMutations } from '../../db/mutations';
import { useTapGuard } from '../../hooks/useTapGuard';
import { UndoUnresolvedError, type DeleteUndo } from '../../lib/deleteUndo';
import { clearSessionDrafts } from '../../lib/drafts';
import { clearExtraSets } from '../../lib/extraSets';
import { snapshotPending } from '../../lib/finishPending';
import { logQueue } from '../../lib/logQueue';
import type { Rest } from '../../lib/rest';
import type { ToastMessage } from '../../ui/Toast';
import type { useNav } from '../../ui/nav';
import { disposeDeletes, ownedDeletes, recoverSession, recoveryReady } from './sessionRecovery';
import { discardFailed, failedRows, prepareFinish, retryFailed, shownRows, type ShownRow } from './rowLog';
import type { Workout } from './useWorkout';
import { toastOf } from './workoutToast';

export type Unsaved = { rows: number; edits: number; editIds: string[]; rowIds: ShownRow[] };

type Deps = {
  w: Workout;
  sessionId: string;
  go: ReturnType<typeof useNav>;
  finishing: MutableRefObject<boolean>;
  deletes: DeleteUndo<WorkoutSet>;
  setRest: (r: Rest | null) => void;
  setToast: Dispatch<SetStateAction<ToastMessage | null>>;
  notice: (text: string, retry?: () => void) => void;
  unhide: (id: string) => void;
};

/** Finish: the counts and checks, and the two sheets that stop it (sets that did not save, an Undo that did not finish). */
export function useFinish({ w, sessionId, go, finishing, deletes, setRest, setToast, notice, unhide }: Deps) {
  /**
   * Sets whose Log set write failed (PLAN 1.7h) and edits or set type changes whose write failed
   * (PLAN 2.0c), when Finish was refused because of them.
   */
  const [unsaved, setUnsaved] = useState<Unsaved | null>(null);
  /** Deleted sets whose Undo failed, when Finish was refused because of them (PLAN 1.7i). */
  const [undoStuck, setUndoStuck] = useState<string[] | null>(null);

  const finishNow = async () => {
    if (finishing.current) return;
    // Nothing is counted while a required read failed or is still loading (PLAN 1.7h).
    if (!w.ready) {
      notice(w.error ? 'Could not load this workout. Try again.' : 'Still loading. Try again in a moment.');
      return;
    }
    finishing.current = true;
    // From this moment no new Log set starts (synchronous), so nothing lands after the count.
    logQueue.close(sessionId);
    const reopen = () => {
      finishing.current = false;
      logQueue.reopen(sessionId);
      deletes.reopen();
    };
    try {
      // The workout's recovery has run (PLAN 1.7k): an Undo asked for before a restart is back in
      // the manager as unresolved, so close() below sees it. A recovery that fails refuses Finish.
      await recoveryReady(sessionId);
      // No new delete or Undo from here; every write still running lands before the sets are counted.
      await deletes.close();
      // A set whose write failed is never dropped: Finish stops and asks (the drafts and the workout stay).
      const failed = await prepareFinish(sessionId);
      // An edit or set type change that failed is never dropped silently either (PLAN 2.0c), also
      // one whose journal write failed (held in memory, PLAN 2.0e).
      const changes = await pendingMutations(sessionId);
      if (failed.length || changes.length) {
        reopen();
        setUnsaved({ rows: failed.length, edits: changeCount(changes), editIds: changes.map((c) => c.id), rowIds: shownRows(failed) });
        return;
      }
      // Finish keeps the plan pointer as it was, inside its own transaction, for Undo on Today.
      // The pending and added rows are kept with it for Undo on Today (PLAN 2.0c).
      const result = await finishWorkout(sessionId, undefined, undefined, snapshotPending(sessionId), ownedDeletes(sessionId));
      disposeDeletes(sessionId);
      setRest(null);
      clearSessionDrafts(sessionId);
      clearExtraSets();
      if (result.saved) go(`/workout/${sessionId}/done`, { kind: 'push', replace: true, flat: true });
      else
        go('/', {
          kind: 'pop',
          replace: true,
          state: { toast: 'Nothing logged · Workout discarded' },
        });
    } catch (err) {
      reopen();
      // An Undo the user asked for never landed: Finish waits until it does or they cancel it.
      if (err instanceof UndoUnresolvedError) setUndoStuck(err.ids);
      else if (err instanceof UnresolvedDeletesError) {
        // A deletion this app run does not know (another tab's): brought in as unresolved, so the
        // same Restore or Keep deleted choice applies and Finish never discards it (PLAN 2.0f).
        await recoverSession(sessionId).catch(() => undefined);
        setUndoStuck(err.ids);
      } else if (err instanceof UnsavedWritesError) {
        // Journaled after the checks above (another tab, PLAN 2.0e): Finish refused in its own
        // transaction, nothing changed. The same choice as above.
        const rows = await failedRows(sessionId).catch(() => []);
        const changes = await pendingMutations(sessionId).catch(() => []);
        setUnsaved({ rows: rows.length, edits: changeCount(changes), editIds: changes.map((c) => c.id), rowIds: shownRows(rows) });
      } else notice('Could not finish. Try again.');
    }
  };
  const finish = useTapGuard(() => void finishNow());

  /** The Undo sheet: Try again puts the sets back (then finishes), or keep them deleted. */
  const retryUndos = async () => {
    const ids = undoStuck ?? [];
    setUndoStuck(null);
    const back = await Promise.all(
      ids.map((id) =>
        deletes.undo(id).then(
          (item) => {
            if (item) unhide(id);
            return true;
          },
          () => false,
        ),
      ),
    );
    if (back.every(Boolean)) await finishNow();
    else notice('Could not bring that set back. Try again.');
  };
  const keepDeleted = async () => {
    const ids = undoStuck ?? [];
    setUndoStuck(null);
    // Finish only once every cancellation is stored, else it would put those sets back (PLAN 1.7i).
    const done = await Promise.all(ids.map((id) => deletes.cancel(id).then(() => true, () => false)));
    if (done.every(Boolean)) await finishNow();
    else setToast(toastOf('Could not keep that set deleted', { label: 'Try again', onPress: () => void finishNow() }));
  };

  /** The unsaved sets sheet: Try again writes them (then finishes), or finish without them. */
  const unsavedBusy = useRef(false);
  const retryUnsaved = async () => {
    if (unsavedBusy.current) return;
    unsavedBusy.current = true;
    setUnsaved(null);
    try {
      const rows = await retryFailed(sessionId);
      const edits = await retryMutations(sessionId);
      if (rows && edits) await finishNow();
      else notice(rows ? 'Could not save that change. Try again.' : 'Could not save that set. Try again.');
    } finally {
      unsavedBusy.current = false;
    }
  };
  const finishWithout = async () => {
    if (unsavedBusy.current) return;
    unsavedBusy.current = true;
    // Only the changes the sheet told about (PLAN 2.0e): one made after that still asks.
    // And only the failed Logs it listed, at the revision listed (PLAN 2.0k): a later one still asks.
    const shown = unsaved?.editIds ?? [];
    const rowsShown = unsaved?.rowIds ?? [];
    setUnsaved(null);
    try {
      await discardFailed(sessionId, undefined, rowsShown);
      await dropMutations(sessionId, undefined, shown);
      await finishNow();
    } catch {
      notice('Could not finish. Try again.');
    } finally {
      unsavedBusy.current = false;
    }
  };
  return { finish, unsaved, setUnsaved, undoStuck, setUndoStuck, retryUndos, keepDeleted, retryUnsaved, finishWithout };
}
