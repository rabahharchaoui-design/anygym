// One way to switch gyms everywhere (PLAN 3.9): the gym sheet on Today, the day list and Run, and
// Make active in Settings. No workout in progress, or nothing in it changes: the switch is the tap.
// Otherwise the preview comes first and the switch waits for "Switch gym". Always with Undo.
import { useRef, useState } from 'react';
import { GymMissingError, SwitchStaleError, SwitchUndoStaleError, previewGymSwitch, switchGym, undoGymSwitch, type SwitchPreview, type SwitchReceipt } from '../../db/gymSwitch';
import { SwapPendingError } from '../../db/swaps';
import { WorkoutFinishedError } from '../../db/workouts';
import { logQueue } from '../../lib/logQueue';
import type { ToastMessage } from '../../ui/Toast';
import type { Gym } from '../../db/types';

let seq = 0;
const toastOf = (text: string, extra: Partial<ToastMessage> = {}): ToastMessage => ({ id: ++seq + 1_000_000, text, ...extra });

/** The switch waiting for its confirm: the gym and what will change in the workout. */
export type PendingSwitch = { gym: Pick<Gym, 'id' | 'name'>; preview: SwitchPreview };

export type GymSwitch = {
  pending: PendingSwitch | null;
  busy: boolean;
  /** One tap on a gym. Resolves true when it switched, false when it waits for the confirm or failed. */
  pick: (gym: Pick<Gym, 'id' | 'name'>) => Promise<boolean>;
  confirm: () => Promise<boolean>;
  cancel: () => void;
};

/** Runs the write in the workout's queue (Finish waits for it); null: Finish closed the workout. */
const tracked = <T,>(sessionId: string | undefined, write: () => Promise<T>): Promise<T> | null => (sessionId ? logQueue.mutate(sessionId, write) : write());

const failWords = (err: unknown): string =>
  err instanceof SwapPendingError
    ? 'A set is still saving. Try again in a moment.'
    : err instanceof WorkoutFinishedError
      ? 'That workout is already finished'
      : err instanceof GymMissingError
        ? 'That gym was deleted'
        : 'Could not switch gyms. Try again.';

export function useGymSwitch(onToast: (t: ToastMessage) => void, fromName: () => string | undefined): GymSwitch {
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const undo = (r: SwitchReceipt, backTo: string | undefined) => {
    const write = tracked(r.workout?.sessionId, () => undoGymSwitch(r));
    if (!write) return onToast(toastOf('That workout is already finished'));
    write.then(
      () => onToast(toastOf(backTo ? '' : 'Switched back', backTo ? { lead: 'Back at', subject: backTo } : {})),
      (err: unknown) =>
        onToast(toastOf(err instanceof SwitchUndoStaleError ? 'You logged a set since, so the switch stays' : err instanceof WorkoutFinishedError ? 'That workout is already finished' : 'Could not switch back')),
    );
  };

  const commit = async (gym: Pick<Gym, 'id' | 'name'>, preview: SwitchPreview): Promise<boolean> => {
    const backTo = fromName();
    try {
      const write = tracked(preview.workout?.sessionId, () => switchGym(gym.id, preview.workout?.fp ?? null));
      if (!write) throw new WorkoutFinishedError();
      const receipt = await write;
      setPending(null);
      const shown = toastOf('', { lead: 'Now at', subject: gym.name, action: { label: 'Undo', onPress: () => undo(receipt, backTo) } });
      onToast(shown);
      return true;
    } catch (err) {
      if (err instanceof SwitchStaleError) {
        // The workout changed since the preview: look again, and ask when something changes.
        const fresh = await previewGymSwitch(gym.id).catch(() => null);
        if (fresh && !fresh.workout?.changes.length) return commit(gym, fresh);
        if (fresh) {
          setPending({ gym, preview: fresh });
          return false;
        }
      }
      setPending(null);
      onToast(toastOf(failWords(err)));
      return false;
    }
  };

  const guard = async (run: () => Promise<boolean>) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    try {
      return await run();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return {
    pending,
    busy,
    pick: (gym) =>
      guard(async () => {
        let preview: SwitchPreview;
        try {
          preview = await previewGymSwitch(gym.id);
        } catch (err) {
          onToast(toastOf(failWords(err)));
          return false;
        }
        if (preview.workout?.changes.length) {
          setPending({ gym, preview });
          return false;
        }
        return commit(gym, preview);
      }),
    confirm: () => guard(async () => (pending ? commit(pending.gym, pending.preview) : false)),
    cancel: () => setPending(null),
  };
}
