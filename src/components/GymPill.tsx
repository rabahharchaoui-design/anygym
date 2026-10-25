import { useActiveGym } from '../db/useActiveGym';
import styles from './GymPill.module.css';

/**
 * Active gym name as plain text. Space is reserved so nothing shifts when it loads; `start` keeps
 * it flush left in a row (the day list), `end` flush right (next to Today's settings button).
 */
export function GymPill({ align = 'end' }: { align?: 'start' | 'end' }) {
  const gym = useActiveGym();
  return (
    <span className={styles.pill} data-align={align} data-ready={gym ? 'true' : 'false'} aria-hidden={gym ? undefined : true}>
      {gym ? <span className={styles.name}>{gym.name}</span> : null}
    </span>
  );
}
