import { Link } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { useNav } from '../../ui/nav';
import { PLANS } from '../../data/plans';
import { PLACE_TILES } from '../../data/places';
import { getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { PlanCard } from './PlanCard';
import { PlaceIcon } from './PlaceIcon';
import styles from './Plans.module.css';

const count = (n: number) => `${n} ${n === 1 ? 'plan' : 'plans'}`;

/**
 * Plans tab (SPEC 8.6): where you train first, as tiles (PLAN 3.1, only places with a real plan
 * behind them, never an empty tile), then every curated plan. Tap a tile for its plans, a plan to
 * see every day.
 */
export function PlansScreen() {
  const state = useLive(() => getPlanState(), []);
  const activeId = state.data?.planId;
  const go = useNav();
  return (
    <>
      <TopBar title="Plans">
        <p className={styles.lead}>Pick one. Each day's workout is ready for you.</p>
      </TopBar>
      {PLACE_TILES.length > 0 && (
        <section className={styles.places} aria-labelledby="places-title">
          <h2 id="places-title" className={styles.sectionTitle}>
            Where you train
          </h2>
          <ul className={styles.placeGrid} data-count={PLACE_TILES.length}>
            {PLACE_TILES.map(({ place, plans }) => (
              <li key={place.id} className={styles.placeItem}>
                <Link
                  to={`/plans/place/${place.id}`}
                  className={`${styles.placeTile} pressable`}
                  data-testid={`place-${place.id}`}
                  aria-label={`${place.label}, ${count(plans.length)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(`/plans/place/${place.id}`);
                  }}
                >
                  <span className={styles.placeLabel}>{place.label}</span>
                  <span className={`${styles.placeCount} num`}>{count(plans.length)}</span>
                  <PlaceIcon id={place.id} className={styles.placeIcon} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className={styles.sectionTitle}>All plans</h2>
      <ul className={styles.list}>
        {PLANS.map((p) => (
          <li key={p.id}>
            <PlanCard plan={p} to={`/plans/${p.id}`} active={activeId === p.id} />
          </li>
        ))}
      </ul>
    </>
  );
}
