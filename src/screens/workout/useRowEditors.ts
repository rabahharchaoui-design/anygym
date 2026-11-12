import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { saveDraft, type Draft } from '../../lib/drafts';
import { logQueue } from '../../lib/logQueue';
import { rowKey, type PendingRow } from '../../lib/setTable';
import { heldFor } from '../../lib/timer';
import { tick } from '../../ui/haptics';
import type { WeightPick } from './WeightSheet';
import { confirmablePick, copyLastLoad } from './exerciseLoad';
import { rowsOf } from './rowLog';
import type { ExerciseRows } from './useExerciseRows';

type Deps = {
  rx: ExerciseRows;
  onNotice: (text: string, retry?: () => void) => void;
};

/** The open editors of a row still to do: the weight sheet, the reps (or hold) editor, and the nudge on a ✓ that cannot log yet. */
export function useRowEditors({ rx, onNotice }: Deps) {
  const { sessionId, exerciseId, gym, name, kind, bar, timed, rows, draftAt, writeRow, refresh, idOf, rowById, testSet, blockedOf } = rx;
  /**
   * The weight sheet's row, by its stable draft id (PLAN 1.7k), never by its displayed position: a
   * row that commits while the sheet is open moves the rows below it, and the change must still land
   * on the row the sheet was opened for. `row` is that row as it was when the sheet opened.
   */
  const [picking, setPicking] = useState<{ id: string; row: PendingRow; why?: string } | null>(null);
  /**
   * The open reps (or hold) editor's row, by its stable draft id (PLAN 2.0e), like the weight sheet:
   * a delayed Log that moves the rows never hands the editor to another row. It closes when its
   * draft commits or goes.
   */
  const [editing, setEditing] = useState<string | null>(null);
  /** A tap on a ✓ that cannot log yet: the row, its why, and a count that restarts the pulse. */
  const [nudge, setNudge] = useState<{ index: number; text: string; n: number } | null>(null);
  const nudgeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);

  const gone = () => onNotice('That set was already logged. Nothing changed.');

  // The reps editor's row where it is now (PLAN 2.0e): found by its draft id at every render.
  const editRow = editing ? rowById(editing) : undefined;
  // Its draft committed (or went): the editor closes, and nothing it sends changes another row.
  useLayoutEffect(() => {
    if (editing && !editRow) setEditing(null);
  }, [editing, editRow]);
  /**
   * A reps or hold change from the editor opened on draft `id`: written to that draft as it is
   * stored right now, wherever its row moved meanwhile. A held + or − keeps the id it started
   * with, so a repeat can never move to another row. Nothing once Finish started or the draft went.
   */
  const changeAmount = (id: string, v: number) => {
    if (logQueue.closed(sessionId)) return;
    const at = rowsOf(sessionId, exerciseId).findIndex((d) => d?.id === id);
    const before = at >= 0 ? draftAt(at) : null;
    if (!before) return setEditing((e) => (e === id ? null : e));
    const draft: Draft = {
      ...before,
      ...(timed ? { seconds: v, watch: heldFor(v) } : { reps: v }),
      rev: (before.rev ?? 0) + 1,
    };
    if (!timed) {
      draft.own = { ...before.own, reps: true };
      draft.repsEdited = true;
    }
    saveDraft(sessionId, rowKey(exerciseId, at), draft);
    refresh();
  };
  // Every render's changeAmount, for a stepper whose repeat started in an earlier render.
  const latest = useRef(changeAmount);
  latest.current = changeAmount;
  const toggleEditor = (r: PendingRow) => {
    if (logQueue.closed(sessionId)) return;
    const id = idOf(r);
    setEditing((e) => (e === id ? null : id));
  };

  const applyWeight = (id: string, pick: WeightPick) => {
    setPicking(null);
    const from = rowById(id);
    if (!from) return gone();
    // Checked again against the gym as it is now (PLAN 2.0c): a pick from another unit, or one this
    // gym cannot load any more, changes no row.
    const ok = kind ? confirmablePick(pick, kind, gym, exerciseId, name, bar) : null;
    if (!ok) return onNotice(pick.unit !== gym.unit ? `Units changed to ${gym.unit}. Pick the weight again.` : 'That weight cannot be loaded here now. Pick it again.');
    // A warm up's weight is for that warm up only; a working row's weight goes to it and the
    // working rows below it, never into a warm up (SPEC 20.2, gate 3).
    // A first timer's light test set (PLAN 3.8, SPEC 15) is for that set only: the rows below get the
    // number the coach sets from it.
    const targets = from.type === 'warmup' || testSet(from) ? [from] : rows.filter((r) => r.index >= from.index && r.type !== 'warmup');
    for (const r of targets) writeRow(r, { load: ok.load, plates: ok.plates, unit: ok.unit }, { load: true });
  };

  const copyLast = (row: PendingRow) => {
    const last = row.lastTime;
    if (!last || !kind) return;
    // The stored total on today's bar, collars and plates, or a plain reason (never another total, 1.7j).
    const copy = copyLastLoad(last.load, kind, gym, exerciseId, name, bar);
    const load = copy.load;
    if (!copy.load) onNotice(copy.why);
    const lastKind = 'kind' in last ? last.kind : 'work';
    writeRow(row, {
      ...(lastKind === 'warmup' || lastKind === 'drop' ? { type: lastKind } : {}),
      ...(load ? { load, plates: load.perSide ?? [] } : {}),
      ...(last.reps !== undefined ? { reps: last.reps } : {}),
      // A copied hold replaces the row's stopwatch, so the cell and Log agree (PLAN 1.7h).
      ...(last.seconds !== undefined ? { seconds: last.seconds, ...(kind === 'timed' ? { watch: heldFor(last.seconds) } : {}) } : {}),
    }, { ...(load ? { load: true as const } : {}), ...(last.reps !== undefined ? { reps: true as const } : {}) });
  };

  const onBlocked = (r: PendingRow) => {
    const why = blockedOf(r);
    if (!why || logQueue.closed(sessionId)) return;
    tick();
    // No weight yet (or a pick to redo, or a bar or start weight to set): straight to the picker for
    // that row, saying why. It never logs without a weight (SPEC 0).
    if (kind && kind !== 'timed' && (r.load === null || r.kept)) {
      setPicking({ id: idOf(r), row: r, why: why === 'Pick a weight' ? 'Pick a weight first' : why });
      return;
    }
    window.clearTimeout(nudgeTimer.current);
    setNudge((n) => ({ index: r.index, text: why, n: (n?.n ?? 0) + 1 }));
    nudgeTimer.current = window.setTimeout(() => setNudge(null), 1700);
  };

  return { picking, setPicking, editing, setEditing, nudge, editRow, latest, toggleEditor, applyWeight, copyLast, onBlocked, gone };
}
