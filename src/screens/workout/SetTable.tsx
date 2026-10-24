import { useRef, type ReactNode } from 'react';
import type { Load, Unit, WorkoutSet } from '../../db/types';
import { formatSetLine } from '../../lib/load';
import { SET_TYPE_LETTER, SET_TYPE_WORDS, lastTimeCell, typeOfSet, weightCell, weightHeader, type PendingRow, type SetType } from '../../lib/setTable';
import type { PastSet, SetLine } from '../../lib/progression';
import { RepsStepper } from './RepsStepper';
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
};

const Check = () => (
  <svg viewBox="0 0 24 24" className={styles.checkIcon} aria-hidden="true">
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

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

  const typeButton = (t: SetType, n: number, onPress: () => void) => (
    <button
      type="button"
      className={`${styles.setNo} pressable`}
      data-type={t}
      onClick={onPress}
      aria-label={`Set ${n}, ${SET_TYPE_WORDS[t]}. Change set type`}
      data-testid="set-type"
    >
      {SET_TYPE_LETTER[t] || n}
    </button>
  );

  return (
    <div className={styles.wrap} ref={ref} data-timed={timed || undefined}>
      <div className={styles.head} aria-hidden="true">
        <span>Set</span>
        <span>Last time</span>
        {!timed && <span>{weightHeader(kind, unit)}</span>}
        <span>{timed ? 'Hold' : 'Reps'}</span>
        <span className={styles.headCheck}>Done</span>
      </div>
      <ol className={styles.rows} aria-label="Sets">
        {logged.map((s, i) => {
          const t = typeOfSet(s);
          const last = lastTimeCell(props.lastTimeOf(i), unit);
          return (
            <li key={`row-${i}`} className={styles.row} data-state="logged" data-fresh={props.fresh.has(s.id) || undefined} data-testid="set-row">
              {typeButton(t, i + 1, () => props.onLoggedType(s))}
              <button type="button" className={`${styles.loggedBody} pressable`} onClick={() => props.onEdit(s)} aria-label={`Set ${i + 1}${t === 'normal' ? '' : `, ${SET_TYPE_WORDS[t]}`}: ${formatSetLine(s)}. Edit`}>
                <span className={`${styles.last} num`}>{last || '–'}</span>
                {!timed && <span className={`${styles.cellValue} num`}>{s.load ? weightCell(kind, s.load, s.load.perSide ?? [], unit) || '–' : '–'}</span>}
                <span className={`${styles.cellValue} num`}>{amountOf(kind, s) || '–'}</span>
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
          const weight = weightCell(kind, r.load, r.plates, unit);
          const shownSeconds = timed && isCurrent && props.liveSeconds > 0 ? props.liveSeconds : r.seconds;
          const amount = amountOf(kind, { reps: r.reps, seconds: shownSeconds });
          const last = lastTimeCell(r.lastTime, unit);
          return (
            <li key={`row-${r.index}`} className={styles.rowGroup}>
              <div className={styles.row} data-state={isCurrent ? 'current' : 'todo'} data-testid="set-todo">
                {typeButton(r.type, n, () => props.onType(r))}
                <button type="button" className={`${styles.last} ${styles.cellButton} num pressable`} disabled={!r.lastTime} onClick={() => props.onLastTime(r)} aria-label={r.lastTime ? `Last time ${last}. Copy into set ${n}` : `Set ${n}: no last time`}>
                  {last || '–'}
                </button>
                {!timed && (
                  <button
                    type="button"
                    className={`${styles.cellButton} ${styles.cellValue} num pressable`}
                    data-empty={!weight || undefined}
                    data-unknown={(r.load === null && !!weight) || undefined}
                    onClick={() => props.onWeight(r)}
                    aria-label={r.load ? `Weight for set ${n}: ${weight} ${kind === 'bodyweight' ? '' : unit}. Change` : `Set ${n}: set the weight`}
                    data-testid="weight-cell"
                  >
                    {weight || 'Set'}
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.cellButton} ${styles.cellValue} num pressable`}
                  data-empty={!amount || undefined}
                  aria-expanded={editing === r.index}
                  onClick={() => props.onAmount(r)}
                  aria-label={timed ? `Hold for set ${n}: ${shownSeconds ?? 0} seconds. Change` : `Reps for set ${n}: ${r.reps ?? 0}. Change`}
                  data-testid={timed ? 'hold-cell' : 'reps-cell'}
                >
                  {amount || (timed ? '–' : '0')}
                </button>
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
              {editing === r.index && (
                <div className={styles.stepperRow}>
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

