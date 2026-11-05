// The time budget on the day list (PLAN 3.6, SPEC 7.4): the sheet's inputs, Apply with Undo, and the
// quiet line. When the intake's minutes are under the day's estimate the list offers the sheet once
// per day; it never trims on its own.
import { useMemo, useState } from 'react';
import { getProfile } from '../../db/intake';
import { TrimStaleError, rememberBudget, setWorkoutTrim, undoWorkoutTrim } from '../../db/timeBudget';
import { WorkoutFinishedError } from '../../db/workouts';
import { useLive } from '../../hooks/useLive';
import { slotOf } from '../../lib/swap';
import { AS_PLANNED, budgetLabel, fitWords, type TrimResult } from '../../lib/timeBudget';
import type { TimeLine } from './DayList';
import type { Workout } from './useWorkout';

/** localStorage: the local day ("2026-11-06") the offer was last answered on. */
export const TIME_OFFER_KEY = 'anygym-time-offer';

const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

function answeredToday(): boolean {
  try {
    return localStorage.getItem(TIME_OFFER_KEY) === today();
  } catch {
    return false;
  }
}

function markAnswered(): void {
  try {
    localStorage.setItem(TIME_OFFER_KEY, today());
  } catch {
    // Storage full or blocked: the line may show again, never a failure.
  }
}

type Undoable = (text: string, undo: () => void) => void;

export function useTimeBudget(w: Workout, sessionId: string, opts: { onUndoable: Undoable; onNotice: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [answered, setAnswered] = useState(answeredToday);
  const profile = useLive(() => getProfile(), []);
  const intakeMin = profile.data?.intake?.minutes;
  const s = w.session;
  const trim = s?.trim;
  const swaps = s?.swaps;
  const setsKey = w.sets.map((x) => x.exerciseId).join('|');
  // Sets logged per plan exercise (a swapped slot counts the sets of whatever filled it).
  const logged = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of setsKey ? setsKey.split('|') : []) {
      const slot = slotOf(swaps, id);
      out[slot] = (out[slot] ?? 0) + 1;
    }
    return out;
  }, [setsKey, swaps]);
  const available = !!w.day && !w.isQuick && w.ready;
  const initial = s?.timeBudgetMin ?? w.gym?.timeBudgetMin ?? intakeMin;

  const answer = () => {
    markAnswered();
    setAnswered(true);
  };

  const apply = async (minutes: number, r: TrimResult) => {
    setOpen(false);
    answer();
    const gymId = w.gym?.id;
    if (!r.trim && !trim) {
      if (gymId) rememberBudget(gymId, minutes).catch(() => undefined);
      return;
    }
    try {
      const receipt = await setWorkoutTrim(sessionId, minutes, r.trim);
      const text = r.trim ? fitWords(r) : 'Back to the full day';
      opts.onUndoable(text, () => {
        undoWorkoutTrim(sessionId, receipt).catch((e) => opts.onNotice(e instanceof WorkoutFinishedError ? e.message : 'Could not undo that. Try again.'));
      });
    } catch (e) {
      opts.onNotice(e instanceof TrimStaleError ? 'An exercise it cuts has sets now. Pick again.' : e instanceof WorkoutFinishedError ? e.message : 'Could not save that. Try again.');
    }
  };

  const minutes = w.minutes;
  let line: TimeLine | null = null;
  if (available && trim && s?.timeBudgetMin !== undefined) {
    line = { text: `Shortened to fit ${budgetLabel(s.timeBudgetMin)} today`, action: 'Change', onAction: () => setOpen(true) };
  } else if (available && !trim && !answered && w.sets.length === 0 && intakeMin !== undefined && intakeMin < AS_PLANNED && minutes !== undefined && minutes > intakeMin) {
    line = {
      text: `Longer than your ${intakeMin} min`,
      action: 'Make it fit',
      onAction: () => {
        answer();
        setOpen(true);
      },
      onDismiss: answer,
    };
  }

  return {
    available,
    open: () => setOpen(true),
    line,
    sheet: w.day
      ? {
          open: open && available,
          onClose: () => setOpen(false),
          day: w.day,
          weekIndex: s?.weekIndex ?? 0,
          initial,
          current: trim,
          logged,
          onApply: (m: number, r: TrimResult) => void apply(m, r),
        }
      : null,
  };
}
