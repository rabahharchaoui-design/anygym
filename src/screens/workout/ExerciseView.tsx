import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Load, WorkoutSet } from '../../db/types';
import { logSet, updateSetType } from '../../db/workouts';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../../lib/drafts';
import { logKey, logQueue } from '../../lib/logQueue';
import { formatNext, formatSets, formatWhen } from '../../lib/progression';
import { setLine, targetSecondsOf } from '../../lib/planWorkout';
import { addExtraSet } from '../../lib/extraSets';
import { blockedReason, nextSetType, pendingRows, rowKey, settleRows, storedType, typeOfSet, type PendingRow, type SetType } from '../../lib/setTable';
import { STOPPED, captureHold, elapsedMs, startWatch, stopWatch, wholeSeconds, type Stopwatch } from '../../lib/timer';
import { bodyweightLoad, timedLoad } from '../../lib/load';
import { unlockAudio } from '../../lib/tone';
import { useNow } from '../../hooks/useNow';
import { TAP_GUARD_MS, useTapGuard } from '../../hooks/useTapGuard';
import { Hint } from '../../components/hint/Hint';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { MoreIcon } from '../../ui/icons';
import { tick } from '../../ui/haptics';
import { SetTable } from './SetTable';
import { Thumb } from './Thumb';
import { WeightSheet, type WeightPick } from './WeightSheet';
import { currentLoad, prefillLoad } from './exerciseLoad';
import type { Workout } from './useWorkout';
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

  const draftOf = (i: number) => loadDraft(sessionId, rowKey(exerciseId, i));

  // Drafts saved by the set card before 1.7c live under the exercise id: move one into the first
  // row still to do (its weight, reps, running hold, version and id), then drop the old key.
  const migrated = useRef(false);
  if (!migrated.current) {
    migrated.current = true;
    const legacy = loadDraft(sessionId, exerciseId);
    if (legacy) {
      const first = rowKey(exerciseId, logged.length);
      if (!logged.some((s) => s.id === legacy.id) && !loadDraft(sessionId, first)) {
        logQueue.current(key, legacy.id);
        saveDraft(sessionId, first, legacy);
      }
      clearDraft(sessionId, exerciseId);
    }
  }
  const rebuild = (picked: Load | null, plates: readonly number[]) => (kind ? currentLoad(picked, plates, kind, gym, exerciseId, name, bar) : null);
  const rows: PendingRow[] = kind
    ? pendingRows({
        count: Math.max(entry?.sets ?? 3, logged.length),
        logged,
        progression,
        draftOf,
        rebuild,
        carry: (prev) => prefillLoad(prev, kind, gym, exerciseId, name, bar),
        certain: certainLoad(kind, gym.unit),
        defaultReps: timed ? undefined : entry?.reps === undefined ? DEFAULT_REPS : typeof entry.reps === 'number' ? entry.reps : entry.reps[0],
        planSeconds: entry ? targetSecondsOf(entry) : undefined,
        defaultType: entry?.warmup ? 'warmup' : 'normal',
        lastSets: w.lastSetsOf(exerciseId),
      })
    : [];
  const current = rows[0];

  // Timed: the running hold belongs to the current row's draft, so it survives a reload.
  const watch: Stopwatch = (current && draftOf(current.index)?.watch) ?? STOPPED;
  const running = watch.startedAt !== null;
  const now = useNow(250, timed && running);
  const liveSeconds = wholeSeconds(elapsedMs(watch, running ? Math.max(now, Date.now()) : now));

  /** Every change is saved at once (SPEC 13.3), with a new version for the log queue. */
  const writeRow = (row: PendingRow, patch: Partial<Draft>) => {
    const before = draftOf(row.index);
    const draft: Draft = {
      id: logQueue.current(key),
      load: row.load,
      plates: row.plates,
      type: row.type,
      ...(row.reps !== undefined ? { reps: row.reps } : {}),
      ...(row.seconds !== undefined ? { seconds: row.seconds } : {}),
      ...(before ?? {}),
      ...patch,
      rev: (before?.rev ?? 0) + 1,
    };
    saveDraft(sessionId, rowKey(exerciseId, row.index), draft);
    refresh();
  };

  // A bar or plate machine whose base weight is not known yet: nothing can be loaded until it is answered.
  const baseUnknown = (kind === 'barbell' || kind === 'plate_machine') && rebuild(null, []) === null;
  const blockedOf = (row: PendingRow) => (kind ? blockedReason(kind, row, row.index === current?.index ? liveSeconds : 0, baseUnknown) : 'Pick a weight');

  // A double tap on one ✓ logs one set; checking the next row right after is fine (SPEC 13.3).
  const lastTap = useRef<{ index: number; at: number } | null>(null);
  // `at` is the input event's time stamp, not handler time: a busy main thread that delivers the
  // second tap of a double tap late must not turn it into a second set.
  const log = async (row: PendingRow, at: number = performance.now(), cap?: number) => {
    if (lastTap.current && lastTap.current.index === row.index && at - lastTap.current.at < TAP_GUARD_MS) return;
    lastTap.current = { index: row.index, at };
    if (!kind || logQueue.pending(key)) return;
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
    const load = row.load;
    const t = storedType(row.type);
    const k = logged.length;
    const snapshot = rows;
    // Only this version of the row is used up when the write lands; newer edits stay (PLAN 1.7c).
    const submittedRev = draftOf(row.index)?.rev;
    const id = logQueue.current(key);
    setFresh((f) => new Set(f).add(id));
    tick();
    const ok = await logQueue.submit(
      key,
      async (setId) => {
        await logSet({
          id: setId,
          sessionId,
          exerciseId,
          ...(timed ? { seconds } : { reps: row.reps }),
          load,
          kind: t.kind,
          failure: t.failure,
        });
        onLogged(exerciseId);
        return true;
      },
      // Runs once even if this view closed during the write, against the drafts as they are now:
      // the row's submitted version is used up, rows between move down one place (setTable.ts).
      (nextId) => {
        for (const w of settleRows(k, row.index, submittedRev, draftOf, snapshot, nextId)) {
          if (w.draft) saveDraft(sessionId, rowKey(exerciseId, w.index), w.draft);
          else clearDraft(sessionId, rowKey(exerciseId, w.index));
        }
      },
    );
    if (!ok) onNotice('Could not save that set. Try again.');
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
      ...(last.seconds !== undefined ? { seconds: last.seconds } : {}),
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
    void log(current, performance.now(), holdTarget);
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
            onCheck={(r, at) => void log(r, at)}
            onWeight={(r) => setPicking(r)}
            onAmount={(r) => setEditing((e) => (e === r.index ? null : r.index))}
            onAmountChange={(r, v) => writeRow(r, timed ? { seconds: v } : { reps: v })}
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
  return { load: row.load, plates: row.plates };
}
