import type { DemoImages } from '../../lib/exerciseInfo';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { DemoStill } from './ExerciseFace';
import styles from './Curate.module.css';

// The sheets around a curate deck (PLAN 3.5f): the two more sentences behind a card's info button,
// "Show me 6" (up to six options for the slot at once, never padded), and the once only
// "Hide it for good?".

export type Fact = { name: string; why: string; more: string; rows?: string[] };

/** Behind the info button: the fact's two sentences, then the card's other details, one per line. */
export function FactSheet({ fact, onClose }: { fact: Fact | null; onClose: () => void }) {
  return (
    <Sheet open={!!fact} onClose={onClose} label={fact ? `More about ${fact.name}` : 'More'}>
      {fact && (
        <div className={styles.sheet} data-testid="fact-sheet">
          <h2 className={styles.sheetTitle}>{fact.name}</h2>
          <p className={styles.factWhy}>{fact.why}</p>
          <p className={styles.factMore} data-testid="fact-more">
            {fact.more}
          </p>
          {!!fact.rows?.length && (
            <ul className={styles.rows}>
              {fact.rows.map((r) => (
                <li key={r} className="num">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

export type SixOption = { id: string; name: string; demo: DemoImages | null };

/** "Show me 6": a grid of the next options for this slot. Fewer than six are shown as they are. */
export function SixSheet({ open, onClose, options, onPick }: { open: boolean; onClose: () => void; options: readonly SixOption[]; onPick: (id: string) => void }) {
  const n = options.length;
  return (
    <Sheet open={open} onClose={onClose} label="Options for this spot" scroll>
      {open && (
        <div className={styles.sheet} data-testid="six-sheet">
          <h2 className={styles.sheetTitle}>Pick one for this spot</h2>
          <p className={styles.sheetSub}>{n >= 6 ? 'Six that fit your gym. Tap one to use it.' : `The ${n} other moves your gym has for this. Tap one to use it.`}</p>
          <ul className={styles.six}>
            {options.map((o) => (
              <li key={o.id}>
                <button type="button" className={`${styles.tile} pressable`} data-testid="six-option" data-exercise={o.id} onClick={() => onPick(o.id)}>
                  <DemoStill demo={o.demo} />
                  <span className={styles.tileName}>{o.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="tertiary" onClick={onClose} data-testid="six-close">
            Keep swiping
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** Asked once, after a move was swiped away in 3 different workouts. Closing it any way keeps the move. */
export function HideAskSheet({ name, onAnswer }: { name: string | null; onAnswer: (hide: boolean) => void }) {
  return (
    <Sheet open={!!name} onClose={() => onAnswer(false)} label="Hide it for good?">
      {name && (
        <div className={styles.sheet} data-testid="hide-ask">
          <h2 className={styles.sheetTitle}>Hide it for good?</h2>
          <p className={styles.sheetSub}>You have swapped {name} away in 3 workouts. Hide it and it is never offered again.</p>
          <Button variant="secondary" onClick={() => onAnswer(true)} data-testid="hide-yes">
            Hide it
          </Button>
          <Button variant="tertiary" onClick={() => onAnswer(false)} data-testid="hide-no">
            Keep it around
          </Button>
        </div>
      )}
    </Sheet>
  );
}
