import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gym, Load, WorkoutSet } from '../../db/types';
import { newId } from '../../db/ids';
import { machineStartFor } from '../../db/gyms';
import { barbellLoad, bodyweightLoad, formatSetLine, plateMachineLoad, timedLoad } from '../../lib/load';
import { formatNext, formatSets, formatWhen, type Progression } from '../../lib/progression';
import { setLine, targetSecondsOf, type WorkoutEntry } from '../../lib/planWorkout';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../../lib/drafts';
import { STOPPED, captureHold, elapsedMs, wholeSeconds, type Stopwatch } from '../../lib/timer';
import { useNow } from '../../hooks/useNow';
import { useTapGuard } from '../../hooks/useTapGuard';
import { Hint } from '../../components/hint/Hint';
import { barIdFor, currentLoad, machineIdFor, prefillLoad } from './exerciseLoad';
import { RepsStepper } from './RepsStepper';
import { SetLoadInput } from './SetLoadInput';
import styles from './Workout.module.css';

export type SetDraft = { id: string; reps?: number; seconds?: number; load: Load };

type Props = {
  /** The workout; drafts are kept per workout and exercise. */
  sessionId: string;
  exerciseId: string;
  exerciseName: string;
  loadType: Load['kind'];
  gym: Gym;
  /** This exercise's sets in this workout, logged order. */
  sets: WorkoutSet[];
  /** "Last time" and "Next" (SPEC 6): the guide lines and the prefill. */
  progression: Progression;
  onLog: (draft: SetDraft) => Promise<boolean>;
  onEditSet: (set: WorkoutSet) => void;
  /** The sticky bar at the bottom of the workout screen; Log set renders there so it is always in reach. */
  actionSlot?: HTMLElement | null;
  /** Plan workouts (PLAN 1.10): target sets, reps or hold, rest and the plan's note. */
  entry?: WorkoutEntry;
};

export const DEFAULT_REPS = 10;

/** What the input shows before anything is picked: only loads that are certain (an empty bar, just you). */
function startingLoad(loadType: Load['kind'], gym: Gym, exerciseId: string, exerciseName: string): Load | null {
  switch (loadType) {
    case 'barbell':
      return barbellLoad(gym.bars[barIdFor(exerciseName)], [], gym.collars, gym.unit);
    case 'plate_machine':
      return plateMachineLoad(machineStartFor(gym, machineIdFor(exerciseId, exerciseName)), [], gym.unit);
    case 'bodyweight':
      return bodyweightLoad(gym.unit);
    case 'timed':
      return timedLoad(gym.unit);
    default:
      return null;
  }
}
/**
 * The two short lines under the name (SPEC 6, 13.5): "Last time (Tue): 10 × 185 · 10 × 185 lb"
 * and "Next: 10 × 185 lb · Aim for 10, 10 or better". First time: just the honest advice, until a set is logged.
 */
function GuideLines({ progression, logged }: { progression: Progression; logged: number }) {
  const { lastTime, next } = progression;
  if (!lastTime) {
    // The first time advice is for picking the first weight; once a set is logged the strip says the rest.
    if (logged > 0) return null;
    return (
      <p className={`${styles.guide} num`} data-testid="set-guide">
        {next.reason}
      </p>
    );
  }
  const target = formatNext(next);
  return (
    <div className={styles.guides}>
      <p className={`${styles.guide} num`} data-testid="set-guide">
        Last time ({formatWhen(lastTime.date, Date.now())}): {formatSets(lastTime.sets)}
      </p>
      <p className={`${styles.guide} num`} data-testid="set-next">
        {target ? (
          <>
            <span className={styles.nextTarget}>Next: {target}</span>
            <span className={styles.nextReason}> · {next.reason}</span>
          </>
        ) : (
          next.reason
        )}
      </p>
    </div>
  );
}

/** A rep target as one number for the stepper: the bottom of a range. */
const repsNumber = (r: Progression['next']['reps']): number | undefined => (r === null ? undefined : typeof r === 'number' ? r : r[0]);

/**
 * SPEC 5.1 / 13.5 set card, sized to fit one screen: name and set number, one guide line, the
 * logged sets as a strip, the compact load input, reps, and Log set in the thumb zone. Weight and
 * reps are prefilled from the last set (this workout, else the last one), so a repeat is one tap.
 */
export function SetCard({ sessionId, exerciseId, exerciseName, loadType, gym, sets, progression, onLog, onEditSet, actionSlot, entry }: Props) {
  const last = sets[sets.length - 1];
  const { next, perSet } = progression;
  // A saved draft (picked before a collapse or reload) wins; then the last logged set mid workout;
  // else the engine's target. A draft whose id is already logged is stale and ignored.
  const [draft, setDraftState] = useState<Draft>(() => {
    const saved = loadDraft(sessionId, exerciseId);
    if (saved && !sets.some((s) => s.id === saved.id)) return saved;
    const load = last
      ? (prefillLoad(last.load, loadType, gym, exerciseId, exerciseName) ?? startingLoad(loadType, gym, exerciseId, exerciseName))
      : (perSet[0]?.target.load ?? next.load ?? startingLoad(loadType, gym, exerciseId, exerciseName));
    const reps = (last ? last.reps : (perSet[0]?.target.reps ?? repsNumber(next.reps))) ?? DEFAULT_REPS;
    return { id: newId(), load, plates: load?.perSide ?? [], reps };
  });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Every user change is saved at once, so a collapse, a reload or an app kill keeps it (SPEC 13.3). */
  const update = (patch: Partial<Draft>) => {
    const nextDraft = { ...draftRef.current, ...patch };
    draftRef.current = nextDraft;
    setDraftState(nextDraft);
    saveDraft(sessionId, exerciseId, nextDraft);
  };
  const busy = useRef(false);
  const timed = loadType === 'timed';
  const reps = draft.reps ?? DEFAULT_REPS;
  const watch: Stopwatch = draft.watch ?? STOPPED;
  const running = watch.startedAt !== null;
  const now = useNow(250, timed && running);

  // The load shown and logged, rebuilt through load.ts on today's equipment (bar weight, starting
  // resistance, stack step), so the diagram, the Log set label and the saved set always agree.
  const load = currentLoad(draft.load, draft.plates ?? [], loadType, gym, exerciseId, exerciseName);

  // A pick that is no longer loadable (a pin the new stack step lacks) is cleared, never rounded.
  const lost = draft.load !== null && load === null && (loadType === 'stack' || loadType === 'dumbbell_each' || loadType === 'single');
  useEffect(() => {
    if (lost) update({ load: null });
  }, [lost]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveSeconds = wholeSeconds(elapsedMs(watch, running ? Math.max(now, Date.now()) : now));
  const ready = load !== null && (timed ? liveSeconds > 0 : reps > 0);

  const log = useTapGuard(async () => {
    if (busy.current || load === null) return;
    // A running hold is stopped and read at this very moment, never a stale value.
    const { watch: stopped, seconds } = captureHold(watch, Date.now());
    if (timed ? seconds <= 0 : reps <= 0) return;
    busy.current = true;
    if (timed && running) update({ watch: stopped });
    const out: SetDraft = timed ? { id: draft.id, seconds, load } : { id: draft.id, reps, load };
    try {
      if (await onLog(out)) {
        clearDraft(sessionId, exerciseId);
        const target = perSet[sets.length + 1]?.target.reps;
        const fresh: Draft = { ...draftRef.current, id: newId(), watch: STOPPED };
        if (!timed && target !== undefined) fresh.reps = target;
        draftRef.current = fresh;
        setDraftState(fresh);
      }
    } finally {
      busy.current = false;
    }
  });

  const blocked =
    load !== null
      ? timed
        ? running
          ? null
          : 'Start the timer'
        : null
      : loadType === 'barbell'
        ? 'Set the bar weight first'
        : loadType === 'plate_machine'
          ? 'Set the starting weight first'
          : 'Pick a weight';

  const action = (
    <div className={styles.actionWrap}>
      {/* "Tap Log set when you finish the set" would contradict "Start the timer" on a timed card. */}
      {!timed && <Hint id="setCard" className={styles.actionHint} point="down" />}
      <button type="button" className={`${styles.logButton} pressable`} disabled={!ready} onClick={() => void log()}>
        {ready ? (
          <>
            Log set
            <span className={`${styles.logWhat} num`}> · {formatSetLine(timed ? { seconds: liveSeconds, load } : { reps, load })}</span>
          </>
        ) : (
          (blocked ?? 'Log set')
        )}
      </button>
    </div>
  );

  return (
    <div className={styles.setCard}>
      {entry ? (
        <PlanHead entry={entry} name={exerciseName} setNumber={sets.length + 1} />
      ) : (
        <div className={styles.setHead}>
          <h2 className={styles.cardName}>{exerciseName}</h2>
          <p className={`${styles.target} num`} data-testid="set-target">
            Set {sets.length + 1}
          </p>
        </div>
      )}
      <GuideLines progression={progression} logged={sets.length} />
      {sets.length > 0 && <SetStrip sets={sets} onEdit={onEditSet} />}

      <SetLoadInput
        loadType={loadType}
        gym={gym}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        value={load}
        plates={draft.plates}
        onChange={(picked, plates) => update(plates ? { load: picked, plates } : { load: picked })}
        watch={watch}
        onWatch={(w) => update({ watch: w })}
        compact
        targetSeconds={entry ? targetSecondsOf(entry) : undefined}
      />

      {!timed && <RepsStepper value={reps} onChange={(r) => update({ reps: r })} compact />}

      {actionSlot ? createPortal(action, actionSlot) : action}
    </div>
  );
}

/**
 * Plan card head: the full name, "Set 1 of 4 · 8 to 12 reps", then the plan's note and the day
 * plan line ("Wide stance · 4 sets × 8 to 12 · 90 s rest"). No demo image: none is certain yet.
 */
function PlanHead({ entry, name, setNumber }: { entry: WorkoutEntry; name: string; setNumber: number }) {
  return (
    <div className={styles.planHead}>
      <h2 className={styles.cardName}>{name}</h2>
      <p className={`${styles.target} num`} data-testid="set-target">
        {setLine(entry, setNumber)}
      </p>
      {(entry.note || entry.line) && (
        <p className={`${styles.planLine} num`} data-testid="set-plan">
          {entry.note && <span className={styles.planNote}>{entry.note}{entry.line ? ' · ' : ''}</span>}
          {entry.line}
        </p>
      )}
    </div>
  );
}

/** Logged sets as one row of small chips (newest last); tap one to edit it. Scrolls sideways, never down. */
export function SetStrip({ sets, onEdit }: { sets: WorkoutSet[]; onEdit: (set: WorkoutSet) => void }) {
  const ref = useRef<HTMLOListElement>(null);
  // Keep the newest chip in view.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [sets.length]);
  return (
    <ol ref={ref} className={styles.strip} aria-label="Logged sets">
      {sets.map((s, i) => (
        <li key={s.id}>
          <button
            type="button"
            className={`${styles.chip} pressable`}
            onClick={() => onEdit(s)}
            aria-label={`Set ${i + 1}${s.kind === 'warmup' ? ', warm up' : ''}: ${formatSetLine(s)}. Edit`}
            data-testid="set-row"
          >
            <span className={styles.chipPill}>
              <span className={styles.chipIndex}>{i + 1}</span>
              {s.kind === 'warmup' && <span className={styles.chipWarm}>Warm up</span>}
              <span className="num">{formatSetLine(s)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
