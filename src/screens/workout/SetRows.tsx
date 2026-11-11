// The set table's rows (SPEC 20.2, 21.1; PLAN 2.2d): a logged row and a row still to do, each memoized
// on its own data, so a tap re-renders that row, not the table. Moved out of SetTable as they were
// (PLAN 3.5g, code organization).
import { memo, type CSSProperties } from 'react';
import { Check as CheckGlyph } from 'lucide-react';
import { Odometer } from '../../ui/Odometer';
import { Ring } from '../../ui/Ring';
import { PlayIcon } from '../../ui/icons';
import { formatElapsed } from '../../lib/timer';
import type { Load, Unit, WorkoutSet } from '../../db/types';
import { formatSet } from '../../lib/setWords';
import { formatWhen } from '../../lib/progression';
import { IMPORTED_LABEL } from '../../lib/import/importOrder';
import { SET_TYPE_CHIP, SET_TYPE_WORDS, keptCell, lastTimeCell, savedCells, typeOfSet, weightCell, type PendingRow, type SetType } from '../../lib/setTable';
import { RepsStepper } from './RepsStepper';
import { SwipeRow } from './SwipeRow';
import { PRBadge } from '../../ui/PRBadge';
import type { SetRecord } from '../../lib/records';
import styles from './SetTable.module.css';

/** Words ("Just you", "40 + bar") wrap onto two short lines in the cell; numbers roll (PLAN 2.2b). */
const isWord = (v: string) => /[a-z]/i.test(v);
const WeightFace = ({ value }: { value: string }) => (isWord(value) ? <span className={styles.word}>{value}</span> : <Odometer value={value} />);

const Check = () => <CheckGlyph className={styles.checkIcon} aria-hidden="true" />;

/** One hold format everywhere: "45 s" under a minute, "1:05" from a minute on. */
const holdText = (seconds: number) => (seconds < 60 ? `${Math.max(0, Math.floor(seconds))} s` : formatElapsed(seconds));

const amountOf = (kind: Load['kind'], r: { reps?: number; seconds?: number }) => (kind === 'timed' ? (r.seconds ? holdText(r.seconds) : '') : r.reps ? `${r.reps}` : '');

/** Every handler a row may call, stable for the table's life: rows re-render only when their own data changes. */
export type Api = {
  check: (r: PendingRow, e?: { clientX: number; clientY: number; detail: number }) => void;
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
  claim: (r: PendingRow) => string | null;
  removeId: (r: PendingRow, id: string) => void;
  removeLogged: (s: WorkoutSet) => void;
};

export type Shared = { kind: Load['kind']; unit: Unit; timed: boolean; api: Api; removable: boolean };

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

/** "New best: beat 185 lb × 5 from Sat" (earlier today when it beat a set of this workout). */
const prDetail = (r: SetRecord) => `New best: beat ${r.beat.text} from ${beatWhen(r.beat.date)}`;

/**
 * One date style with "Last time (Sat)" (gate P9, progression.formatWhen): "earlier today",
 * "yesterday", "Sat" within the week, else "Oct 12"; imported history says so.
 */
function beatWhen(date: number | undefined): string {
  if (date === undefined) return 'earlier today';
  const when = formatWhen(date, Date.now());
  return when === 'today' ? 'earlier today' : when === IMPORTED_LABEL ? 'your imported history' : when;
}

type LoggedProps = Shared & { set: WorkoutSet; at: number; number: string; last: string; fresh?: number; record?: SetRecord; sig: string; /** PLAN 3.5g: a finished warm up folded into the "3 warm ups done" row. */ folded?: boolean };

/** The check animation, carried on from the ✓ tap (a negative delay): one animation across the row's two states. */
const since = (at: number | undefined) => (at === undefined ? undefined : ({ '--since': `${Math.max(0, Math.round(performance.now() - at))}ms` } as CSSProperties));

/** A logged row: tap the middle to edit, swipe left to delete (with Undo), long press for its menu. */
export const LoggedRow = memo(
  function LoggedRow({ set: s, at, number, last, fresh, record, kind, unit, timed, api, removable, folded }: LoggedProps) {
    const t = typeOfSet(s);
    // From the set's own record (unit, load kind, count), labelled where it differs from the heading.
    const cells = savedCells(s, kind, unit);
    return (
      <li data-testid="set-row" data-set-id={s.id} hidden={folded || undefined}>
        <SwipeRow
          rowKey={s.id}
          deleteLabel={`Delete set ${number}`}
          onDelete={() => api.removeLogged(s)}
          onLongPress={() => api.loggedType(s)}
          enabled={removable}
          face={{ className: styles.row, 'data-state': 'logged', 'data-fresh': fresh !== undefined || undefined, style: since(fresh) }}
        >
          <TypeButton t={t} number={number} onPress={() => api.loggedType(s)} />
          <button
            type="button"
            className={`${styles.loggedBody} pressable`}
            onClick={() => api.edit(s)}
            aria-label={`Set ${at + 1}${t === 'normal' ? '' : `, ${SET_TYPE_WORDS[t]}`}: ${formatSet(s)}${record ? ', personal record' : ''}. Edit`}
          >
            <span className={`${styles.last} num`}>{last || '–'}</span>
            {!timed && (
              <span className={`${styles.cellValue} num`} data-word={(cells.weight && isWord(cells.weight)) || undefined} data-testid="saved-weight">
                {cells.weight || '–'}
              </span>
            )}
            <span className={`${styles.cellValue} num`} data-testid="saved-amount" data-pr={record ? '' : undefined}>
              {cells.amount || '–'}
            </span>
          </button>
          {/* After the reps, outside the edit button (critic B3): its own 44 pt tap shows what it beat. */}
          {record && <PRBadge setId={s.id} detail={prDetail(record)} className={styles.prBadge} />}
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
  /** PLAN 2.0l: the reps number shows it can be changed (a dotted underline). */
  cue: boolean;
  /** PLAN 2.0l (ui-2.2e #2): the first time, the current ✓ says "Log" under it. */
  logLabel: boolean;
  sig: string;
};

/** A row still to do, already filled: weight, reps (or the hold timer) and its ✓. */
export const TodoRow = memo(
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
          claim={() => api.claim(r)}
          onDelete={(id) => api.removeId(r, id)}
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
              // Only the current row asks for a pick (accent); rows further down stay quiet.
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
              data-cue={p.cue && amount ? '' : undefined}
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
              onClick={(e) => api.check(r, e)}
              aria-label={blocked ? `Set ${n}: ${blocked}` : `Log set ${n}: ${timed ? `${shownSeconds ?? 0} s` : formatSet({ reps: r.reps, load: r.load ?? undefined })}`}
              data-testid={isCurrent ? 'check-current' : 'check'}
            >
              <span className={styles.checkCircle} data-labelled={p.logLabel ? '' : undefined}>
                <Check />
                {/* Words for the first time (PLAN 2.0l): the outlined ✓ is the action. Inside the circle, so nothing moves when it goes. */}
                {p.logLabel && (
                  <span className={styles.checkLabel} aria-hidden="true" data-testid="check-label">
                    Log
                  </span>
                )}
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

