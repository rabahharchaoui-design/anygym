import { useMemo } from 'react';
import { infoForExercise } from '../../data/exerciseInfo';
import { beatLine } from '../../lib/progression';
import { setLine } from '../../lib/planWorkout';
import { setNumbers, typeOfSet, type PendingRow } from '../../lib/setTable';
import { workSetCount } from '../../lib/workSets';
import type { ExerciseRows } from './useExerciseRows';
import type { useRowEditors } from './useRowEditors';

/** The words and flags the exercise view shows: the target line, the guides, the status under the table and what the weight sheet is titled. */
export function useExerciseText(rx: ExerciseRows, picking: ReturnType<typeof useRowEditors>['picking']) {
  const { w, exerciseId, kind, progression, logged, rows, current, entry, workDone, blockedOf, rowById } = rx;
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
  // 3.5f round 3 (M11): a hold's line names the hold the row is prefilled with (setTable.pendingRows).
  const beat = progression && lastTime ? (kind === 'timed' && current?.seconds && !current.edited ? `Beat last time: ${current.seconds} s` : beatLine(progression)) : null;
  const why = progression && (progression.next.kind === 'increase' || progression.next.kind === 'reset' || progression.next.kind === 'converted' || progression.next.kind === 'coach' || progression.next.atTop || !progression.next.load) ? progression.next.reason : '';
  // PLAN 3.8: a first timer's number, set from their light test set (SPEC 15).
  const yourNumber = progression && !lastTime && progression.next.kind === 'first_time' && progression.next.load && logged.length > 0 && rows.length > 0 ? progression.next.reason : '';
  const allDone = rows.length === 0 && logged.some((s) => s.kind === 'work');
  const notes = [entry?.note, w.noteOf(exerciseId)].filter((n): n is string => !!n);
  const note = notes.join(' · ');
  // SPEC 4.4: photos, muscles and cues only when the match is sure (SPEC 4.3). One object per
  // exercise and note (PLAN 2.2d), so the memoized parts below keep it between taps.
  const notesKey = JSON.stringify(notes);
  const info = useMemo(() => infoForExercise(exerciseId, JSON.parse(notesKey) as string[]), [exerciseId, notesKey]);
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
      ? `All ${workSetCount(logged)} ${workSetCount(logged) === 1 ? 'set' : 'sets'} done`
      : entry
        ? setLine(entry, setNumber)
        : `Set ${setNumber}`;
  // "Pick a weight" is what the accent Pick button already says (PLAN 2.2b); any other reason (a bar
  // weight to set first, a pick in the other unit) stays as a quiet line. Screen readers hear all.
  const statusText = status && current ? `${rowName(current)}: ${status}` : '';
  const statusShown = !!status && status !== 'Pick a weight';
  return { lastTime, showGuide, beat, why, yourNumber, allDone, note, info, status, pickRow, rowName, targetText, statusText, statusShown };
}
