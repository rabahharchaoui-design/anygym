import { useCallback, useRef } from 'react';
import { exportBackup, recordBackup } from '../../db/backup';
import { backedUpIds, backupFileName, serializeBackup } from '../../lib/backup';
import { shareOrDownload } from '../../lib/shareFile';
import { TAP_GUARD_MS } from '../../hooks/useTapGuard';
import type { ToastMessage } from '../../ui/Toast';

let seq = 0;
const toast = (text: string, action?: ToastMessage['action']): ToastMessage => ({ id: 1_000_000 + ++seq, text, ...(action ? { action } : {}) });

/**
 * "Back up" (SPEC 9.1), shared by Settings and the Today reminder: builds the file, opens the share
 * sheet (or saves it), records when, and says what happened in a toast.
 */
export function useBackup(notify: (t: ToastMessage) => void): () => Promise<void> {
  const busy = useRef(false);
  // A backup is quick: a double tap must not make a second file once the first is already out.
  const lastStart = useRef(-Infinity);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const deliver = useCallback(async (file: File, ids: string[]) => {
    const outcome = await shareOrDownload(file);
    if (outcome === 'cancelled') return;
    if (outcome === 'needs-tap') {
      notifyRef.current(toast('Your backup is ready', { label: 'Share', onPress: () => void deliver(file, ids) }));
      return;
    }
    try {
      await recordBackup(ids);
    } catch {
      // The file is out; only the reminder date could not be saved.
    }
    notifyRef.current(toast(outcome === 'shared' ? 'Backup ready' : 'Backup saved'));
  }, []);

  return useCallback(async () => {
    const now = performance.now();
    if (busy.current || now - lastStart.current < TAP_GUARD_MS) return;
    busy.current = true;
    lastStart.current = now;
    try {
      const now = Date.now();
      const backup = await exportBackup(undefined, now);
      const text = serializeBackup(backup);
      await deliver(new File([text], backupFileName(now), { type: 'application/json' }), backedUpIds(backup));
    } catch {
      notifyRef.current(toast('Could not make the backup. Try again.'));
    } finally {
      busy.current = false;
    }
  }, [deliver]);
}
