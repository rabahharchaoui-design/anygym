import { ArtScene } from './art/lazy';
import type { SceneName } from './art/scenes';
import { Button } from './Button';
import styles from './EmptyState.module.css';

type Props = {
  title: string;
  next: string;
  /** A small vector scene from the art pack (PLAN 3.6h), flat and in token colours; its room is kept while it loads. */
  scene?: SceneName;
  /** The one clear next step (SPEC 13.1: no dead ends). */
  action?: { label: string; onPress: () => void };
};

/**
 * Honest empty state (SPEC 13.1, 23.3; Monolith board 12, PLAN M15): giant words on the page, one
 * small line, and the one next step as words over the ice blue line. No box, no fake data.
 */
export function EmptyState({ title, next, scene, action }: Props) {
  return (
    <section className={styles.empty}>
      {scene && <ArtScene name={scene} width={96} className={styles.scene} />}
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.next}>{next}</p>
      {action && (
        <div className={styles.action}>
          <Button variant="primary" onClick={action.onPress}>
            {action.label}
          </Button>
        </div>
      )}
    </section>
  );
}
