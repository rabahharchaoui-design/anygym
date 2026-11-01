import styles from './FormTips.module.css';

/**
 * The form tips (SPEC 4.4 "How to", PLAN 2.2b), one style in the workout and in the sheet: a
 * variant's difference from the photos as a quiet note, then the catalog's own cues, numbered.
 */
export function FormTips({ note, tips, testId }: { note: string | null; tips: string[]; testId?: string }) {
  return (
    <>
      {note && (
        <p className={styles.note} data-testid="variant-note">
          {note}
        </p>
      )}
      {tips.length > 0 && (
        <ol className={styles.tips} data-testid={testId}>
          {tips.map((t, i) => (
            <li key={i} className={styles.tip}>
              {t}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
