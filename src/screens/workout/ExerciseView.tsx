import { Suspense, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { SetKind, WorkoutSet } from '../../db/types';
import { addExtraSet } from '../../lib/extraSets';
import { lastTimeNote, loggedLastTime, typeOfSet, type PendingRow } from '../../lib/setTable';
import { logQueue } from '../../lib/logQueue';
import { warmAudio } from '../../lib/tone';
import { Button } from '../../ui/Button';
import { SetTable } from './SetTable';
import { SetTypeSheet } from './SetTypeSheet';
import { ExerciseHead } from './ExerciseHead';
import { demoFor } from '../../data/exerciseInfo';
import { useDemoPhotos } from '../../hooks/usePhotos';
import { useMedia } from '../../hooks/useMedia';
import { useAfterPaint } from '../../hooks/useAfterPaint';
import { WeightSheet, type WeightPick } from './WeightSheet';
import type { Workout } from './useWorkout';
import { ExerciseExtras } from './ExerciseExtrasLazy';
import { useExerciseRows } from './useExerciseRows';
import { useExerciseText } from './useExerciseText';
import { useLogRow } from './useLogRow';
import { useRowEditors } from './useRowEditors';
import { useRowTypes } from './useRowTypes';
import styles from './ExerciseView.module.css';
import frame from './Workout.module.css';

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
  /** 3.5b round 4 (M7, M8): open another exercise (a Quick group's next member). */
  onOpen?: (exerciseId: string) => void;
  onNotice: (text: string, retry?: () => void) => void;
  /** PLAN 2.2d: a logged set removed from its row (swipe or Remove set): deleted with Undo, its row goes. */
  onRemoveSet: (set: WorkoutSet) => void;
  /** A short message with Undo (a row still to do was removed). */
  onUndoable: (text: string, undo: () => void) => void;
};

/** Screens too short for the demo hero above the set table (gate s2 round 2). */
const SHORT_SCREEN = '(max-height: 600px)';

/**
 * The exercise view (SPEC 20.2, 21.1): the demo tile, name and note, "Last time", and the set
 * table already filled with today's targets. Logging a set is one tap on its ✓.
 */
export function ExerciseView({ w, sessionId, exerciseId, onLogged, onEditSet, onAskLoadType, onMenu, onSwipeNext, onNotice, onRemoveSet, onUndoable }: Props) {
  const rx = useExerciseRows(w, sessionId, exerciseId);
  const { gym, name, entry, groupNext, kind, bar, progression, logged, timed, slots, slotOf, rows, current, sending, fresh, running, liveSeconds, blockedOf, testSet, idOf } = rx;
  // Offline and never kept, the photos cannot show: the compact header instead (gate s2), never a
  // broken or empty picture.
  const baseDemo = demoFor(exerciseId);
  const photos = useDemoPhotos(baseDemo);
  const photosOk = !!baseDemo && photos.kind !== 'none';
  // The heavy parts below the table mount once the first frame is painted (PLAN 2.2d).
  const painted = useAfterPaint();
  // Short screens (the 360 x 640 small Android, the 320 x 568 floor): no room for a hero above five
  // rows (SPEC 13.5, PLAN 2.2b: the whole set table in the first screen), so the compact header
  // with the demo as its tile instead; a tap opens the form sheet with the photos.
  const short = useMedia(SHORT_SCREEN);
  const hasDemo = photosOk && !short;
  // The rest tone's audio context, made while idle so the first ✓ stays light (PLAN 2.2d).
  useEffect(() => warmAudio(), []);

  const { log, toggleWatch } = useLogRow({ rx, onLogged, onNotice });
  const ed = useRowEditors({ rx, onNotice });
  const { picking, setPicking, editing, setEditing, nudge, editRow, latest, toggleEditor, applyWeight, copyLast, onBlocked } = ed;
  const { typing, setTyping, pickType, claimRow, removeRow, latestRemove, removeLogged, removeFromSheet } = useRowTypes({ rx, ed, onNotice, onRemoveSet, onUndoable });
  const { lastTime, showGuide, beat, why, yourNumber, allDone, note, info, status, pickRow, rowName, targetText, statusText, statusShown } = useExerciseText(rx, picking);

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

  return (
    <main className={frame.exMain} data-hero={hasDemo ? '' : undefined} data-testid={`exercise-${exerciseId}`} aria-label={name} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <ExerciseHead name={name} kind={kind} info={info} photosOk={photosOk} hasDemo={hasDemo} note={note} targetText={targetText} entry={entry} onMenu={onMenu} />

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
            lastTimeOf={(i) => loggedLastTime(w.lastSetsOf(exerciseId), logged.map((s) => s.kind), i)}
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
            repsCue={!!current && !slots[slotOf(current)]?.repsEdited}
            onBlocked={onBlocked}
            nudge={nudge}
            hideSwipeHint={allDone}
            onRemove={removeRow}
            onClaim={claimRow}
            onRemoveId={(id) => latestRemove.current(id)}
            onRemoveLogged={removeLogged}
            removable={!logQueue.closed(sessionId)}
            keyOf={(r) => slots[slotOf(r)]?.id ?? `i${r.index}`}
            recordOf={w.recordOf}
            waiting={!!groupNext}
            underRows={
              <>
                {/* First time: one quiet line under the rows, never a guessed weight (SPEC 6 rule 5).
                    Under the rows, so it never moves a ✓ (PLAN 2.0e). */}
                {/* Hints never stack (gate P5): the amber reason under the table wins. */}
                {showGuide && !statusShown && progression && (
                  <p className={`${styles.firstTime} num`} data-testid="set-guide">
                    {progression.next.reason}
                  </p>
                )}
                {yourNumber && !statusShown && (
                  <p className={`${styles.firstTime} num`} data-testid="coach-number">
                    {yourNumber}
                  </p>
                )}
                {/* 3.5d (10): the next member's button is in the bottom action bar (WorkoutScreen), not down here. */}
                {/* PLAN 3.5g: the Easy / Good / Hard question is asked on the day list row only (SPEC 15:
                    one optional tap after the last set), never here where the automatic return yanks it away. */}
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
          <p className={statusShown ? styles.status : frame.srOnly} data-testid="set-status" role="status">
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
          sub={!pickRow ? '' : pickRow.type === 'warmup' ? 'Just this warm up' : testSet(pickRow) ? 'Just this test set: pick something light' : rows.some((r) => r.index > pickRow.index && r.type !== 'warmup') ? 'This set and the ones below' : 'This set'}
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
        onRemove={removeFromSheet}
      />

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
