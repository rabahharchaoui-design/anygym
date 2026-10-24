import { Link } from 'react-router-dom';
import { ScreenHeader } from '../../components/ScreenHeader';
import { PLANS } from '../../data/plans';
import { getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { planMeta } from './planWords';
import styles from './Plans.module.css';

/** Plans tab (SPEC 8.6): the curated plans. Tap one to see every day. */
export function PlansScreen() {
  const state = useLive(() => getPlanState(), []);
  const activeId = state.value?.planId;
  return (
    <>
      <ScreenHeader title="Plans" />
      <p className={styles.lead}>Pick a plan and AnyGym lines up each day for you.</p>
      <ul className={styles.list}>
        {PLANS.map((p) => (
          <li key={p.id}>
            <Link to={`/plans/${p.id}`} className={`${styles.planCard} pressable`} data-testid={`plan-${p.id}`}>
              <span className={styles.planTop}>
                <span className={styles.planName}>{p.name}</span>
                {activeId === p.id && <span className={styles.badge}>Your plan</span>}
              </span>
              <span className={styles.planMeta}>{planMeta(p)}</span>
              <span className={styles.planSummary}>{p.summary}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
