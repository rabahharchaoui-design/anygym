// Behind an idea card's info button (PLAN 3.5f (5), calm card face): what the face leaves out. The
// style and its effort, the full numbers line (pairs and rounds), the card's reason when it is short,
// and every piece of gear it uses, in words with small drawings.
import { metaLine, shortLine, type Concept } from '../../lib/quick';
import { EQUIPMENT_LABEL } from '../../lib/intake/options';
import { Sheet } from '../../ui/Sheet';
import { EquipmentArt } from '../intake/EquipmentArt';
import curate from '../../components/deck/Curate.module.css';
import styles from './IdeaSheet.module.css';
import { cap } from '../../lib/words';

const EFFORT_WORD = { 1: 'Easy', 2: 'Medium', 3: 'Hard' } as const;

/** At most this many gear drawings; every piece is said in words. */
const GEAR_ART = 4;

export function IdeaSheet({ concept, title, open, onClose }: { concept: Concept; title: string; open: boolean; onClose: () => void }) {
  const gear = [...new Set(concept.gear)];
  const list = gear.map((g) => EQUIPMENT_LABEL[g].toLowerCase()).join(', ');
  const words = cap(list);
  const short = shortLine(concept);
  return (
    <Sheet open={open} onClose={onClose} label={`More about ${title}`}>
      {open && (
        <div className={curate.sheet} data-testid="idea-sheet">
          <h2 className={curate.sheetTitle}>{title}</h2>
          <div className={styles.kind}>
            <span className={styles.styleChip} data-testid="style-chip" data-kind={concept.chip}>
              {concept.chip}
            </span>
            <span className={styles.effortWrap}>
              <span className={styles.effort} role="img" aria-label={`Effort ${concept.effort} of 3`} data-testid="effort" data-level={concept.effort}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={styles.dot} data-on={n <= concept.effort || undefined} />
                ))}
              </span>
              <span aria-hidden="true">{EFFORT_WORD[concept.effort]}</span>
            </span>
          </div>
          <p className={curate.factWhy}>{concept.line}</p>
          <ul className={curate.rows}>
            <li className="num" data-testid="idea-meta">
              {metaLine(concept.items, concept.minutes)}
            </li>
            {short && <li data-testid="concept-short">{short}</li>}
            <li className={styles.gear} data-testid="concept-gear" aria-label={gear.length ? `Uses ${list}` : 'No equipment'}>
              {gear.slice(0, GEAR_ART).map((g) => (
                <EquipmentArt key={g} id={g} className={styles.gearIcon} />
              ))}
              <span aria-hidden="true">{gear.length ? words : 'No equipment'}</span>
            </li>
          </ul>
        </div>
      )}
    </Sheet>
  );
}
