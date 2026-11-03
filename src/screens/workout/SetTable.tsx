import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { Check as CheckGlyph } from 'lucide-react';
import { Odometer } from '../../ui/Odometer';
import { Ring } from '../../ui/Ring';
import { PlayIcon } from '../../ui/icons';
import { formatElapsed } from '../../lib/timer';
import { prefersReducedMotion } from '../../ui/motion';
import type { Load, Unit, WorkoutSet } from '../../db/types';
import { formatSetLine } from '../../lib/load';
import { SET_TYPE_CHIP, SET_TYPE_WORDS, setNumbers, keptCell, lastTimeCell, savedCells, typeOfSet, weightCell, weightHeader, type PendingRow, type SetType } from '../../lib/setTable';
import type { PastSet, SetLine } from '../../lib/progression';
import { RepsStepper } from './RepsStepper';
import { Hint } from '../../components/hint/Hint';
import { SwipeRow } from './SwipeRow';
import { PRBadge } from '../../ui/PRBadge';
import type { SetRecord } from '../../lib/records';
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
  /** One line right under the current row ("First time: pick a weight you could do 2 more reps with"). */
  currentNote?: string;
  /**
   * Timed: the current row's Hold cell is the timer. A tap starts or pauses it; it counts down from
   * the row's target with a ring (or up, when there is no target).
   */
  hold?: { running: boolean; onToggle: () => void };
  /** The first time hint "Tap the check when you finish a set", over the header, pointing down at the first row's ✓. */
  checkHint?: boolean;
  /** A tap on a ✓ that cannot log yet (SPEC 23.2): the view says why. */
  onBlocked?: (row: PendingRow) => void;
  /** The short "why" shown in place on that row for a moment, and its weight cell pulses (n restarts it). */
  nudge?: { index: number; text: string; n: number } | null;
  /**
   * PLAN 2.2d: remove a row (swipe left to Delete, or Remove set in its long press menu). A row
   * still to do drops its draft; a logged set goes through the workout's delete with Undo.
   */
  onRemove?: (row: PendingRow) => void;
  onRemoveLogged?: (set: WorkoutSet) => void;
  /** False while rows cannot be removed (Finish started). */
  removable?: boolean;
  /** A row's data identity (its draft id when it has one): a row back from Undo opens up again. */
  keyOf?: (row: PendingRow) => string;
  /** PLAN 2.2e: the record a logged set set (its row shows the PR badge), from real history only. */
  recordOf?: (setId: string) => SetRecord | undefined;
};

/** Words ("Just you", "40 + bar") wrap onto two short lines in the cell; numbers roll (PLAN 2.2b). */
const isWord = (v: string) => /[a-z]/i.test(v);
const WeightFace = ({ value }: { value: string }) => (isWord(value) ? <span className={styles.word}>{value}</span> : <Odometer value={value} />);

const Check = () => <CheckGlyph className={styles.checkIcon} aria-hidden="true" />;

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
  const rest = document.querySelector('[data-testid="rest-timer"]')?.getBoundingClientRect();
  const bottom = Math.min(s.bottom, rest && rest.height > 0 ? rest.top : Infinity) - 4;
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

/** One hold format everywhere: "45 s" under a minute, "1:05" from a minute on. */
const holdText = (seconds: number) => (seconds < 60 ? `${Math.max(0, Math.floor(seconds))} s` : formatElapsed(seconds));

const amountOf = (kind: Load['kind'], r: { reps?: number; seconds?: number }) => (kind === 'timed' ? (r.seconds ? holdText(r.seconds) : '') : r.reps ? `${r.reps}` : '');

/** Every handler a row may call, stable for the table's life: rows re-render only when their own data changes. */
type Api = {
  check: (r: PendingRow) => void;
  weight: (r: PendingRow) => void;
  amount: (r: PendingRow) => void;
  amountChange: (r: PendingRow, v: number) => void;
  amountDone: () => void;
  type: (r: PendingRow) => void;
  loggedType: (s: WorkoutSet) => void;
  lastTime: (r: PendingRow) => void;
  edit: (s: WorkoutSet) => void;
  blocked: (r: PendingRow) => void;
  toggleHold: () => void;
  remove: (r: PendingRow) => void;
  removeLogged: (s: WorkoutSet) => void;
};

type Shared = { kind: Load['kind']; unit: Unit; timed: boolean; api: Api; removable: boolean };

/** The set number with its type chip; a tap opens the set's menu (its type, and Remove set). */
function TypeButton({ t, number, onPress }: { t: SetType; number: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className={`${styles.setNo} pressable`}
      data-type={t}
      onClick={onPress}
      aria-label={t === 'warmup' ? 'Warm up set. Change set type' : `Set ${number}, ${SET_TYPE_WORDS[t]}. Change set type`}
      aria-haspopup="dialog"
      data-testid="set-type"
    >
      <span className={`${styles.setNoNum} num`}>{number}</span>
      {SET_TYPE_CHIP[t] && (
        <span className={styles.typeChip} data-testid="set-type-chip">
          {SET_TYPE_CHIP[t]}
        </span>
      )}
    </button>
  );
}

type LoggedProps = Shared & { set: WorkoutSet; at: number; number: string; last: string; fresh?: number; record?: SetRecord; sig: string };

/** The check animation, carried on from the ✓ tap (a negative delay): one animation across the row's two states. */
const since = (at: number | undefined) => (at === undefined ? undefined : ({ '--since': `${Math.max(0, Math.round(performance.now() - at))}ms` } as CSSProperties));

/** A logged row: tap the middle to edit, swipe left to delete (with Undo), long press for its menu. */
const LoggedRow = memo(
  function LoggedRow({ set: s, at, number, last, fresh, record, kind, unit, timed, api, removable }: LoggedProps) {
    const t = typeOfSet(s);
    // From the set's own record (unit, load kind, count), labelled where it differs from the heading.
    const cells = savedCells(s, kind, unit);
    return (
      <li data-testid="set-row" data-set-id={s.id}>
        <SwipeRow
          rowKey={s.id}
          deleteLabel={`Delete set ${number}`}
          onDelete={() => api.removeLogged(s)}
          onLongPress={() => api.loggedType(s)}
          enabled={removable}
          face={{ className: styles.row, 'data-state': 'logged', 'data-fresh': fresh !== undefined || undefined, style: since(fresh) }}
        >
          <TypeButton t={t} number={number} onPress={() => api.loggedType(s)} />
          {record && <PRBadge setId={s.id} title={record.text} className={styles.prBadge} />}
          <button
            type="button"
            className={`${styles.loggedBody} pressable`}
            onClick={() => api.edit(s)}
            aria-label={`Set ${at + 1}${t === 'normal' ? '' : `, ${SET_TYPE_WORDS[t]}`}: ${formatSetLine(s)}${record ? ', personal record' : ''}. Edit`}
          >
            <span className={`${styles.last} num`}>{last || '–'}</span>
            {!timed && (
              <span className={`${styles.cellValue} num`} data-word={(cells.weight && isWord(cells.weight)) || undefined} data-testid="saved-weight">
                {cells.weight || '–'}
              </span>
            )}
            <span className={`${styles.cellValue} num`} data-testid="saved-amount">
              {cells.amount || '–'}
            </span>
          </button>
          <span className={styles.checkDone} aria-hidden="true">
            <Check />
          </span>
        </SwipeRow>
      </li>
    );
  },
  (a, b) => a.sig === b.sig && a.api === b.api,
);

type TodoProps = Shared & {
  row: PendingRow;
  number: string;
  isCurrent: boolean;
  blocked: string | null;
  /** This row holds the open reps (or hold) editor. */
  editingHere: boolean;
  editingKey?: string;
  liveSeconds: number;
  hold?: { running: boolean };
  nudge: { text: string; n: number } | null;
  currentNote?: string;
  groupMark: boolean;
  /** Its ✓ was tapped at this time and the write is running: shown checked already. */
  sendingAt?: number;
  /** Its data identity (draft id, else its position). */
  rowKey: string;
  sig: string;
};

/** A row still to do, already filled: weight, reps (or the hold timer) and its ✓. */
const TodoRow = memo(
  function TodoRow(p: TodoProps) {
    const { row: r, kind, unit, timed, api, isCurrent, blocked, number } = p;
    const n = r.index + 1;
    const weight = r.kept ? keptCell(r.kept, kind, unit) : weightCell(kind, r.load, r.plates, unit);
    const shownSeconds = timed && isCurrent && p.liveSeconds > 0 ? p.liveSeconds : r.seconds;
    const amount = amountOf(kind, { reps: r.reps, seconds: shownSeconds });
    const last = lastTimeCell(r.lastTime, unit);
    // Timed current row: the Hold cell is the timer (counts down from the target, else up).
    const timer = timed && isCurrent && p.hold !== undefined;
    const target = r.seconds ?? 0;
    const holdState: 'ready' | 'running' | 'stopped' = p.hold?.running ? 'running' : p.liveSeconds > 0 ? 'stopped' : 'ready';
    return (
      <li className={styles.rowGroup} data-current-group={p.groupMark || undefined}>
        <SwipeRow
          rowKey={p.rowKey}
          deleteLabel={`Delete set ${number}`}
          onDelete={() => api.remove(r)}
          onLongPress={() => api.type(r)}
          enabled={p.removable}
          face={{ className: styles.row, 'data-state': isCurrent ? 'current' : 'todo', 'data-testid': 'set-todo', 'data-sending': p.sendingAt !== undefined || undefined, style: since(p.sendingAt) }}
        >
          <TypeButton t={r.type} number={number} onPress={() => api.type(r)} />
          <button
            type="button"
            className={`${styles.last} ${styles.cellButton} num pressable`}
            disabled={!r.lastTime}
            onClick={() => api.lastTime(r)}
            aria-label={r.lastTime ? `Last time ${last}. Copy into set ${n}` : `Set ${n}: no last time`}
          >
            {last || '–'}
          </button>
          {!timed && (
            <button
              type="button"
              className={`${styles.cellButton} ${styles.cellValue} num pressable`}
              // Only the current row asks for a pick (lime); rows further down stay quiet.
              data-empty={(!weight && isCurrent) || undefined}
              data-quiet={(!weight && !isCurrent) || undefined}
              data-unknown={(r.load === null && !!weight) || undefined}
              data-word={(weight && isWord(weight)) || undefined}
              data-nudge={p.nudge ? p.nudge.n % 2 : undefined}
              onClick={() => api.weight(r)}
              aria-label={r.load ? `Weight for set ${n}: ${weight} ${kind === 'bodyweight' ? '' : unit}. Change` : r.kept ? `Set ${n}: ${weight}, pick again` : `Set ${n}: set the weight`}
              data-testid="weight-cell"
            >
              {weight ? <WeightFace value={weight} /> : isCurrent ? 'Pick' : '–'}
            </button>
          )}
          {timer ? (
            // Always exactly what the ✓ will log: before the start the target (or a tap to
            // start), running the time so far against the target, stopped the time held.
            <button
              type="button"
              className={`${styles.cellButton} ${styles.holdCell} num pressable`}
              data-running={p.hold!.running || undefined}
              data-hold={holdState}
              onClick={api.toggleHold}
              aria-label={p.hold!.running ? 'Stop timer' : 'Start timer'}
              data-testid="hold-cell"
            >
              <Ring fraction={target ? p.liveSeconds / target : 0} size={26} stroke={3} glideMs={250} className={styles.holdRing}>
                {holdState === 'ready' ? <PlayIcon className={styles.holdPlay} width={13} height={13} strokeWidth={2.6} fill="currentColor" /> : null}
              </Ring>
              <span className={styles.holdText}>
                <span className={styles.holdMain} data-testid="timer-clock">
                  {holdState === 'ready' ? (target ? holdText(target) : 'Start') : holdText(p.liveSeconds)}
                </span>
                {holdState === 'ready' && target ? <span className={styles.holdSub}>Tap to start</span> : null}
                {holdState === 'running' && target ? <span className={styles.holdSub}>of {holdText(target)}</span> : null}
                {holdState === 'stopped' && target ? <span className={styles.holdSub}>target {holdText(target)}</span> : null}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.cellButton} ${styles.cellValue} num pressable`}
              data-empty={!amount || undefined}
              aria-expanded={p.editingHere}
              onClick={() => api.amount(r)}
              aria-label={timed ? `Hold for set ${n}: ${shownSeconds ?? 0} seconds. Change` : `Reps for set ${n}: ${r.reps ?? 0}. Change`}
              data-testid={timed ? 'hold-cell' : 'reps-cell'}
            >
              {amount ? <Odometer value={amount} /> : '–'}
            </button>
          )}
          {/* A disabled ✓ takes no taps itself; the wrap under it hears them and the view says why. */}
          <span className={styles.checkWrap} onClick={blocked !== null ? () => api.blocked(r) : undefined} data-testid={blocked !== null ? 'check-blocked' : undefined}>
            <button
              type="button"
              className={`${styles.check} pressable`}
              disabled={blocked !== null}
              onClick={() => api.check(r)}
              aria-label={blocked ? `Set ${n}: ${blocked}` : `Log set ${n}: ${timed ? `${shownSeconds ?? 0} s` : formatSetLine({ reps: r.reps, load: r.load ?? undefined })}`}
              data-testid={isCurrent ? 'check-current' : 'check'}
            >
              <span className={styles.checkCircle}>
                <Check />
              </span>
            </button>
          </span>
        </SwipeRow>
        {isCurrent && p.currentNote && (
          <p className={`${styles.rowNote} num`} data-testid="set-guide">
            {p.currentNote}
          </p>
        )}
        {p.editingHere && (
          <div className={styles.stepperRow} key={p.editingKey ?? 'stepper'}>
            {timed ? (
              <RepsStepper label="Seconds" unit="seconds" value={r.seconds ?? 30} onChange={(v) => api.amountChange(r, v)} max={3600} compact />
            ) : (
              <RepsStepper value={r.reps ?? 1} onChange={(v) => api.amountChange(r, v)} compact />
            )}
            <button type="button" className={`${styles.stepperDone} pressable`} onClick={api.amountDone}>
              Done
            </button>
          </div>
        )}
      </li>
    );
  },
  (a, b) => a.sig === b.sig && a.api === b.api,
);

/**
 * The set table (SPEC 20.2, 21.1): SET · LAST TIME · WEIGHT · REPS · ✓ (timed: SET · LAST TIME ·
 * HOLD · ✓). Logged rows first, then the rows still to do, already filled. PLAN 2.2d: each row is
 * memoized on its own data, so a tap re-renders that row, not the table; rows swipe left to delete.
 */
export function SetTable(props: Props) {
  const { kind, unit, logged, rows, editing } = props;
  const timed = kind === 'timed';
  const current = rows[0]?.index;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => keepInView(ref.current), [current, editing, logged.length]);

  // The latest props for the stable handlers below.
  const latest = useRef(props);
  latest.current = props;
  const api = useMemo<Api>(
    () => ({
      check: (r) => latest.current.onCheck(r),
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
        {logged.map((s, i) => {
          const last = lastTimeCell(props.lastTimeOf(i), unit);
          const fresh = props.fresh.get(s.id);
          const number = String(numbers[i]);
          const record = props.recordOf?.(s.id);
          const sig = JSON.stringify([s, i, number, last, fresh !== undefined, kind, unit, removable, record?.text]);
          return <LoggedRow key={`row-${i}`} {...shared} set={s} at={i} number={number} last={last} fresh={fresh} record={record} sig={sig} />;
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
          const sig = JSON.stringify([r, number, isCurrent, blocked, editingHere, editingKey, liveSeconds, hold, nudge, currentNote, groupMark, kind, unit, removable, sendingAt, rowKey]);
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
              sig={sig}
            />
          );
        })}
      </ol>
      {/* The tip slot under the rows (PLAN 2.2b): a blocked ✓'s reason floats here, pointing up at
          the ✓ column. Absolute, so nothing moves, and never over a number or a column header. */}
      <div className={styles.tipSlot}>
        {/* Once, with a logged set on screen and no other tip (PLAN 2.2d P1). */}
        {logged.length > 0 && !props.checkHint && !props.nudge && <Hint id="swipeSet" className={styles.swipeHint} point="up" compact />}
        {props.nudge && (
          <span key={props.nudge.n} className={styles.nudge} role="status" data-testid="check-why">
            {props.nudge.text}
          </span>
        )}
      </div>
      {/* PLAN 2.2d (G): "+ Add set" right under the last row at the row gap, no dead space; the
          quiet first time line goes under it. */}
      {props.footer}
      {props.underRows}
    </div>
  );
}
