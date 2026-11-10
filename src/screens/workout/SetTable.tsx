import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { prefersReducedMotion } from '../../ui/motion';
import type { Load, Unit, WorkoutSet } from '../../db/types';
import { setNumbers, lastTimeCell, typeOfSet, weightHeader, type PendingRow } from '../../lib/setTable';
import { SETTLE_MS, doneWarmUps, foldWords, sameSpot, type Tap } from '../../lib/warmUpFold';
import type { PastSet, SetLine } from '../../lib/progression';
import { Hint } from '../../components/hint/Hint';
import { hints } from '../../lib/hints';
import type { SetRecord } from '../../lib/records';
import { LoggedRow, TodoRow, type Api, type Shared } from './SetRows';

/** The hero's height glide once a set is logged (Workout.module.css, .hero transition). */
const HERO_GLIDE_MS = 260;
import styles from './SetTable.module.css';

type Props = {
  kind: Load['kind'];
  unit: Unit;
  logged: WorkoutSet[];
  /** Last time per logged row (the same set last session), for the LAST TIME column. */
  lastTimeOf: (index: number) => SetLine | PastSet | undefined;
  rows: PendingRow[];
  /** Why each pending row's ✓ cannot log yet (null = it can). */
  blockedOf: (row: PendingRow) => string | null;
  /** Timed: the live seconds of the running hold on the current row. */
  liveSeconds: number;
  /** Ids logged while this view was open (→ when the ✓ was tapped): their rows play the check animation once. */
  fresh: ReadonlyMap<string, number>;
  /** Rows whose ✓ was tapped and whose write is running (row index → tap time): shown checked at once. */
  sending?: ReadonlyMap<number, number>;
  editing: number | null;
  /**
   * The open editor's own identity (its row's draft id, PLAN 2.0e): its stepper is keyed by it, so
   * a row moving under it remounts the stepper (ending a held repeat) instead of handing it over.
   */
  editingKey?: string;
  /** A double tap stays one set: the view claims the row with one submission (logQueue.claim). */
  onCheck: (row: PendingRow) => void;
  onWeight: (row: PendingRow) => void;
  onAmount: (row: PendingRow) => void;
  onAmountChange: (row: PendingRow, value: number) => void;
  onAmountDone: () => void;
  onType: (row: PendingRow) => void;
  onLoggedType: (set: WorkoutSet) => void;
  onLastTime: (row: PendingRow) => void;
  onEdit: (set: WorkoutSet) => void;
  /** Under the rows, inside the scroll (the "+ Add set" button). */
  footer?: ReactNode;
  /** Right under the rows, above the tip slot (the quiet first time line), so a tip never covers it. */
  underRows?: ReactNode;
  /**
   * 3.5b round 4 (M8): a Quick pair or circuit member waiting for its partner's set this round: no
   * row is "next" here (the Next button under the table is the one thing to do).
   */
  waiting?: boolean;
  /** One line right under the current row ("First time: pick a weight you could do 2 more reps with"). */
  currentNote?: string;
  /**
   * Timed: the current row's Hold cell is the timer. A tap starts or pauses it; it counts down from
   * the row's target with a ring (or up, when there is no target).
   */
  hold?: { running: boolean; onToggle: () => void };
  /** PLAN 3.8b: the effort question is on screen, so the swipe tip waits. */
  hideSwipeHint?: boolean;
  /** The first time hint "Tap the check when you finish a set", over the header, pointing down at the first row's ✓. */
  checkHint?: boolean;
  /**
   * PLAN 2.0l (ui-2.2e #1): the current row's reps were not set by hand yet: its number shows a quiet
   * dotted underline, so it reads as something to tap and change. Gone after the row's first edit.
   */
  repsCue?: boolean;
  /** A tap on a ✓ that cannot log yet (SPEC 23.2): the view says why. */
  onBlocked?: (row: PendingRow) => void;
  /** The short "why" shown in place on that row for a moment, and its weight cell pulses (n restarts it). */
  nudge?: { index: number; text: string; n: number } | null;
  /**
   * PLAN 2.2d: remove a row (swipe left to Delete, or Remove set in its long press menu). A row
   * still to do drops its draft; a logged set goes through the workout's delete with Undo.
   */
  onRemove?: (row: PendingRow) => void;
  /**
   * PLAN 2.0l: removal by identity. `onClaim` gives a row its stable id when its delete starts
   * (null: it cannot go); `onRemoveId` removes exactly that row later, wherever it is then, or nothing
   * when it was logged or went meanwhile. Without them `onRemove` gets the row.
   */
  onClaim?: (row: PendingRow) => string | null;
  onRemoveId?: (id: string) => void;
  onRemoveLogged?: (set: WorkoutSet) => void;
  /** False while rows cannot be removed (Finish started). */
  removable?: boolean;
  /** A row's data identity (its draft id when it has one): a row back from Undo opens up again. */
  keyOf?: (row: PendingRow) => string;
  /** PLAN 2.2e: the record a logged set set (its row shows the PR badge), from real history only. */
  recordOf?: (setId: string) => SetRecord | undefined;
};

/**
 * Keeps the current row (and its open stepper) in view. Since PLAN 2.2b the exercise view scrolls
 * as a whole (the table no longer has its own scroll), so the view is scrolled, only as far as
 * needed: below the hero's pinned foot and the column header, above the rest bar. Nothing moves
 * when the row is already in view (the usual case: the table fits the first screen).
 */
function keepInView(wrap: HTMLElement | null) {
  if (!wrap) return;
  const target = wrap.querySelector<HTMLElement>('[data-current-group]');
  const scroller = wrap.closest<HTMLElement>('main');
  if (!target || !scroller) return;
  const head = wrap.querySelector<HTMLElement>('[data-head]')?.offsetHeight ?? 0;
  const hero = scroller.querySelector<HTMLElement>('[data-testid="ex-hero"]');
  const pin = hero ? parseFloat(getComputedStyle(hero).getPropertyValue('--pin')) || 0 : 0;
  const s = scroller.getBoundingClientRect();
  // PLAN 3.5g: above every bar that floats over the page (the rest bar, the Next in the pair bar).
  const covers = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="rest-timer"], [data-testid="group-next"]'))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => r.top);
  const bottom = Math.min(s.bottom, ...covers) - 4;
  const top = s.top + (hero && scroller.scrollTop > 0 ? pin : 0) + head + 4;
  const t = target.getBoundingClientRect();
  let delta = 0;
  if (t.bottom > bottom) delta = t.bottom - bottom;
  // Scrolled down, the hero folds to its foot: the row must stay below it.
  if (delta > 0 && hero) delta = Math.min(delta, t.top - (s.top + pin + head + 4));
  else if (t.top < top) delta = t.top - top;
  if (Math.abs(delta) < 1) return;
  scroller.scrollTo({
    top: scroller.scrollTop + delta,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}


/**
 * The set table (SPEC 20.2, 21.1): SET · LAST TIME · WEIGHT · REPS · ✓ (timed: SET · LAST TIME ·
 * HOLD · ✓). Logged rows first, then the rows still to do, already filled. PLAN 2.2d: each row is
 * memoized on its own data, so a tap re-renders that row, not the table; rows swipe left to delete.
 */
export function SetTable(props: Props) {
  const { kind, unit, logged, rows, editing } = props;
  const timed = kind === 'timed';
  const swipeTip = logged.length > 0 && !props.checkHint && !props.nudge && !props.hideSwipeHint;
  const swipeActive = useSyncExternalStore(hints.subscribe, hints.active, () => null) === 'swipeSet';
  const current = props.waiting ? undefined : rows[0]?.index;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => keepInView(ref.current), [current, editing, logged.length]);
  // PLAN 3.5g (SPEC 13.5): after a check the rest bar comes up and the hero glides smaller: once that has
  // settled, once more, so the current row ends up above the rest bar, never under it.
  useEffect(() => {
    if (!logged.length) return;
    const t = window.setTimeout(() => keepInView(ref.current), SETTLE_MS + HERO_GLIDE_MS + 40);
    return () => window.clearTimeout(t);
  }, [logged.length]);

  // PLAN 3.5g: the finished warm ups fold into one row (a tap shows them again), a moment after the last.
  const canFold = doneWarmUps(logged.map((s) => typeOfSet(s)), rows.map((r) => r.type));
  const [folded, setFolded] = useState(canFold);
  const [showWarm, setShowWarm] = useState(false);
  useEffect(() => {
    if (!canFold) return setFolded(0);
    const t = window.setTimeout(() => setFolded(canFold), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [canFold]);
  const fold = showWarm ? 0 : Math.min(folded, canFold);
  // The last ✓ tap (screen point and time): the second tap of a double tap never logs a row that moved under it.
  const lastTap = useRef<Tap | null>(null);

  // The latest props for the stable handlers below.
  const latest = useRef(props);
  latest.current = props;
  const api = useMemo<Api>(
    () => ({
      check: (r, e) => {
        // A real tap (detail > 0; a keyboard or a script click has no point) at the spot of the last one,
        // within a double tap: the table moved under it, so it is the same tap, never a second set.
        if (e && e.detail > 0) {
          const at = { x: e.clientX, y: e.clientY, t: performance.now() };
          if (sameSpot(lastTap.current, at)) return;
          lastTap.current = at;
        }
        latest.current.onCheck(r);
      },
      weight: (r) => latest.current.onWeight(r),
      amount: (r) => latest.current.onAmount(r),
      amountChange: (r, v) => latest.current.onAmountChange(r, v),
      amountDone: () => latest.current.onAmountDone(),
      type: (r) => latest.current.onType(r),
      loggedType: (s) => latest.current.onLoggedType(s),
      lastTime: (r) => latest.current.onLastTime(r),
      edit: (s) => latest.current.onEdit(s),
      blocked: (r) => latest.current.onBlocked?.(r),
      toggleHold: () => latest.current.hold?.onToggle(),
      remove: (r) => latest.current.onRemove?.(r),
      claim: (r) => (latest.current.onClaim ? latest.current.onClaim(r) : `i${r.index}`),
      removeId: (r, id) => (latest.current.onRemoveId ? latest.current.onRemoveId(id) : latest.current.onRemove?.(r)),
      removeLogged: (s) => latest.current.onRemoveLogged?.(s),
    }),
    [],
  );
  const removable = props.removable !== false && !!props.onRemove;
  const shared: Shared = { kind, unit, timed, api, removable };

  // Warm ups read "W"; working sets are numbered 1 to n (the header's "Set 2 of 3" agrees).
  const numbers = setNumbers([...logged.map((s) => typeOfSet(s)), ...rows.map((r) => r.type)]);

  return (
    <div className={styles.wrap} ref={ref} data-timed={timed || undefined}>
      <div className={styles.head} aria-hidden="true" data-head>
        <span>Set</span>
        <span>Last time</span>
        {!timed && <span>{weightHeader(kind, unit)}</span>}
        <span>{timed ? 'Hold' : 'Reps'}</span>
        <span className={styles.headCheck}>Done</span>
      </div>
      {/* Over the column header (never over a row's text), its arrow down on the first row's ✓ (gate
          s2: under the rows it pointed at the last row's ✓). Absolute, so nothing moves when it goes. */}
      {props.checkHint && <Hint id="setCard" className={styles.hint} point="down" arrow="end" compact />}
      <ol className={styles.rows} aria-label="Sets">
        {fold > 0 && (
          <li data-testid="warmups-done">
            <button type="button" className={`${styles.foldRow} pressable`} onClick={() => setShowWarm(true)} aria-label={`${foldWords(fold)}. Show them`}>
              <span className={`${styles.foldType} num`}>W</span>
              <span className={styles.foldText}>{foldWords(fold)}</span>
              <span className={styles.foldShow}>Show</span>
            </button>
          </li>
        )}
        {logged.map((s, i) => {
          // Folded warm ups stay in the table, hidden (their identity and order never change).
          const folded = i < fold;
          const last = lastTimeCell(props.lastTimeOf(i), unit);
          const fresh = props.fresh.get(s.id);
          const number = String(numbers[i]);
          const record = props.recordOf?.(s.id);
          const sig = JSON.stringify([s, i, number, last, fresh !== undefined, kind, unit, removable, record?.text, folded]);
          return <LoggedRow key={`row-${i}`} {...shared} set={s} at={i} number={number} last={last} fresh={fresh} record={record} folded={folded} sig={sig} />;
        })}
        {rows.map((r) => {
          const isCurrent = r.index === current;
          const blocked = props.blockedOf(r);
          const editingHere = editing === r.index;
          const number = String(numbers[r.index]);
          const nudge = props.nudge?.index === r.index ? { text: props.nudge.text, n: props.nudge.n } : null;
          // Only the current row of a timed exercise follows the running clock.
          const liveSeconds = timed && isCurrent ? props.liveSeconds : 0;
          const hold = timed && isCurrent && props.hold ? { running: props.hold.running } : undefined;
          const currentNote = isCurrent ? props.currentNote : undefined;
          const groupMark = editing === null ? isCurrent : editingHere;
          const editingKey = editingHere ? props.editingKey : undefined;
          const sendingAt = props.sending?.get(r.index);
          const rowKey = props.keyOf?.(r) ?? `i${r.index}`;
          const cue = !timed && isCurrent && !editingHere && !!props.repsCue;
          const logLabel = isCurrent && !!props.checkHint && blocked === null && sendingAt === undefined;
          const sig = JSON.stringify([r, number, isCurrent, blocked, editingHere, editingKey, liveSeconds, hold, nudge, currentNote, groupMark, kind, unit, removable, sendingAt, rowKey, cue, logLabel]);
          return (
            <TodoRow
              key={`row-${r.index}`}
              {...shared}
              row={r}
              number={number}
              isCurrent={isCurrent}
              blocked={blocked}
              editingHere={editingHere}
              editingKey={editingKey}
              liveSeconds={liveSeconds}
              hold={hold}
              nudge={nudge}
              currentNote={currentNote}
              groupMark={groupMark}
              sendingAt={sendingAt}
              rowKey={rowKey}
              cue={cue}
              logLabel={logLabel}
              sig={sig}
            />
          );
        })}
      </ol>
      {/* The tip slot under the rows (PLAN 2.2b): a blocked ✓'s reason floats here, pointing up at
          the ✓ column. Absolute, so nothing moves, and never over a number or a column header. */}
      <div className={styles.tipSlot}>
        {props.nudge && (
          <span key={props.nudge.n} className={styles.nudge} role="status" data-testid="check-why">
            {props.nudge.text}
          </span>
        )}
      </div>
      {/* PLAN 2.2d (G): "+ Add set" right under the last row at the row gap, no dead space; the
          quiet first time line goes under it. */}
      {props.footer}
      {/* The tip slot under "+ Add set" (gate P4): the swipe tip never draws over it. Zero height
          and absolute, so nothing moves. Once, with a logged set and no other tip (PLAN 2.2d P1). */}
      {/* PLAN 3.8b: not while the effort question shows, and while it is up it has its own room. */}
      <div className={`${styles.tipSlot} ${swipeTip && swipeActive ? styles.tipSlotReserved : ''}`}>
        {swipeTip && <Hint id="swipeSet" className={styles.swipeHint} point="up" compact />}
      </div>
      {props.underRows}
    </div>
  );
}
