import type { ToastMessage } from '../../ui/Toast';

/** One counter for toast ids and the "Nice. Next" chip's ids. */
let toastSeq = 0;
export const nextToastId = (): number => ++toastSeq;
export const toastOf = (text: string, action?: ToastMessage['action'], subject?: string, lead?: string): ToastMessage => ({ id: ++toastSeq, text, action, ...(subject ? { subject } : {}), ...(lead ? { lead } : {}) });
