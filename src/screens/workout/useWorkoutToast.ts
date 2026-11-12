import { useEffect, useState } from 'react';
import { DRAFTS_NOT_SAVED, onDraftStorageFail } from '../../lib/drafts';
import { keepUndoOnly, type ToastMessage } from '../../ui/Toast';
import { toastOf } from './workoutToast';
import { useToastTimeout } from '../../ui/useToastTimeout';

/** The workout's one toast: its timeout, the screen change that clears it, and the ways to raise it. */
export function useWorkoutToast(exerciseId: string | null) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => onDraftStorageFail(() => setToast(toastOf(DRAFTS_NOT_SAVED))), []);
  useToastTimeout(toast, setToast);

  // A screen change (list ↔ exercise) clears any toast but an Undo (gate B2): "Rest 90 s" never
  // follows the lifter onto the day list.
  useEffect(() => setToast(keepUndoOnly), [exerciseId]);

  const notice = (text: string, retry?: () => void) => setToast(toastOf(text, retry ? { label: 'Try again', onPress: retry } : undefined));
  const undoable = (text: string, undo: () => void) => {
    const shown = toastOf(text, {
      label: 'Undo',
      onPress: () => {
        setToast((cur) => (cur?.id === shown.id ? null : cur));
        undo();
      },
    });
    setToast(shown);
  };
  return { toast, setToast, notice, undoable };
}
