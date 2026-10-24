import styles from './EmptyState.module.css';

type Props = { title: string; next: string };

/** Honest empty state (SPEC 13.1): what is here, and the one next step. No fake data. */
export function EmptyState({ title, next }: Props) {
  return (
    <section className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.next}>{next}</p>
    </section>
  );
}
