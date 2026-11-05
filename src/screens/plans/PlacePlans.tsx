import { useParams } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { BackButton } from '../../ui/BackButton';
import { EmptyState } from '../../ui/EmptyState';
import { useNav } from '../../ui/nav';
import { placeById } from '../../lib/places';
import { plansForPlace } from '../../data/places';
import { basePlanOf } from '../../data/plans';
import { getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { PlanCard } from './PlanCard';
import { planLink } from './planWords';
import { PlaceIcon } from './PlaceIcon';
import styles from './Plans.module.css';

/**
 * The plans for one place (PLAN 3.1). The picker only offers places with a plan, so the empty state
 * is for an old link or a place whose plans went away: calm, honest, one way back.
 */
export function PlacePlans({ placeId: fixed }: { placeId?: string } = {}) {
  const params = useParams();
  // Drawn under an edge swipe the route is the plan's, so the shell passes the place itself.
  const place = placeById(fixed ?? params.placeId);
  const plans = plansForPlace(place?.id);
  const state = useLive(() => getPlanState(), []);
  const go = useNav();
  return (
    <>
      <TopBar title={place?.label ?? 'Plans'} leading={<BackButton to="/plans" label="Back to Plans" />}>
        {plans.length > 0 && <p className={styles.lead}>Plans you can follow here.</p>}
      </TopBar>
      {plans.length > 0 ? (
        <ul className={styles.list}>
          {plans.map((p) => (
            <li key={p.id}>
              <PlanCard plan={p} to={planLink(`/plans/place/${place!.id}/${p.id}`, basePlanOf(state.data?.planId)?.id === p.id ? state.data?.planId : undefined)} active={basePlanOf(state.data?.planId)?.id === p.id} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No plans here yet"
          next="Every plan we have is on the Plans tab."
          icon={place ? <PlaceIcon id={place.id} /> : undefined}
          action={{ label: 'See all plans', onPress: () => go('/plans', { kind: 'pop' }) }}
        />
      )}
    </>
  );
}
