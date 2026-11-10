import { useEffect, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Chip } from '../../ui/Chip';
import { Button } from '../../ui/Button';
import { FIX_REASONS, FIX_WORDS, NOTE_MAX, canFix, type FixReason } from '../../lib/candidates/review';
import styles from './CandidateReview.module.css';

// Fix (PLAN 3.5e): what is wrong with a candidate, in one tap and a few words. The note stays with
// the candidate id; a Fix is never approved, so the move never shows anywhere.
export function FixSheet({ name, open, onClose, onSave }: { name: string; open: boolean; onClose: () => void; onSave: (fix: { reason: FixReason; note: string }) => void }) {
  const [reason, setReason] = useState<FixReason | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return;
    setReason(null);
    setNote('');
  }, [open]);
  const ok = canFix(reason, note);
  return (
    <Sheet open={open} onClose={onClose} label="What is wrong?">
      <div className={styles.sheet}>
        <h2 className={styles.sheetTitle}>What is wrong?</h2>
        <p className={styles.sheetName}>{name}</p>
        <div className={styles.reasons} role="group" aria-label="What is wrong">
          {FIX_REASONS.map((r) => (
            <Chip key={r} label={FIX_WORDS[r]} picked={reason === r} onPress={() => setReason(r)} testId={`fix-${r}`} />
          ))}
        </div>
        <label className={styles.noteBox}>
          {reason === 'other' ? 'A few words (needed)' : 'A few words (optional)'}
          <textarea className={styles.textarea} value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} data-testid="fix-note" />
        </label>
        <Button variant="primary" disabled={!ok} disabledReason={reason ? 'Write a few words first.' : 'Pick what is wrong first.'} onClick={() => reason && onSave({ reason, note })} data-testid="fix-save">
          Save fix
        </Button>
      </div>
    </Sheet>
  );
}
