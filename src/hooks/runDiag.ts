// The run diagnostics export for a screen (PLAN 4.4d (2)): hidden until the 5 taps on the version
// in Settings (the same door as #/review) have been tapped on this phone, then the run detail shows
// an export button for a run that has a log. Screens never open the database themselves.
import { hasDiag, readDiag } from '../db/runDiag';
import { diagDocument, diagFileName } from '../lib/run/diag';
import { diagnosticsUnlocked } from './diagUnlock';
import { useLive, type Live } from './useLive';

/** Whether the export shows for this run: unlocked and the run has a log. */
export function useRunDiagAvailable(runId: string): Live<boolean> {
  return useLive(async () => diagnosticsUnlocked() && (await hasDiag(runId)), [runId]);
}

/** The run's log as a JSON file, ready for the share sheet. */
export async function runDiagFile(runId: string, startedAt: number): Promise<File> {
  const text = diagDocument(runId, startedAt, await readDiag(runId));
  return new File([text], diagFileName(startedAt), { type: 'application/json' });
}
