import { useActiveGym } from '../db/useActiveGym';
import styles from './GymPill.module.css';

/** Active gym name as plain text. Space is reserved so nothing shifts when it loads. */
export function GymPill() {
  const gym = useActiveGym();
  return (
    <span className={styles.pill} data-ready={gym ? 'true' : 'false'} aria-hidden={gym ? undefined : true}>
      {gym ? <span className={styles.name}>{gym.name}</span> : null}
    </span>
  );
}
