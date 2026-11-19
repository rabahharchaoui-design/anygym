import { Button } from '../../ui/Button';
import styles from './MonolithDevScreen.module.css';

/**
 * Dev preview (#/dev/monolith?dev, PLAN M1): the shared Monolith pieces in every state, for the
 * screenshot spec (tests/monolith-m1.spec.ts) and the critic. Behind the dev flag.
 */
export function MonolithDevScreen() {
  return (
    <main className={styles.screen}>
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
    </main>
  );
}
