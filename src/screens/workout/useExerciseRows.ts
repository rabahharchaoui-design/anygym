import { useEffect, useRef, useState } from 'react';
import type { Load } from '../../db/types';
import { loadDraft, saveDraft, type Draft } from '../../lib/drafts';
import { logKey, logQueue } from '../../lib/logQueue';
import { newId } from '../../db/ids';
import { targetSecondsOf } from '../../lib/planWorkout';
import { blockedReason, isAutoWarmUp, pendingRows, rowDraft, rowKey, type PendingRow } from '../../lib/setTable';
import { STOPPED, elapsedMs, wholeSeconds, type Stopwatch } from '../../lib/timer';
import { bodyweightLoad, timedLoad } from '../../lib/load';
import { useNow } from '../../hooks/useNow';
import { START_LIGHT } from '../../lib/coach';
import { currentLoad, pickProblem, prefillLoad } from './exerciseLoad';
import type { Workout } from './useWorkout';
import { adoptJournal, migrateLegacyRows, reconcileExercise, rowsOf } from './rowLog';
import { groupNextOf } from './groupNext';
import { seedWarmUps } from './coachWarmUps';

const DEFAULT_REPS = 10;

/** A load that is certain without asking anything: just you, or a hold (SPEC 0: no fake numbers). */
function certainLoad(kind: Load['kind'], unit: Load['unit']): Load | null {
  if (kind === 'bodyweight') return bodyweightLoad(unit);
  if (kind === 'timed') return timedLoad(unit);
  return null;
}

/** The rows of one exercise (logged sets and the ones still to do) with their stored drafts, and the ways to change a draft. */
export function useExerciseRows(w: Workout, sessionId: string, exerciseId: string) {
  const gym = w.gym!;
  const name = w.nameOf(exerciseId);
  const entry = w.entryOf(exerciseId);
  // 3.5b round 4 (M7, M8): in a Quick pair or circuit, once this round's set is done here the next
  // member is the one thing to do: one button under the table (never a pill over a row), no row lit.
  const groupNext = groupNextOf(w.entries, w.done, exerciseId);
  const kind = w.loadTypeOf(exerciseId);
  const bar = w.barOf(exerciseId);
  const progression = w.progressionOf(exerciseId);
  const logged = w.setsOfExercise(exerciseId);
  const timed = kind === 'timed';
  const key = logKey(sessionId, exerciseId);
  const [, setVer] = useState(0);
  const refresh = () => setVer((v) => v + 1);
  /** Rows checked while this view is open: draft (and set) id → when the ✓ was tapped (performance.now). */
  const [fresh, setFresh] = useState<ReadonlyMap<string, number>>(new Map());

  useEffect(() => logQueue.subscribe(key, refresh), [key]);

  // Drafts from before 1.7h move to their pending row slot, once (rowLog.ts).
  const migrated = useRef(false);
  if (!migrated.current) {
    migrated.current = true;
    migrateLegacyRows(sessionId, exerciseId, logged);
  }
  // A write that started and never committed (the IndexedDB journal) is a failed row again, even
  // when localStorage lost it (PLAN 1.7i). Then rows whose write committed are used up before any
  // pending row is shown (also after a kill between the commit and the cleanup), so a logged row
  // can never be logged a second time.
  adoptJournal(sessionId, w.journal, w.committed, {}, exerciseId);
  reconcileExercise(sessionId, exerciseId, w.committed);
  // PLAN 3.8 (SPEC 15): the coach's warm ups on the first big lift of the day, added once, before
  // anything of it was logged or changed (written before the rows are read: no flash, no shift).
  if (kind && progression && !logQueue.closed(sessionId)) {
    const setup = w.setupOf(exerciseId);
    if (setup) seedWarmUps(sessionId, exerciseId, kind, w.warmUpsOf(exerciseId), setup, logged.length === 0 && rowsOf(sessionId, exerciseId).length === 0);
  }
  const slots = rowsOf(sessionId, exerciseId);
  /** Coach warm ups still to do: rows of their own, beyond the planned sets. */
  const autoPending = slots.filter(isAutoWarmUp).length;
  /** A pending row's draft as stored right now, by slot (0 = the first row still to do). */
  const draftAt = (slot: number) => loadDraft(sessionId, rowKey(exerciseId, slot));
  const slotOf = (row: PendingRow) => row.index - logged.length;
  const rebuild = (picked: Load | null, plates: readonly number[], pickKind?: Load['kind']) => (kind ? currentLoad(picked, plates, kind, gym, exerciseId, name, bar, undefined, pickKind) : null);
  // Planned rows left: a warm up logged on a normal lift never uses one up (PLAN 1.7j).
  const workDone = w.done[exerciseId] ?? 0;
  const rows: PendingRow[] = kind
    ? pendingRows({
        // Every drafted row stays visible (a newer edit kept after a delayed write adds a row).
        count: logged.length + Math.max((entry?.sets ?? 3) - workDone + autoPending, slots.length),
        logged,
        workLogged: workDone,
        progression,
        draftOf: (i) => slots[i - logged.length] ?? null,
        rebuild,
        carry: (prev) => prefillLoad(prev, kind, gym, exerciseId, name, bar),
        certain: certainLoad(kind, gym.unit),
        unit: gym.unit,
        // A draft picked in the other unit or with a plate now turned off stays as picked (PLAN 1.7i).
        stale: (d) => pickProblem(d.load, d.plates ?? d.load?.perSide ?? [], d.unit, kind, gym),
        defaultReps: timed ? undefined : entry?.reps === undefined ? DEFAULT_REPS : typeof entry.reps === 'number' ? entry.reps : entry.reps[0],
        planSeconds: entry ? targetSecondsOf(entry) : undefined,
        defaultType: entry?.warmup ? 'warmup' : 'normal',
        lastSets: w.lastSetsOf(exerciseId),
      })
    : [];
  const current = rows[0];
  // PLAN 2.2d: a ✓ shows checked the moment it is tapped, while its write runs (the row is claimed
  // and its submission stored, logQueue); the logged row carries the same animation on when it lands.
  const writing = logQueue.pending(key);
  const sending = new Map<number, number>();
  if (writing) for (const r of rows) {
    const id = slots[r.index - logged.length]?.id;
    const at = id ? fresh.get(id) : undefined;
    if (at !== undefined) sending.set(r.index, at);
  }

  // Timed: the running hold belongs to the current row's draft, so it survives a reload.
  const watch: Stopwatch = (current && draftAt(slotOf(current))?.watch) ?? STOPPED;
  const running = watch.startedAt !== null;
  const now = useNow(250, timed && running);
  const liveSeconds = wholeSeconds(elapsedMs(watch, running ? Math.max(now, Date.now()) : now));

  /** Every change is saved at once (SPEC 13.3), with a new version for the log queue. */
  const writeRow = (row: PendingRow, patch: Partial<Draft>, own?: Draft['own']) => {
    const before = draftAt(slotOf(row));
    const draft: Draft = {
      // A row still showing its target (or "Pick") starts from its values as shown; an empty weight
      // stays empty (PLAN 2.0e: changing reps or the type never picks the bare bar).
      ...(before ?? rowDraft(row, newId())),
      ...patch,
      // The unit the weight was picked in (PLAN 1.7i): the pick's own unit when it says (PLAN
      // 2.0c), else today's when this write picks it.
      ...('load' in patch || 'plates' in patch || !before ? { unit: patch.unit ?? gym.unit } : {}),
      // And the "Loaded with" it was picked under (PLAN 2.0k): never rebuilt under another one.
      ...(('load' in patch || 'plates' in patch || !before) && kind ? { pickKind: kind } : {}),
      rev: (before?.rev ?? 0) + 1,
    };
    if (own) draft.own = { ...draft.own, ...own };
    if (draft.noTarget === undefined) delete draft.noTarget;
    saveDraft(sessionId, rowKey(exerciseId, slotOf(row)), draft);
    refresh();
  };

  // A bar or plate machine whose base weight is not known yet: nothing can be loaded until it is answered.
  const baseUnknown = (kind === 'barbell' || kind === 'plate_machine') && rebuild(null, []) === null;
  /** The light test set of a first timer (SPEC 15): the first row, while nothing is logged yet. */
  const testSet = (row: PendingRow) => progression?.next.reason === START_LIGHT && logged.length === 0 && row.index === 0;
  const blockedOf = (row: PendingRow) => (kind ? blockedReason(kind, row, row.index === current?.index ? liveSeconds : 0, baseUnknown) : 'Pick a weight');

  /**
   * The row's stable identity (PLAN 1.7k): its draft id, given to a row still showing its target
   * when an editor opens on it (its values as shown, nothing marked as picked by hand).
   */
  const idOf = (row: PendingRow): string => {
    const have = draftAt(slotOf(row));
    if (have) return have.id;
    const draft = rowDraft(row, newId());
    saveDraft(sessionId, rowKey(exerciseId, slotOf(row)), draft);
    return draft.id;
  };
  /** The row with this draft id as it is now, or undefined when it was logged or went meanwhile. */
  const rowById = (id: string): PendingRow | undefined => {
    const at = rowsOf(sessionId, exerciseId).findIndex((d) => d?.id === id);
    return at < 0 ? undefined : rows.find((r) => slotOf(r) === at);
  };

  return { w, sessionId, exerciseId, gym, name, entry, groupNext, kind, bar, progression, logged, timed, key, refresh, fresh, setFresh, slots, draftAt, slotOf, workDone, rows, current, sending, watch, running, liveSeconds, writeRow, blockedOf, testSet, idOf, rowById };
}

export type ExerciseRows = ReturnType<typeof useExerciseRows>;
