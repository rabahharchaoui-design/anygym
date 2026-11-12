import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { UNDO_MS } from '../lib/undoQueue';

/** How long a plain message stays up. */
export const TOAST_MS = 3000;

/** SPEC 13.1: a toast with an action (Undo, Try again) stays for 5 s, a plain message 3 s. */
export const toastLife = (toast: { action?: unknown }): number => (toast.action ? UNDO_MS : TOAST_MS);

/**
 * Clears a screen's toast (or any message with an id) once it has been up for its life. Only that
 * same message is cleared: a newer one that replaced it in the meantime starts its own clock.
 */
export function useToastTimeout<T extends { id: number; action?: unknown }>(
  toast: T | null,
  setToast: Dispatch<SetStateAction<T | null>>,
  life: (toast: T) => number = toastLife,
): void {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast((now) => (now?.id === toast.id ? null : now)), life(toast));
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);
}
