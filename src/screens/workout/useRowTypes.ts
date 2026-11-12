import { useRef, useState } from 'react';
import type { WorkoutSet } from '../../db/types';
import { newId } from '../../db/ids';
import { saveMutation } from '../../db/mutations';
import { addExtraSet, removeExtraSet } from '../../lib/extraSets';
import { logQueue } from '../../lib/logQueue';
import { dropSlot, insertSlot, isAutoWarmUp, materializeFrom, slotChanges, storedType, typeOfSet, type PendingRow, type SetType } from '../../lib/setTable';
import { writeDrafts } from '../../lib/drafts';
import { removeRowAnimated, rowReturning } from './SwipeRow';
import { rowsOf } from './rowLog';
import type { ExerciseRows } from './useExerciseRows';
import type { useRowEditors } from './useRowEditors';

type Deps = {
  rx: ExerciseRows;
  ed: ReturnType<typeof useRowEditors>;
  onNotice: (text: string, retry?: () => void) => void;
  onRemoveSet: (set: WorkoutSet) => void;
  onUndoable: (text: string, undo: () => void) => void;
};

/** The "Set type" sheet and removing a row: a row still to do (with Undo) or a logged set. */
export function useRowTypes({ rx, ed, onNotice, onRemoveSet, onUndoable }: Deps) {
  const { w, sessionId, exerciseId, key, rows, slotOf, writeRow, refresh, idOf, rowById } = rx;
  const { editing, setEditing, picking, setPicking, gone } = ed;
  /** The "Set type" sheet: a row still to do, or a logged set. */
  const [typing, setTyping] = useState<{ n: number; type: SetType; rowId?: string; set?: WorkoutSet } | null>(null);

  // Finish started (synchronously closed): no type changes from here, also from a stale view (1.7j).
  const setRowType = (row: PendingRow, t: SetType) => {
    if (logQueue.closed(sessionId)) return;
    // A warm up drops the prefilled working target (only a weight or reps set by hand stay);
    // any other type shows the target again (SPEC 21.1: warm ups never count toward progress).
    writeRow(row, { type: t, noTarget: t === 'warmup' ? true : undefined });
  };
  const setLoggedType = async (set: WorkoutSet, t: SetType) => {
    if (t === typeOfSet(set)) return;
    const s = storedType(t);
    // Tracked by the queue, so Finish counts the sets only after a change already running lands.
    // Journaled with its values before the write (PLAN 2.0c), like an Edit set save.
    const write = logQueue.mutate(sessionId, () => saveMutation(sessionId, set.exerciseId, { kind: 'type', setId: set.id, setKind: s.kind, failure: s.failure }));
    if (!write) return;
    try {
      await write;
    } catch {
      if (!logQueue.closed(sessionId)) onNotice('Could not change that set. Try again.');
    }
  };
  const pickType = (t: SetType) => {
    const target = typing;
    setTyping(null);
    if (!target) return;
    if (target.set) void setLoggedType(target.set, t);
    else if (target.rowId) {
      // The row with that identity as it is now (rows may have moved while the sheet was open).
      const row = rowById(target.rowId);
      if (row) setRowType(row, t);
      else gone();
    }
  };

  /**
   * PLAN 2.2d "Remove set" on a row still to do: its draft goes (nothing was logged, no history is
   * touched) and the exercise has one row fewer, with Undo. A row whose Log set write is running
   * is never removed.
   */
  /**
   * PLAN 2.0l (Codex 1811 #7): the row with draft id `id` is removed wherever it is now, never the
   * row that moved into its old place; nothing when it was logged or went meanwhile.
   */
  const removeById = (id: string) => {
    const before = rowsOf(sessionId, exerciseId);
    const at = before.findIndex((d) => d?.id === id);
    const row = at < 0 ? undefined : rows.find((r) => slotOf(r) === at);
    if (!row) {
      setTyping(null);
      return;
    }
    removeRow(row);
  };
  /** A row's identity at the moment its delete starts: its draft id (made now when it has none). */
  const claimRow = (row: PendingRow): string | null => {
    if (logQueue.closed(sessionId)) return null;
    return idOf(row);
  };
  const removeRow = (row: PendingRow) => {
    setTyping(null);
    if (logQueue.closed(sessionId)) return;
    if (logQueue.pending(key)) return onNotice('That set is still saving. Try again in a moment.');
    const at = slotOf(row);
    const before = rowsOf(sessionId, exerciseId);
    if (before[at]?.submitted !== undefined) return onNotice('That set is still saving. Try again in a moment.');
    // The rows below keep what they show (their own targets), then the slot goes (Codex 2.2d #2).
    const shown = materializeFrom(before, rows, at, slotOf, newId);
    const draft = shown[at] ?? null;
    // A coach warm up is a row of its own: skipping it never takes a planned set away (PLAN 3.8).
    const ownRow = isAutoWarmUp(draft);
    writeDrafts(sessionId, slotChanges(exerciseId, before, dropSlot(shown, at)));
    if (!ownRow) removeExtraSet(sessionId, exerciseId);
    if (draft && (editing === draft.id || picking?.id === draft.id)) {
      setEditing(null);
      setPicking(null);
    }
    w.bump();
    refresh();
    onUndoable('Set removed', () => {
      if (logQueue.closed(sessionId)) return;
      const now = rowsOf(sessionId, exerciseId);
      if (draft) rowReturning(draft.id);
      writeDrafts(sessionId, slotChanges(exerciseId, now, insertSlot(now, at, draft)));
      if (!ownRow) addExtraSet(sessionId, exerciseId);
      w.bump();
    });
  };
  // Every render's removeById, for a removal that started in an earlier render (PLAN 2.0l).
  const latestRemove = useRef(removeById);
  latestRemove.current = removeById;
  const removeLogged = (set: WorkoutSet) => {
    setTyping(null);
    if (logQueue.closed(sessionId)) return;
    onRemoveSet(set);
  };

  /** The sheet's Remove set. */
  const removeFromSheet = () => {
    const target = typing;
    if (!target) return;
    // The sheet closes while the row slides out and closes up, like a swipe (critic B3).
    if (target.set) {
      const set = target.set;
      setTyping(null);
      return removeRowAnimated(set.id, () => removeLogged(set));
    }
    const row = target.rowId ? rowById(target.rowId) : undefined;
    if (row) {
      setTyping(null);
      // By its id when the slide ends, with the view as it is then (PLAN 2.0l).
      removeRowAnimated(target.rowId!, () => latestRemove.current(target.rowId!));
    }
    else {
      setTyping(null);
      gone();
    }
  };

  return { typing, setTyping, pickType, claimRow, removeRow, latestRemove, removeLogged, removeFromSheet };
}
