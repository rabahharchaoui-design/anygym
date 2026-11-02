import { Suspense, lazy, type ComponentType, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Load, SetKind, WorkoutSet } from '../../db/types';
import { saveMutation } from '../../db/mutations';
import { loadDraft, saveDraft, writeDrafts, type Draft } from '../../lib/drafts';
import { logKey, logQueue } from '../../lib/logQueue';
import { newId } from '../../db/ids';
import { beatLine } from '../../lib/progression';
import { setLine, targetSecondsOf } from '../../lib/planWorkout';
import { addExtraSet, removeExtraSet } from '../../lib/extraSets';
import { blockedReason, dropSlot, insertSlot, lastTimeNote, materializeFrom, markSubmitted, pendingRows, rowDraft, setNumbers, rowKey, slotChanges, storedType, typeOfSet, type PendingRow, type SetType } from '../../lib/setTable';
import { STOPPED, captureHold, elapsedMs, heldFor, startWatch, stopWatch, wholeSeconds, type Stopwatch } from '../../lib/timer';
import { bodyweightLoad, timedLoad } from '../../lib/load';
import { unlockAudio, warmAudio } from '../../lib/tone';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { Button } from '../../ui/Button';
import { MoreIcon } from '../../ui/icons';
import { tick } from '../../ui/haptics';
import { SetTable } from './SetTable';
import { removeRowAnimated, rowReturning } from './SwipeRow';
import { SetTypeSheet } from './SetTypeSheet';
import { Thumb } from './Thumb';
import { FormDemo } from '../../components/exercise/FormDemo';
import { ExerciseSheet } from '../../components/exercise/ExerciseSheet';
import { demoForPlan, infoForPlan } from '../../data/exerciseInfo';
import type { ExerciseInfo } from '../../lib/exerciseInfo';
import { DemoViewer } from '../../components/exercise/DemoViewer';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { useMedia } from '../../hooks/useMedia';
import { useAfterPaint } from '../../hooks/useAfterPaint';
import { WeightSheet, type WeightPick } from './WeightSheet';
import { confirmablePick, copyLastLoad, currentLoad, pickProblem, prefillLoad } from './exerciseLoad';
import type { Workout } from './useWorkout';
import { adoptJournal, migrateLegacyRows, reconcileExercise, rowsOf, submitRow } from './rowLog';
import styles from './Workout.module.css';

// The muscles and form tips: their own chunk (body maps), mounted after the table (PLAN 2.2d).
// Round 4: the chunk is fetched as soon as this module loads (the app is online then), so opening an
// exercise later, offline before the service worker took over, never asks the network for it. A
// failed fetch is tried again once, then waits for the next exercise to open.
let extrasChunk: Promise<typeof import('./ExerciseExtras')> | null = null;
const loadExtras = () => (extrasChunk ??= import('./ExerciseExtras').catch((err: unknown) => {
  extrasChunk = null;
  throw err;
}));
void loadExtras().catch(() => undefined);
type ExtrasModule = { default: ComponentType<{ info: ExerciseInfo; photosOk: boolean; known: boolean }> };
const NO_EXTRAS: ExtrasModule = { default: () => null };
const ExerciseExtras = lazy(
  (): Promise<ExtrasModule> =>
    loadExtras().catch(() => new Promise<ExtrasModule>((resolve) => window.setTimeout(() => resolve(loadExtras().catch(() => NO_EXTRAS)), 1500))),
);

type Props = {
  w: Workout;
  sessionId: string;
  exerciseId: string;
  /** After a set landed (with its stored kind): rest and what comes next (the screen decides). */
  onLogged: (exerciseId: string, kind: SetKind) => void;
  onEditSet: (set: WorkoutSet) => void;
  onAskLoadType: () => void;
  onMenu: () => void;
  onSwipeNext: () => void;
  onNotice: (text: string, retry?: () => void) => void;
  /** PLAN 2.2d: a logged set removed from its row (swipe or Remove set): deleted with Undo, its row goes. */
  onRemoveSet: (set: WorkoutSet) => void;
  /** A short message with Undo (a row still to do was removed). */
  onUndoable: (text: string, undo: () => void) => void;
};

const DEFAULT_REPS = 10;
/** Screens too short for the demo hero above the set table (gate s2 round 2). */
const SHORT_SCREEN = '(max-height: 600px)';

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
export function ExerciseView({ w, sessionId, exerciseId, onLogged, onEditSet, onAskLoadType, onMenu, onSwipeNext, onNotice, onRemoveSet, onUndoable }: Props) {
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
  const [demo, setDemo] = useState(false);
  /** The full screen demo (the hero's tap). */
  const [full, setFull] = useState(false);
  /** A tap on a ✓ that cannot log yet: the row, its why, and a count that restarts the pulse. */
  const [nudge, setNudge] = useState<{ index: number; text: string; n: number } | null>(null);
  const nudgeTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(nudgeTimer.current), []);
  /** The hero folded into its compact title bar (scrolled past the picture). */
  const [folded, setFolded] = useState(false);
  /** The hero's foot (name, set, ⋯) stays pinned when the picture scrolls away: its height, measured. */
  // Offline and never kept, the photos cannot show: the compact header instead (gate s2), never a
  // broken or empty picture.
  const baseDemo = demoForPlan(exerciseId);
  const photos = useDemoPhotos(baseDemo);
  const photosOk = !!baseDemo && photos.kind !== 'none';
  // The heavy parts below the table mount once the first frame is painted (PLAN 2.2d).
  const painted = useAfterPaint();
  // Short screens (the 360 x 640 small Android, the 320 x 568 floor): no room for a hero above five
  // rows (SPEC 13.5, PLAN 2.2b: the whole set table in the first screen), so the compact header
  // with the demo as its tile instead; a tap opens the form sheet with the photos.
  const short = useMedia(SHORT_SCREEN);
  const hasDemo = photosOk && !short;
  const heroRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const hero = heroRef.current;
    const cap = captionRef.current;
    if (!hero || !cap) return;
    const scroller = hero.parentElement!;
    let pinPx = 0;
    const pin = () => {
      // The bar keeps 8 px of the fade above the name; the rest of the fade scrolls away.
      const capPx = cap.getBoundingClientRect().height;
      pinPx = Math.ceil(capPx - Math.max(0, parseFloat(getComputedStyle(cap).paddingTop) - 8));
      hero.style.setProperty('--pin', `${pinPx}px`);
      hero.style.setProperty('--cap', `${Math.floor(capPx)}px`);
    };
    pin();
    // Folded once the picture has scrolled away: one attribute flip, CSS does the rest.
    const onScroll = () => setFolded(scroller.scrollTop > hero.offsetHeight - pinPx - 24);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(pin);
    ro?.observe(cap);
    return () => {
      ro?.disconnect();
      scroller.removeEventListener('scroll', onScroll);
    };
  }, [hasDemo]);
  // The rest tone's audio context, made while idle so the first ✓ stays light (PLAN 2.2d).
  useEffect(() => warmAudio(), []);
  /** The "Set type" sheet: a row still to do, or a logged set. */
  const [typing, setTyping] = useState<{ n: number; type: SetType; rowId?: string; set?: WorkoutSet } | null>(null);
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
  const slots = rowsOf(sessionId, exerciseId);
  /** A pending row's draft as stored right now, by slot (0 = the first row still to do). */
  const draftAt = (slot: number) => loadDraft(sessionId, rowKey(exerciseId, slot));
  const slotOf = (row: PendingRow) => row.index - logged.length;
  const rebuild = (picked: Load | null, plates: readonly number[]) => (kind ? currentLoad(picked, plates, kind, gym, exerciseId, name, bar) : null);
  // Planned rows left: a warm up logged on a normal lift never uses one up (PLAN 1.7j).
  const workDone = w.done[exerciseId] ?? 0;
  const rows: PendingRow[] = kind
    ? pendingRows({
        // Every drafted row stays visible (a newer edit kept after a delayed write adds a row).
        count: logged.length + Math.max((entry?.sets ?? 3) - workDone, slots.length),
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
      rev: (before?.rev ?? 0) + 1,
    };
    if (own) draft.own = { ...draft.own, ...own };
    if (draft.noTarget === undefined) delete draft.noTarget;
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
    const marked = markSubmitted(before, rows, slotOf(row), { load: row.load, type: row.type, ...(timed ? { seconds } : { reps: row.reps }) }, newId);
    writeDrafts(sessionId, slotChanges(exerciseId, before, marked.slots));
    const at = performance.now();
    setFresh((f) => new Map(f).set(marked.draft.id, at));
    tick();
    return logQueue.claim(key, marked.draft.id, () => submitAndTell(marked.draft));
  };

  /** Writes a submitted row; it lands even if this view closed meanwhile (rowLog.ts). */
  const submitAndTell = async (draft: Draft): Promise<boolean> => {
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
    await submitAndTell(again);
  };

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
    if (!timed) draft.own = { ...before.own, reps: true };
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
    const targets = from.type === 'warmup' ? [from] : rows.filter((r) => r.index >= from.index && r.type !== 'warmup');
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
    writeDrafts(sessionId, slotChanges(exerciseId, before, dropSlot(shown, at)));
    removeExtraSet(sessionId, exerciseId);
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
      addExtraSet(sessionId, exerciseId);
      w.bump();
    });
  };
  const removeLogged = (set: WorkoutSet) => {
    setTyping(null);
    if (logQueue.closed(sessionId)) return;
    onRemoveSet(set);
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
    if (!s || picking || editing) return;
    const dx = e.clientX - s.x;
    const dy = Math.abs(e.clientY - s.y);
    if (dy > 40) return;
    if (dx < -80) onSwipeNext();
  };

  const lastTime = progression?.lastTime;
  // The first time line stays for as long as this view is open once it showed (PLAN 2.0e): it going
  // away with the first logged set moved every row up under the thumb, so the second tap of a fast
  // double tap landed on the next row's ✓ and logged it (the 1.7a and 1.10d double tap flakes).
  // PLAN 2.2b: it sits under the rows now (it never moves a ✓), so it goes as soon as it is done
  // with: a weight picked or a set logged.
  const picked = !!current?.load && kind !== 'bodyweight' && kind !== 'timed';
  const showGuide = !!kind && !!progression && !lastTime && !!progression.next.reason && logged.length === 0 && !picked;
  // One target line (the LAST TIME column already shows each set): "Beat last time: 11 reps at
  // 185 lb", plus why when the weight moved; without a weight to beat, the reason alone.
  const beat = progression && lastTime ? beatLine(progression) : null;
  const why = progression && (progression.next.kind === 'increase' || progression.next.kind === 'reset' || progression.next.kind === 'converted' || !progression.next.load) ? progression.next.reason : '';
  const notes = [entry?.note, w.noteOf(exerciseId)].filter((n): n is string => !!n);
  const note = notes.join(' · ');
  // SPEC 4.4: photos, muscles and cues only when the match is sure (SPEC 4.3). One object per
  // exercise and note (PLAN 2.2d), so the memoized parts below keep it between taps.
  const notesKey = JSON.stringify(notes);
  const info = useMemo(() => infoForPlan(exerciseId, JSON.parse(notesKey) as string[]), [exerciseId, notesKey]);
  const setNumber = Math.min(workDone + 1, Math.max(entry?.sets ?? 1, workDone + 1));
  const status = current ? blockedOf(current) : null;
  // The number each row shows: "W" for a warm up, working sets 1 to n (SetTable shows the same).
  const numbers = setNumbers([...logged.map((s) => typeOfSet(s)), ...rows.map((r) => r.type)]);
  // The weight sheet's row where it is now (its title follows it), else as it was when opened.
  const pickRow = picking ? (rowById(picking.id) ?? picking.row) : null;
  const rowName = (r: PendingRow) => (r.type === 'warmup' ? 'Warm up' : `Set ${numbers[r.index]}`);

  const targetText = !kind
    ? (entry?.line ?? '')
    : rows.length === 0 && logged.length > 0
      ? `All ${logged.length} ${logged.length === 1 ? 'set' : 'sets'} done`
      : entry
        ? setLine(entry, setNumber)
        : `Set ${setNumber}`;
  const titleBlock = (withNote: boolean) => (
    <div className={styles.heroText}>
      <h2 className={styles.exName}>{name}</h2>
      <p className={`${styles.exTarget} num`} data-testid="set-target">
        {targetText}
      </p>
      {/* A pair says so from the start, before any check (round 2, P9). */}
      {entry?.kind === 'pair' && entry.pairSize > 1 && (
        <p className={`${styles.pairLine} num`} data-testid="pair-line">
          Pair · {entry.pairIndex + 1} of {entry.pairSize}
        </p>
      )}
      {withNote && note && (
        <p className={styles.exNote} data-testid="set-plan">
          {note}
        </p>
      )}
    </div>
  );
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
  // The pictures are memoized elements (PLAN 2.2d): a tap on a row never re-renders them. The
  // tapped day list tile grows into them (the shared "ex-hero" view transition, SPEC 23.1).
  const heroArt = useMemo(() => (info.demo ? <FormDemo demo={info.demo} name={name} hero vtName="ex-hero" /> : null), [info.demo, name]);
  const tileArt = useMemo(
    () => (photosOk && info.demo ? <FormDemo demo={info.demo} name={name} compact vtName="ex-hero" /> : <Thumb name={name} loadType={kind} size="hero" vtName="ex-hero" />),
    [photosOk, info.demo, name, kind],
  );
  const moreButton = (
    <button type="button" className={`${styles.moreButton} pressable`} onClick={onMenu} aria-label={`More for ${name}`}>
      <MoreIcon width={22} height={22} strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
  // "Pick a weight" is what the lime Pick button already says (PLAN 2.2b); any other reason (a bar
  // weight to set first, a pick in the other unit) stays as a quiet line. Screen readers hear all.
  const statusText = status && current ? `${rowName(current)}: ${status}` : '';
  const statusShown = !!status && status !== 'Pick a weight';

  return (
    <main className={styles.exMain} data-hero={hasDemo ? '' : undefined} data-testid={`exercise-${exerciseId}`} aria-label={name} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {hasDemo && info.demo ? (
        // The demo hero (PLAN 2.2b): the photos loop like a gif; the name and set ride on its foot,
        // which stays pinned (with the ⋯) while the picture scrolls away above it.
        <div className={styles.hero} ref={heroRef} data-testid="ex-hero" data-folded={folded || undefined}>
          <span className={styles.heroArt} aria-hidden="true">
            <span className={styles.heroMedia}>
              {heroArt}
            </span>
          </span>
          {/* The picture's tap target ends where the foot starts, so each has its own whole hit area
              (SPEC 13.3); a tap on the foot opens the demo too. */}
          <button type="button" className={styles.heroStage} onClick={() => setFull(true)} aria-label={`How to do ${name}`} tabIndex={folded ? -1 : undefined} />
          {/* The foot is on top of the picture (the name is what a tap lands on, SPEC 13.5) and a tap
              on it opens the demo like the picture does; the ⋯ keeps its own tap. */}
          <div
            className={styles.heroCaption}
            ref={captionRef}
            // Rides with its page above the flying photo (round 2, critic B1).
            style={{ viewTransitionName: 'ex-caption' }}
            onClick={(e) => {
              if (!folded && !(e.target as Element).closest('button')) setFull(true);
            }}
          >
            {titleBlock(false)}
            {moreButton}
          </div>
        </div>
      ) : (
        // No sure demo (SPEC 4.3): a compact header, never a broken or empty picture.
        <div className={styles.head} data-testid="ex-head">
          <button type="button" className={`${styles.heroTile} pressable`} onClick={() => setDemo(true)} aria-label={`How to do ${name}`}>
            {tileArt}
          </button>
          {titleBlock(true)}
          {moreButton}
        </div>
      )}
      {/* The plan's own note, under the picture (the hero's foot stays two lines). */}
      {hasDemo && note && (
        <p className={`${styles.exNote} ${styles.planNote}`} data-testid="set-plan">
          {note}
        </p>
      )}

      {kind && progression && lastTime && (
        <div className={styles.guides}>
          {(beat || why) && (
          <p className={`${styles.guide} ${styles.guideNext} num`} data-testid="set-next">
            {beat}
            {beat && why ? <span className={styles.guideWhen}> · {why}</span> : why}
          </p>
          )}
          {/* Last time in one line, with its day (SPEC 6): every set, exact. */}
          <p className={`${styles.guide} num`} data-testid="set-last">
            {lastTimeNote(lastTime.date, lastTime.sets, Date.now())}
          </p>
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
        <div className={styles.tableArea} data-testid="table-area">
          <SetTable
            kind={kind}
            unit={gym.unit}
            logged={logged}
            lastTimeOf={(i) => w.lastSetsOf(exerciseId)?.[i]}
            rows={rows}
            blockedOf={blockedOf}
            liveSeconds={liveSeconds}
            fresh={fresh}
            sending={sending}
            editing={editRow?.index ?? null}
            editingKey={editing ?? undefined}
            onCheck={(r) => void log(r)}
            onWeight={(r) => setPicking({ id: idOf(r), row: r })}
            onAmount={toggleEditor}
            // Bound to the editor's draft id (PLAN 2.0e). A typed hold replaces the row's stopwatch
            // with a stopped one of that length (PLAN 1.7h).
            onAmountChange={((id) => (_r: PendingRow, v: number) => id && latest.current(id, v))(editing)}
            onAmountDone={() => setEditing(null)}
            onType={(r) => !logQueue.closed(sessionId) && setTyping({ n: r.index + 1, type: r.type, rowId: idOf(r) })}
            onLoggedType={(s) => !logQueue.closed(sessionId) && setTyping({ n: logged.indexOf(s) + 1, type: typeOfSet(s), set: s })}
            onLastTime={copyLast}
            onEdit={onEditSet}
            hold={timed && current ? { running, onToggle: toggleWatch } : undefined}
            checkHint={!timed && !!current && !status && logged.length === 0}
            onBlocked={onBlocked}
            nudge={nudge}
            onRemove={removeRow}
            onRemoveLogged={removeLogged}
            removable={!logQueue.closed(sessionId)}
            keyOf={(r) => slots[slotOf(r)]?.id ?? `i${r.index}`}
            underRows={
              <>
                {/* First time: one quiet line under the rows, never a guessed weight (SPEC 6 rule 5).
                    Under the rows, so it never moves a ✓ (PLAN 2.0e). */}
                {showGuide && progression && (
                  <p className={`${styles.firstTime} num`} data-testid="set-guide">
                    {progression.next.reason}
                  </p>
                )}
              </>
            }
            footer={
              <>
                <button
                  type="button"
                  className={`${styles.addSet} pressable`}
                  data-testid="add-set"
                  onClick={() => {
                    addExtraSet(sessionId, exerciseId);
                    w.bump();
                  }}
                >
                  + Add set
                </button>
              </>
            }
          />
          <p className={statusShown ? styles.status : styles.srOnly} data-testid="set-status" role="status">
            {statusText}
          </p>
        </div>
      )}

      {/* Below the table, nothing hidden (PLAN 2.2b): the muscles and the form tips, only when sure.
          PLAN 2.2d: a lazy chunk mounted after the first paint, memoized (a row tap never redraws it). */}
      <Suspense fallback={null}>{painted && <ExerciseExtras info={info} photosOk={photosOk} known={!!kind} />}</Suspense>

      {kind && kind !== 'timed' && (
        <WeightSheet
          open={picking !== null}
          onClose={() => setPicking(null)}
          title={pickRow ? rowName(pickRow) : ''}
          untilPicked={picking?.why && pickRow?.load === null ? picking.why : undefined}
          sub={!pickRow ? '' : pickRow.type === 'warmup' ? 'Just this warm up' : rows.some((r) => r.index > pickRow.index && r.type !== 'warmup') ? 'This set and the ones below' : 'This set'}
          loadType={kind}
          gym={gym}
          exerciseId={exerciseId}
          exerciseName={name}
          bar={bar}
          start={picking ? startPick(picking.row, gym.unit) : { load: null, plates: [], unit: gym.unit }}
          onDone={(p) => picking && applyWeight(picking.id, p)}
          onNotice={onNotice}
        />
      )}

      <SetTypeSheet
        open={typing !== null}
        onClose={() => setTyping(null)}
        title={typing ? `Set ${typing.n}` : ''}
        value={typing?.type ?? 'normal'}
        onPick={pickType}
        onRemove={() => {
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
            removeRowAnimated(target.rowId!, () => {
              const now = rowById(target.rowId!);
              if (now) removeRow(now);
            });
          }
          else {
            setTyping(null);
            gone();
          }
        }}
      />

      {hasDemo && info.demo && (
        <DemoViewer
          open={full}
          onClose={() => setFull(false)}
          name={name}
          demo={info.demo}
        />
      )}
      <ExerciseSheet open={demo} onClose={() => setDemo(false)} name={name} info={info} placeholder={<Thumb name={name} loadType={kind} size="hero" />} />
    </main>
  );
}

/** What the picker starts from: the row's weight, or its plates while the base weight is unknown. */
function startPick(row: PendingRow, unit: WeightPick['unit']): WeightPick {
  // A kept pick (other unit, a plate turned off) is never handed to today's picker as if it were today's.
  if (row.kept) return { load: null, plates: [], unit };
  // A row's shown weight is rebuilt on today's gym, so it is in today's unit (PLAN 2.0c).
  return { load: row.load, plates: row.plates, unit: row.load?.unit ?? unit };
}
