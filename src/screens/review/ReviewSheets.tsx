import { useEffect, useState, type ReactNode } from 'react';
import { MuscleMap } from '../../components/muscles/MuscleMap';
import type { MuscleMapData } from '../../lib/muscles';
import { canDecide, type Verdict } from '../../lib/review';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Sheet } from '../../ui/Sheet';
import cand from './CandidateReview.module.css';
import styles from './Fit.module.css';

// The one screen review's sheets (PLAN 3.5v): everything that used to make the page long now opens
// from the card: the full muscle map, all the cues, the menu (Export) and the core review's Fix.

function Titled({ title, name, children }: { title: string; name: string; children: ReactNode }) {
  return (
    <div className={cand.sheet}>
      <h2 className={cand.sheetTitle}>{title}</h2>
      <p className={cand.sheetName}>{name}</p>
      {children}
    </div>
  );
}

/** The full map: Front and Back, Male and Female, tap a muscle to name it. */
export function MapSheet({ open, onClose, name, muscles }: { open: boolean; onClose: () => void; name: string; muscles: MuscleMapData | null }) {
  return (
    <Sheet open={open} onClose={onClose} label="Muscle map" scroll>
      <Titled title="Muscle map" name={name}>
        <MuscleMap data={muscles} />
      </Titled>
    </Sheet>
  );
}

/** Everything the card's one line stands for. */
export function InfoSheet({ open, onClose, name, children }: { open: boolean; onClose: () => void; name: string; children: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} label="About this exercise" scroll>
      <Titled title="About this exercise" name={name}>
        {children}
      </Titled>
    </Sheet>
  );
}

/** The top bar's menu: the rare actions, out of the way of the swipe. */
export function MenuSheet({ open, onClose, head, children }: { open: boolean; onClose: () => void; head?: string; children: ReactNode }) {
  return (
    <Sheet open={open} onClose={onClose} label="More">
      <div className={styles.menu} data-testid="review-menu-sheet">
        {head && <p className={`${styles.menuHead} num`}>{head}</p>}
        {children}
      </div>
    </Sheet>
  );
}

/**
 * Fix for a catalog exercise (long press, or the Fix button): the same decisions as ever. One tap
 * for a wrong demo or wrong muscles; for the cues, the note that says what they should say.
 */
export function CoreFixSheet({ open, onClose, name, note: saved, onSave }: { open: boolean; onClose: () => void; name: string; note: string; onSave: (verdict: Verdict, note: string) => void }) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} label="Fix">
      <Titled title="What needs fixing?" name={name}>
        <div className={cand.reasons} role="group" aria-label="What is wrong">
          <Chip label="Wrong demo" picked={false} onPress={() => onSave('wrong-demo', '')} testId="fix-wrong-demo" />
          <Chip label="Wrong muscles" picked={false} onPress={() => onSave('wrong-muscles', '')} testId="fix-wrong-muscles" />
        </div>
        <label className={cand.noteBox}>
          What should the cues say?
          <textarea className={cand.textarea} value={note} rows={3} onChange={(e) => setNote(e.target.value)} data-testid="review-note" />
        </label>
        <Button variant="primary" disabled={!canDecide('fix-cues', note)} disabledReason="Write a note first." onClick={() => onSave('fix-cues', note)}>
          Save cue note
        </Button>
      </Titled>
    </Sheet>
  );
}
