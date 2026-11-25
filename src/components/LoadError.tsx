import { Button } from '../ui/Button';
import styles from './LoadError.module.css';

type Props = { text: string; onRetry: () => void };

/**
 * A read failed (PLAN 1.7f): say so in one sentence with one Try again, instead of a false empty
 * state (SPEC 13.1). Never shows the raw error. Monolith (PLAN M15): no box, the sentence on the
 * page between hairlines and Try again as heavy words over the ice blue line.
 */
export function LoadError({ text, onRetry }: Props) {
  return (
    <section className={styles.box} role="alert" data-testid="load-error">
      <p className={styles.text}>{text}</p>
      <Button variant="primary" size="md" block={false} onClick={onRetry}>
        Try again
      </Button>
    </section>
  );
}
