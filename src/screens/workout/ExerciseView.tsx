import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Load, WorkoutSet } from '../../db/types';
import { updateSetType } from '../../db/workouts';
import { loadDraft, saveDraft, writeDrafts, type Draft } from '../../lib/drafts';
import { logKey, logQueue } from '../../lib/logQueue';
import { newId } from '../../db/ids';
import { formatNext, formatSets, formatWhen } from '../../lib/progression';
import { setLine, targetSecondsOf } from '../../lib/planWorkout';
import { addExtraSet } from '../../lib/extraSets';
import { blockedReason, markSubmitted, nextSetType, pendingRows, rowKey, slotChanges, storedType, typeOfSet, type PendingRow, type SetType } from '../../lib/setTable';
import { STOPPED, captureHold, elapsedMs, heldFor, startWatch, stopWatch, wholeSeconds, type Stopwatch } from '../../lib/timer';
import { bodyweightLoad, timedLoad } from '../../lib/load';
import { unlockAudio } from '../../lib/tone';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { Hint } from '../../components/hint/Hint';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { MoreIcon } from '../../ui/icons';
import { tick } from '../../ui/haptics';
import { SetTable } from './SetTable';
import { Thumb } from './Thumb';
import { WeightSheet, type WeightPick } from './WeightSheet';
import { currentLoad, pickProblem, prefillLoad } from './exerciseLoad';
import type { Workout } from './useWorkout';
import { adoptJournal, migrateLegacyRows, reconcileExercise, rowsOf, submitRow } from './rowLog';
import styles from './Workout.module.css';

type Props = {
  w: Workout;
  sessionId: string;
  exerciseId: string;
  /** After a set landed: rest and what comes next (the screen decides). */
  onLogged: (exerciseId: string) => void;
  onEditSet: (set: WorkoutSet) => void;
  onAskLoadType: () => void;
  onMenu: () => void;
  onSwipeNext: () => void;
  onNotice: (text: string, retry?: () => void) => void;
};

const DEFAULT_REPS = 10;

/** A load that is certain without asking anything: just you, or a hold (SPEC 0: no fake numbers). */
function certainLoad(kind: Load['kind'], unit: Load['unit']): Load | null {
  if (kind === 'bodyweight') return bodyweightLoad(unit);
  if (kind === 'timed') return timedLoad(unit);
  return null;
}

/**
 * The exercise view (SPEC 20.2, 21.1): the demo tile, name and note, "Last time", and the set
 * table already filled with today's targets. Logging a set is one tap on its ✓.
 */
export function ExerciseView({ w, sessionId, exerciseId, onLogged, onEditSet, onAskLoadType, onMenu, onSwipeNext, onNotice }: Props) {
  const gym = w.gym!;
  const name = w.nameOf(exerciseId);
  const entry = w.entryOf(exerciseId);
  const kind = w.loadTypeOf(exerciseId);
  const bar = w.barOf(exerciseId);
  const progression = w.progressionOf(exerciseId);
  const logged = w.setsOfExercise(exerciseId);
  const timed = kind === 'timed';
  const key = logKey(sessionId, exerciseId);
  const [, setVer] = useState(0);
  const refresh = () => setVer((v) => v + 1);
  const [picking, setPicking] = useState<PendingRow | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [demo, setDemo] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

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
  const slots = rowsOf(sessionId, exerciseId);
  /** A pending row's draft as stored right now, by slot (0 = the first row still to do). */
  const draftAt = (slot: number) => loadDraft(sessionId, rowKey(exerciseId, slot));
  const slotOf = (row: PendingRow) => row.index - logged.length;
  const rebuild = (picked: Load | null, plates: readonly number[]) => (kind ? currentLoad(picked, plates, kind, gym, exerciseId, name, bar) : null);
  const rows: PendingRow[] = kind
    ? pendingRows({
        // Every drafted row stays visible (a newer edit kept after a delayed write adds a row).
        count: Math.max(entry?.sets ?? 3, logged.length + slots.length),
        logged,
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

  // Timed: the running hold belongs to the current row's draft, so it survives a reload.
  const watch: Stopwatch = (current && draftAt(slotOf(current))?.watch) ?? STOPPED;
  const running = watch.startedAt !== null;
  const now = useNow(250, timed && running);
  const liveSeconds = wholeSeconds(elapsedMs(watch, running ? Math.max(now, Date.now()) : now));

  /** Every change is saved at once (SPEC 13.3), with a new version for the log queue. */
  const writeRow = (row: PendingRow, patch: Partial<Draft>) => {
    const before = draftAt(slotOf(row));
    const draft: Draft = {
      id: before?.id ?? newId(),
      load: row.load,
      plates: row.plates,
      type: row.type,
      ...(row.reps !== undefined ? { reps: row.reps } : {}),
      ...(row.seconds !== undefined ? { seconds: row.seconds } : {}),
      ...(before ?? {}),
      ...patch,
      // The unit the weight was picked in (PLAN 1.7i): today's when this write picks it.
      ...('load' in patch || 'plates' in patch || !before ? { unit: gym.unit } : {}),
      rev: (before?.rev ?? 0) + 1,
    };
    saveDraft(sessionId, rowKey(exerciseId, slotOf(row)), draft);
    refresh();
  };

  // A bar or plate machine whose base weight is not known yet: nothing can be loaded until it is answered.
  const baseUnknown = (kind === 'barbell' || kind === 'plate_machine') && rebuild(null, []) === null;
  const blockedOf = (row: PendingRow) => (kind ? blockedReason(kind, row, row.index === current?.index ? liveSeconds : 0, baseUnknown) : 'Pick a weight');

  // A double tap on one ✓ logs one set; checking the next row right after is fine (SPEC 13.3).
  // Race proof, never time based (PLAN 1.12): the row is claimed synchronously with its one
  // submission (logQueue.claim), so a second tap in the same task, during the write, or on a stale
  // render after the write landed resolves to that same submission.
  useLayoutEffect(() => logQueue.release(key, logged.length), [key, logged.length]);
  const log = (row: PendingRow, cap?: number): Promise<boolean> | undefined => {
    // Finish started (synchronous), the row is claimed, or a write of this exercise is running.
    if (!kind || logQueue.claimed(key, row.index) || logQueue.pending(key) || logQueue.closed(sessionId)) return;
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
    const marked = markSubmitted(before, rows, slotOf(row), { load: row.load, type: row.type, ...(timed ? { seconds } : { reps: row.reps }) }, newId);
    writeDrafts(sessionId, slotChanges(exerciseId, before, marked.slots));
    setFresh((f) => new Set(f).add(marked.draft.id));
    tick();
    return logQueue.claim(key, row.index, () => submitAndTell(marked.draft));
  };

  /** Writes a submitted row; it lands even if this view closed meanwhile (rowLog.ts). */
  const submitAndTell = async (draft: Draft): Promise<boolean> => {
    const ok = await submitRow(sessionId, exerciseId, draft, { onLanded: () => onLogged(exerciseId) });
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
    await submitAndTell(again);
  };

  const applyWeight = (from: PendingRow, pick: WeightPick) => {
    setPicking(null);
    // That row and every row below it that is not logged yet (SPEC 20.2).
    for (const r of rows) if (r.index >= from.index) writeRow(r, { load: pick.load, plates: pick.plates });
  };

  const copyLast = (row: PendingRow) => {
    const last = row.lastTime;
    if (!last || !kind) return;
    const load = prefillLoad(last.load, kind, gym, exerciseId, name, bar);
    if (!load && kind !== 'timed') onNotice('That weight cannot be made here. Reps copied.');
    const lastKind = 'kind' in last ? last.kind : 'work';
    writeRow(row, {
      ...(lastKind === 'warmup' || lastKind === 'drop' ? { type: lastKind } : {}),
      ...(load ? { load, plates: load.perSide ?? [] } : {}),
      ...(last.reps !== undefined ? { reps: last.reps } : {}),
      // A copied hold replaces the row's stopwatch, so the cell and Log agree (PLAN 1.7h).
      ...(last.seconds !== undefined ? { seconds: last.seconds, ...(kind === 'timed' ? { watch: heldFor(last.seconds) } : {}) } : {}),
    });
  };

  const cycleType = (row: PendingRow) => writeRow(row, { type: nextSetType(row.type) });
  const cycleLogged = async (set: WorkoutSet) => {
    const t: SetType = nextSetType(typeOfSet(set));
    const s = storedType(t);
    try {
      await updateSetType(set.id, s.kind, s.failure);
    } catch {
      onNotice('Could not change that set. Try again.');
    }
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

  // Swipe left: straight to the next exercise (SPEC 20.2). Back from the left edge is the
  // interactive EdgeSwipe the workout screen puts over this view (SPEC 23.1).
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || picking || editing !== null) return;
    const dx = e.clientX - s.x;
    const dy = Math.abs(e.clientY - s.y);
    if (dy > 40) return;
    if (dx < -80) onSwipeNext();
  };

  const lastTime = progression?.lastTime;
  const target = formatNext(
    progression?.next ?? {
      load: null,
      reps: null,
      reason: '',
      kind: 'first_time',
    },
  );
  const showNext = progression && lastTime && (progression.next.kind === 'increase' || progression.next.kind === 'reset' || progression.next.kind === 'converted');
  const note = [entry?.note, w.noteOf(exerciseId)].filter(Boolean).join(' · ');
  const setNumber = Math.min(logged.length + 1, Math.max(entry?.sets ?? 1, logged.length + 1));
  const status = current ? blockedOf(current) : null;

  return (
    <main className={styles.exMain} data-testid={`exercise-${exerciseId}`} aria-label={name} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className={styles.hero}>
        <button type="button" className={`${styles.heroTile} pressable`} onClick={() => setDemo(true)} aria-label={`How to do ${name}`}>
          <Thumb name={name} loadType={kind} size="hero" vtName="ex-hero" />
        </button>
        <div className={styles.heroText}>
          <h2 className={styles.exName}>{name}</h2>
          <p className={`${styles.exTarget} num`} data-testid="set-target">
            {!kind
              ? (entry?.line ?? '')
              : rows.length === 0 && logged.length > 0
                ? `All ${logged.length} ${logged.length === 1 ? 'set' : 'sets'} done`
                : entry
                  ? setLine(entry, setNumber)
                  : `Set ${setNumber}`}
          </p>
          {note && (
            <p className={styles.exNote} data-testid="set-plan">
              {note}
            </p>
          )}
        </div>
        <button type="button" className={`${styles.moreButton} pressable`} onClick={onMenu} aria-label={`More for ${name}`}>
          <MoreIcon width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {kind && progression && (lastTime || showNext) && (
        <div className={styles.guides}>
          {lastTime && (
            <p className={`${styles.guide} num`} data-testid="set-guide">
              Last time {formatSets(lastTime.sets)} <span className={styles.guideWhen}>· {formatWhen(lastTime.date, Date.now())}</span>
            </p>
          )}
          {showNext && (
            <p className={`${styles.guide} ${styles.guideNext} num`} data-testid="set-next">
              {target ? `Next ${target} · ` : ''}
              {progression.next.reason}
            </p>
          )}
        </div>
      )}

      {!kind ? (
        <div className={styles.askBox}>
          <p className={styles.hint}>Tell AnyGym how this one is loaded, once.</p>
          <Button variant="secondary" onClick={onAskLoadType}>
            How do you load this?
          </Button>
        </div>
      ) : !progression ? (
        <div className={styles.tableSkeleton} aria-hidden="true" />
      ) : (
        <>
          <SetTable
            kind={kind}
            unit={gym.unit}
            logged={logged}
            lastTimeOf={(i) => w.lastSetsOf(exerciseId)?.[i]}
            rows={rows}
            blockedOf={blockedOf}
            liveSeconds={liveSeconds}
            fresh={fresh}
            editing={editing}
            onCheck={(r) => void log(r)}
            onWeight={(r) => setPicking(r)}
            onAmount={(r) => setEditing((e) => (e === r.index ? null : r.index))}
            // A typed hold replaces the row's stopwatch with a stopped one of that length (PLAN 1.7h).
            onAmountChange={(r, v) => writeRow(r, timed ? { seconds: v, watch: heldFor(v) } : { reps: v })}
            onAmountDone={() => setEditing(null)}
            onType={cycleType}
            onLoggedType={(s) => void cycleLogged(s)}
            onLastTime={copyLast}
            onEdit={onEditSet}
            // First time: one line right under the row being filled, never a guessed weight (SPEC 6 rule 5).
            currentNote={!lastTime && logged.length === 0 ? progression.next.reason : undefined}
            hold={timed && current ? { running, onToggle: toggleWatch } : undefined}
            footer={
              <button
                type="button"
                className={`${styles.addSet} pressable`}
                onClick={() => {
                  addExtraSet(sessionId, exerciseId);
                  w.bump();
                }}
              >
                + Add set
              </button>
            }
          />
          <div className={styles.statusLine}>
            <p className={styles.status} data-testid="set-status" role="status">
              {status && current ? `Set ${current.index + 1}: ${status}` : ''}
            </p>
            {!timed && current && !status && <Hint id="setCard" className={styles.checkHint} point="up" />}
          </div>
        </>
      )}

      {kind && kind !== 'timed' && (
        <WeightSheet
          open={picking !== null}
          onClose={() => setPicking(null)}
          title={picking ? `Set ${picking.index + 1}` : ''}
          sub={picking ? (rows.filter((r) => r.index > picking.index).length ? `${name} · this set and the ones below` : name) : name}
          loadType={kind}
          gym={gym}
          exerciseId={exerciseId}
          exerciseName={name}
          bar={bar}
          start={picking ? startPick(picking) : { load: null, plates: [] }}
          onDone={(p) => picking && applyWeight(picking, p)}
          onNotice={onNotice}
        />
      )}

      <Sheet open={demo} onClose={() => setDemo(false)} label="How to">
        <div className={styles.sheetBody}>
          <div className={styles.demoTile}>
            <Thumb name={name} loadType={kind} size="hero" />
          </div>
          <h2 className={styles.sheetTitle}>{name}</h2>
          <p className={styles.sheetSub}>Demo coming soon</p>
          {note ? <p className={styles.demoNote}>{note}</p> : null}
          <Button variant="secondary" onClick={() => setDemo(false)}>
            Close
          </Button>
        </div>
      </Sheet>
    </main>
  );
}

/** What the picker starts from: the row's weight, or its plates while the base weight is unknown. */
function startPick(row: PendingRow): WeightPick {
  // A kept pick (other unit, a plate turned off) is never handed to today's picker as if it were today's.
  if (row.kept) return { load: null, plates: [] };
  return { load: row.load, plates: row.plates };
}
