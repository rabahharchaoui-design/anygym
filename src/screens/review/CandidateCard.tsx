import { EQUIPMENT_LABEL } from '../../lib/intake/options';
import { candidateMuscles, gearLine } from '../../lib/candidates/view';
import type { CandidateRecord } from '../../lib/candidates/types';
import { FitFace } from './FitFace';
import styles from './Fit.module.css';

// One candidate's review card (PLAN 3.5e, one screen since 3.5v): its own two photo demo (never
// another move's), its muscles (mini map and the primary names) and the gear it needs. PLAN 3.5i:
// the whole card washes accent as it goes right (approve) and red as it goes left (wrong), and a
// "Check carefully" card says why.
export function CandidateCard({ c, under, note, onMap, onInfo }: { c: CandidateRecord; under: boolean; note?: string; onMap: () => void; onInfo: () => void }) {
  return (
    <FitFace
      demo={{ webp: c.images.webp, jpg: c.images.jpg }}
      none="Photos when you are back online"
      muscles={candidateMuscles(c)}
      musclesTestId="candidate-muscles"
      line={gearLine(c, EQUIPMENT_LABEL)}
      lineTestId="candidate-gear"
      strong
      under={under}
      onMap={onMap}
      onInfo={onInfo}
      note={
        note && (
          <p className={styles.note} data-testid={under ? undefined : 'candidate-note'}>
            <b>Check carefully.</b> {note}
          </p>
        )
      }
    />
  );
}
