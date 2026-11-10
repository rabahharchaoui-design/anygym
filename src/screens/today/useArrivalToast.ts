// A message handed to Today by the screen before it ("Workout saved · 6 sets", "Plan saved"), shown
// once. After Finish it carries Undo: the workout opens again and the plan goes back to where it was
// (SPEC 13.1); after a plan was chosen, Undo puts back the plan that was in use (PLAN 2.2d).
// Moved out of TodayScreen as it was (PLAN 3.5g, code organization), behavior unchanged.
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ToastMessage } from '../../ui/Toast';
import type { useNav } from '../../ui/nav';
import { undoChoosePlan } from '../../db/planState';
import type { PlanState } from '../../db/types';
import { reopenWorkoutWithPending } from '../../db/workouts';
import { restorePending } from '../../lib/finishPending';
import { logQueue } from '../../lib/logQueue';

type ArrivalState = { toast?: string; undo?: { sessionId: string }; planUndo?: { chosen: PlanState; previous: PlanState | null } } | null;

export function useArrivalToast(setToast: (t: ToastMessage | null) => void, go: ReturnType<typeof useNav>): void {
  const location = useLocation();
  const navigate = useNavigate();
  const undoing = useRef(false);
  useEffect(() => {
    const st = location.state as ArrivalState;
    const text = st?.toast;
    if (!text) return;
    const undo = st?.undo;
    const planUndo = st?.planUndo;
    const id = Date.now();
    setToast({
      id,
      text,
      // "Plan saved" (PLAN 2.2d): Undo puts back the plan that was in use, only if nothing moved since.
      ...(planUndo
        ? {
            action: {
              label: 'Undo',
              onPress: () => {
                setToast(null);
                undoChoosePlan(planUndo.chosen, planUndo.previous ?? undefined)
                  .then((ok) => !ok && setToast({ id: Date.now(), text: 'Could not undo. The plan is saved.' }))
                  .catch(() => setToast({ id: Date.now(), text: 'Could not undo. The plan is saved.' }));
              },
            },
          }
        : {}),
      ...(undo
        ? {
            action: {
              label: 'Undo',
              onPress: () => {
                if (undoing.current) return;
                undoing.current = true;
                setToast(null);
                reopenWorkoutWithPending(undo.sessionId)
                  .then(({ ok, pending }) => {
                    if (ok) {
                      // The rows still to do and the added rows come back exactly as they were (PLAN 2.0c).
                      if (pending) restorePending(pending);
                      // Finish closed its log queue; the workout is active again, so ✓ logs again (PLAN 1.7h).
                      logQueue.reopen(undo.sessionId);
                      go(`/workout/${undo.sessionId}`, { kind: 'push' });
                    } else setToast({ id: Date.now(), text: 'Could not undo. The workout is saved.' });
                  })
                  .catch(() => setToast({ id: Date.now(), text: 'Could not undo. The workout is saved.' }))
                  .finally(() => (undoing.current = false));
              },
            },
          }
        : {}),
    });
    navigate('.', { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, navigate, go]);
}
