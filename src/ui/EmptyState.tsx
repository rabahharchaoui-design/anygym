import { Button } from './Button';
import styles from './EmptyState.module.css';

type Art = 'history' | 'run' | 'list';

type Props = {
  title: string;
  next: string;
  art?: Art;
  /** The one clear next step (SPEC 13.1: no dead ends). */
  action?: { label: string; onPress: () => void };
};

/** Honest empty state (SPEC 13.1, 23.3): a small original drawing, what is here, one next step. No fake data. */
export function EmptyState({ title, next, art = 'list', action }: Props) {
  return (
    <section className={styles.empty}>
      <Illustration art={art} />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.next}>{next}</p>
      {action && (
        <div className={styles.action}>
          <Button variant="secondary" onClick={action.onPress}>
            {action.label}
          </Button>
        </div>
      )}
    </section>
  );
}

function Illustration({ art }: { art: Art }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg className={styles.art} viewBox="0 0 120 88" aria-hidden="true" focusable="false">
      {art === 'history' && (
        <>
          <rect x="22" y="26" width="76" height="50" rx="12" {...line} opacity="0.35" />
          <rect x="16" y="16" width="88" height="54" rx="13" {...line} fill="#0e0e10" />
          <path d="M30 34h34M30 46h22M30 58h28" {...line} opacity="0.55" />
          <circle cx="86" cy="50" r="11" fill="var(--accent)" />
          <path d="M81 50.5l3.5 3.5 6.5-7.5" fill="none" stroke="#000" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {art === 'run' && (
        <>
          <path d="M14 70c18-4 22-22 40-26s26 10 44-14" {...line} strokeDasharray="2 7" opacity="0.6" />
          <circle cx="14" cy="70" r="5" {...line} />
          <circle cx="98" cy="30" r="7" fill="var(--accent)" />
          <path d="M98 23v-9l10 4-10 4" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" />
        </>
      )}
      {art === 'list' && (
        <>
          <rect x="18" y="14" width="84" height="60" rx="13" {...line} fill="#0e0e10" />
          <circle cx="36" cy="32" r="5" fill="var(--accent)" />
          <path d="M48 32h36M36 46h48M36 58h30" {...line} opacity="0.55" />
        </>
      )}
    </svg>
  );
}
