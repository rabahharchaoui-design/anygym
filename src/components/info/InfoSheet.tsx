import type { ReactNode } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import type { GlossaryEntry } from '../../data/glossary';
import styles from './Info.module.css';

type Props = { entry: GlossaryEntry; open: boolean; onClose: () => void; art?: ReactNode; showWeight?: boolean };

/** SPEC 13.7 info sheet: the picture, one or two plain sentences, and the weight line. */
export function InfoSheet({ entry, open, onClose, art, showWeight = true }: Props) {
  const Art = entry.illustration;
  return (
    <Sheet open={open} onClose={onClose} label={entry.term} scroll>
      <div className={styles.body} data-testid={`info-${entry.id}`}>
        {art ? (
          <div className={styles.art} data-testid="info-art" data-square="">
            {art}
          </div>
        ) : (
          Art && (
            <div className={styles.art} data-testid="info-art">
              <Art />
            </div>
          )
        )}
        <h2 className={styles.term}>{entry.term}</h2>
        <div className={styles.sentences}>
          {entry.sentences.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
        {showWeight && entry.weightLine && (
          <p className={`${styles.weight} num`} data-testid="info-weight">
            {entry.weightLine}
          </p>
        )}
        <Button onClick={onClose}>Got it</Button>
      </div>
    </Sheet>
  );
}
