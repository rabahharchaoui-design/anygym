import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Sheet, SheetFooter } from '../../ui/Sheet';
import { Divider } from '../../ui/Divider';
import { DataField } from '../../ui/DataField';
import styles from './MonolithDevScreen.module.css';

/**
 * Dev preview (#/dev/monolith?dev, PLAN M1): the shared Monolith pieces in every state, for the
 * screenshot spec (tests/monolith-m1.spec.ts) and the critic. Behind the dev flag.
 */
export function MonolithDevScreen() {
  const [sheet, setSheet] = useState<'short' | 'tall' | null>(null);
  const close = () => setSheet(null);
  return (
    <main className={styles.screen} data-m1-preview>
      <section className={styles.block} data-testid="m1-buttons" aria-label="Buttons">
        <h2 className={styles.label}>Buttons</h2>
        <Button>Start workout</Button>
        <Button disabled disabledReason="Pick a day first">
          Start workout
        </Button>
        <Button variant="secondary">Share card</Button>
        <div className={styles.pair}>
          <Button variant="secondary">Share card</Button>
          <Button size="md">Done</Button>
        </div>
        <div className={styles.inline}>
          <Button variant="quiet">Change day</Button>
          <Button variant="destructive">Delete set</Button>
          <Button variant="quiet" disabled>
            Skip
          </Button>
        </div>
      </section>
      <section className={styles.block} data-testid="m1-dividers" aria-label="Dividers">
        <h2 className={styles.label}>Divider</h2>
        <div className={styles.rows}>
          {['Gyms', 'Units', 'Weekly goal'].map((row) => (
            <div key={row}>
              <p className={styles.row}>{row}</p>
              <Divider />
            </div>
          ))}
        </div>
      </section>
      <section className={styles.block} data-testid="m1-fields" aria-label="Data fields">
        <h2 className={styles.label}>Data field</h2>
        <DataField label="Time" value="21:08" />
        <Divider />
        <DataField label="Distance" value="3.42" unit="km" size="hero" />
        <Divider />
        <DataField label="Pace" value="6:11" unit="/km" />
        <Divider />
        <div className={styles.stats}>
          <DataField label="Distance" value="3.42" unit="km" size="medium" />
          <DataField label="Time" value="21:08" size="medium" />
          <DataField label="Pace" value="6:11" unit="/km" size="medium" />
        </div>
      </section>
      <section className={styles.block} data-testid="m1-fields-worst" aria-label="Data fields, worst case">
        <h2 className={styles.label}>Data field, worst case</h2>
        <DataField label="Time" value="1:59:59" />
        <Divider />
        <DataField label="Distance" value="99.99" unit="mi" size="hero" />
        <Divider />
        <DataField label="Time" value="1:59:59" size="hero" />
        <Divider />
        <DataField label="Pace" value={null} unit="/mi" />
        <Divider />
        <DataField label="Total weight" value="999" unit="lb" size="hero" />
        <Divider />
        <div className={styles.stats}>
          <DataField label="Distance" value="99.99" unit="mi" size="medium" />
          <DataField label="Time" value="1:59:59" size="medium" />
          <DataField label="Pace" value={null} unit="/mi" size="medium" />
        </div>
      </section>
      <section className={styles.block} data-testid="m1-sheets" aria-label="Sheets">
        <h2 className={styles.label}>Sheet</h2>
        <Button variant="secondary" onClick={() => setSheet('short')} data-testid="m1-open-sheet">
          Open a sheet
        </Button>
        <Button variant="secondary" onClick={() => setSheet('tall')} data-testid="m1-open-tall">
          Open a tall sheet
        </Button>
      </section>
      <Sheet open={sheet === 'short'} onClose={close} label="Units">
        <div className={styles.sheetBody} data-testid="m1-sheet-body">
          <h2 className={styles.sheetTitle}>Units</h2>
          {['Weight', 'Distance'].map((row) => (
            <div key={row}>
              <p className={styles.row}>{row}</p>
              <Divider />
            </div>
          ))}
          <Button onClick={close}>Done</Button>
        </div>
      </Sheet>
      <Sheet open={sheet === 'tall'} onClose={close} label="Gyms" scroll footer>
        <div className={styles.sheetBody}>
          <h2 className={styles.sheetTitle}>Gyms</h2>
          {Array.from({ length: 14 }, (_, i) => `Gym ${i + 1}`).map((row) => (
            <div key={row}>
              <p className={styles.row}>{row}</p>
              <Divider />
            </div>
          ))}
        </div>
        <SheetFooter>
          <Button onClick={close}>Done</Button>
        </SheetFooter>
      </Sheet>
    </main>
  );
}
