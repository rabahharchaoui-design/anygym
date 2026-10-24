import styles from './LoadError.module.css';

type Props = { text: string; onRetry: () => void };

/**
 * A read failed (PLAN 1.7f): say so in one sentence with one Try again, instead of a false empty
 * state (SPEC 13.1). Never shows the raw error.
 */
export function LoadError({ text, onRetry }: Props) {
  return (
    <section className={styles.box} role="alert" data-testid="load-error">
      <p className={styles.text}>{text}</p>
      <button type="button" className={`${styles.retry} pressable`} onClick={onRetry}>
        Try again
      </button>
    </section>
  );
}
