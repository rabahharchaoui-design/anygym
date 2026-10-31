import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  /** Ids logged while this view was open: their rows play the check animation once. */
  fresh: ReadonlySet<string>;
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
  /** One line right under the current row ("First time: pick a weight you could lift 2 more reps with"). */
  currentNote?: string;
  /**
   * Timed: the current row's Hold cell is the timer. A tap starts or pauses it; it counts down from
   * the row's target with a ring (or up, when there is no target).
   */
  hold?: { running: boolean; onToggle: () => void };
  /** The first time hint "Tap the check when you finish a set", over the header, pointing at the first row's ✓. */
  checkHint?: boolean;
};

const Check = () => <CheckGlyph className={styles.checkIcon} aria-hidden="true" />;

/**
 * Keeps the current row (and its open stepper) in view inside the table's own scroll, never
 * scrolling the screen (SPEC 13.5: on SE at 130% text the table scrolls, the screen does not).
 */
function keepInView(wrap: HTMLElement | null) {
  if (!wrap) return;
  const target = wrap.querySelector<HTMLElement>('[data-current-group]');
  if (!target) return;
  const head = wrap.querySelector<HTMLElement>('[data-head]')?.offsetHeight ?? 0;
  const w = wrap.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  let delta = 0;
  if (t.bottom > w.bottom) delta = t.bottom - w.bottom + 4;
  if (t.top - delta < w.top + head) delta = t.top - (w.top + head) - 4;
  if (Math.abs(delta) < 1) return;
  wrap.scrollTo({
    top: wrap.scrollTop + delta,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

/** One hold format everywhere: "45 s" under a minute, "1:05" from a minute on. */
const holdText = (seconds: number) => (seconds < 60 ? `${Math.max(0, Math.floor(seconds))} s` : formatElapsed(seconds));

const amountOf = (kind: Load['kind'], r: { reps?: number; seconds?: number }) => (kind === 'timed' ? (r.seconds ? `${r.seconds} s` : '') : r.reps ? `${r.reps}` : '');

/**
 * The set table (SPEC 20.2, 21.1): SET · LAST TIME · WEIGHT · REPS · ✓ (timed: SET · LAST TIME ·
 * HOLD · ✓). Logged rows first, then the rows still to do, already filled. Scrolls inside itself.
 */
export function SetTable(props: Props) {
  const { kind, unit, logged, rows, editing } = props;
  const timed = kind === 'timed';
  const current = rows[0]?.index;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => keepInView(ref.current), [current, editing, logged.length]);

  // Warm ups read "W"; working sets are numbered 1 to n (the header's "Set 2 of 3" agrees).
  const numbers = setNumbers([...logged.map((s) => typeOfSet(s)), ...rows.map((r) => r.type)]);
  const typeButton = (t: SetType, at: number, onPress: () => void) => (
    <button
      type="button"
      className={`${styles.setNo} pressable`}
      data-type={t}
      onClick={onPress}
      aria-label={t === 'warmup' ? 'Warm up set. Change set type' : `Set ${numbers[at]}, ${SET_TYPE_WORDS[t]}. Change set type`}
      aria-haspopup="dialog"
      data-testid="set-type"
    >
      <span className={`${styles.setNoNum} num`}>{numbers[at]}</span>
      {SET_TYPE_CHIP[t] && (
        <span className={styles.typeChip} data-testid="set-type-chip">
          {SET_TYPE_CHIP[t]}
        </span>
      )}
    </button>
  );

  return (
    <div className={styles.wrap} ref={ref} data-timed={timed || undefined}>
      <div className={styles.head} aria-hidden="true" data-head>
        <span>Set</span>
        <span>Last time</span>
        {!timed && <span>{weightHeader(kind, unit)}</span>}
        <span>{timed ? 'Hold' : 'Reps'}</span>
        <span className={styles.headCheck}>Done</span>
      </div>
      {/* Over the column header (never over a row's text), its arrow down on the first row's ✓. */}
      {props.checkHint && <Hint id="setCard" className={styles.hint} point="down" arrow="end" compact />}
      <ol className={styles.rows} aria-label="Sets">
        {logged.map((s, i) => {
          const t = typeOfSet(s);
          const last = lastTimeCell(props.lastTimeOf(i), unit);
          // From the set's own record (unit, load kind, count), labelled where it differs from the heading.
          const cells = savedCells(s, kind, unit);
          return (
            <li key={`row-${i}`} className={styles.row} data-state="logged" data-fresh={props.fresh.has(s.id) || undefined} data-testid="set-row">
              {typeButton(t, i, () => props.onLoggedType(s))}
              <button
                type="button"
                className={`${styles.loggedBody} pressable`}
                onClick={() => props.onEdit(s)}
                aria-label={`Set ${i + 1}${t === 'normal' ? '' : `, ${SET_TYPE_WORDS[t]}`}: ${formatSetLine(s)}. Edit`}
              >
                <span className={`${styles.last} num`}>{last || '–'}</span>
                {!timed && (
                  <span className={`${styles.cellValue} num`} data-testid="saved-weight">
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
            </li>
          );
        })}
        {rows.map((r) => {
          const blocked = props.blockedOf(r);
          const n = r.index + 1;
          const isCurrent = r.index === current;
          const weight = r.kept ? keptCell(r.kept, kind, unit) : weightCell(kind, r.load, r.plates, unit);
          const shownSeconds = timed && isCurrent && props.liveSeconds > 0 ? props.liveSeconds : r.seconds;
          const amount = amountOf(kind, {
            reps: r.reps,
            seconds: shownSeconds,
          });
          const last = lastTimeCell(r.lastTime, unit);
          // Timed current row: the Hold cell is the timer (counts down from the target, else up).
          const timer = timed && isCurrent && props.hold !== undefined;
          const target = r.seconds ?? 0;
          const holdState: 'ready' | 'running' | 'stopped' = props.hold?.running ? 'running' : props.liveSeconds > 0 ? 'stopped' : 'ready';
          return (
            <li key={`row-${r.index}`} className={styles.rowGroup} data-current-group={(editing === null ? isCurrent : editing === r.index) || undefined}>
              <div className={styles.row} data-state={isCurrent ? 'current' : 'todo'} data-testid="set-todo">
                {typeButton(r.type, r.index, () => props.onType(r))}
                <button
                  type="button"
                  className={`${styles.last} ${styles.cellButton} num pressable`}
                  disabled={!r.lastTime}
                  onClick={() => props.onLastTime(r)}
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
                    onClick={() => props.onWeight(r)}
                    aria-label={
                      r.load ? `Weight for set ${n}: ${weight} ${kind === 'bodyweight' ? '' : unit}. Change` : r.kept ? `Set ${n}: ${weight}, pick again` : `Set ${n}: set the weight`
                    }
                    data-testid="weight-cell"
                  >
                    {weight ? <Odometer value={weight} /> : isCurrent ? 'Pick' : '–'}
                  </button>
                )}
                {timer ? (
                  // Always exactly what the ✓ will log: before the start the target (or a tap to
                  // start), running the time so far against the target, stopped the time held.
                  <button
                    type="button"
                    className={`${styles.cellButton} ${styles.holdCell} num pressable`}
                    data-running={props.hold!.running || undefined}
                    data-hold={holdState}
                    onClick={props.hold!.onToggle}
                    aria-label={props.hold!.running ? 'Stop timer' : 'Start timer'}
                    data-testid="hold-cell"
                  >
                    <Ring fraction={target ? props.liveSeconds / target : 0} size={26} stroke={3} glideMs={250} className={styles.holdRing}>
                      {holdState === 'ready' ? <PlayIcon className={styles.holdPlay} width={13} height={13} strokeWidth={2.6} fill="currentColor" /> : null}
                    </Ring>
                    <span className={styles.holdText}>
                      <span className={styles.holdMain} data-testid="timer-clock">
                        {holdState === 'ready' ? (target ? holdText(target) : 'Start') : holdText(props.liveSeconds)}
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
                    aria-expanded={editing === r.index}
                    onClick={() => props.onAmount(r)}
                    aria-label={timed ? `Hold for set ${n}: ${shownSeconds ?? 0} seconds. Change` : `Reps for set ${n}: ${r.reps ?? 0}. Change`}
                    data-testid={timed ? 'hold-cell' : 'reps-cell'}
                  >
                    {amount ? <Odometer value={amount} /> : '–'}
                  </button>
                )}
                <span className={styles.checkWrap}>
                  <button
                    type="button"
                    className={`${styles.check} pressable`}
                    disabled={blocked !== null}
                    onClick={() => props.onCheck(r)}
                    aria-label={blocked ? `Set ${n}: ${blocked}` : `Log set ${n}: ${timed ? `${shownSeconds ?? 0} s` : formatSetLine({ reps: r.reps, load: r.load ?? undefined })}`}
                    data-testid={isCurrent ? 'check-current' : 'check'}
                  >
                    <span className={styles.checkCircle}>
                      <Check />
                    </span>
                  </button>
                </span>
              </div>
              {isCurrent && props.currentNote && (
                <p className={`${styles.rowNote} num`} data-testid="set-guide">
                  {props.currentNote}
                </p>
              )}
              {editing === r.index && (
                <div className={styles.stepperRow} key={props.editingKey ?? 'stepper'}>
                  {timed ? (
                    <RepsStepper label="Seconds" unit="seconds" value={r.seconds ?? 30} onChange={(v) => props.onAmountChange(r, v)} max={3600} compact />
                  ) : (
                    <RepsStepper value={r.reps ?? 1} onChange={(v) => props.onAmountChange(r, v)} compact />
                  )}
                  <button type="button" className={`${styles.stepperDone} pressable`} onClick={props.onAmountDone}>
                    Done
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {props.footer}
    </div>
  );
}
