import { useState } from 'react';
import { runDiagFile, useRunDiagAvailable } from '../../hooks/runDiag';
import { shareOrDownload } from '../../lib/shareFile';
import { Button } from '../../ui/Button';
import share from '../run/Share.module.css';

/**
 * PLAN 4.4d (2): every position of this run and what the run did with it, as a JSON file through
 * the share sheet. Shown only after the 5 taps on the version in Settings, and only for a run that
 * has a log. Nothing leaves the phone unless this is tapped.
 */
export function RunDiagExport({ runId, startedAt }: { runId: string; startedAt: number }) {
  const available = useRunDiagAvailable(runId);
  const [note, setNote] = useState('');
  if (!available.data) return null;
  const exportLog = async () => {
    try {
      const outcome = await shareOrDownload(await runDiagFile(runId, startedAt));
      setNote(outcome === 'downloaded' ? 'Saved to your phone' : outcome === 'needs-tap' ? 'Tap again to share' : '');
    } catch {
      setNote('Could not read the diagnostics');
    }
  };
  return (
    <>
      <div className={share.row}>
        <Button variant="secondary" onClick={() => void exportLog()} data-testid="run-export-diag">
          Export diagnostics
        </Button>
      </div>
      {note && (
        <p className={share.note} role="status" data-testid="run-diag-note">
          {note}
        </p>
      )}
    </>
  );
}
