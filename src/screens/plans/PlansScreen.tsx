import { Link } from 'react-router-dom';
import { TopBar } from '../../ui/TopBar';
import { ChevronRight } from '../../ui/icons';
import { useNav } from '../../ui/nav';
import { PLANS } from '../../data/plans';
import { getPlanState } from '../../db/planState';
import { useLive } from '../../hooks/useLive';
import { planMeta } from './planWords';
import styles from './Plans.module.css';

/** Plans tab (SPEC 8.6): the curated plans. Tap one to see every day. */
export function PlansScreen() {
  const state = useLive(() => getPlanState(), []);
  const activeId = state.data?.planId;
  const go = useNav();
  return (
    <>
      <TopBar title="Plans">
        <p className={styles.lead}>Pick one. Each day's workout is ready for you.</p>
      </TopBar>
      <ul className={styles.list}>
        {PLANS.map((p) => (
          <li key={p.id}>
            <Link
              to={`/plans/${p.id}`}
              className={`${styles.planCard} pressable`}
              data-testid={`plan-${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                go(`/plans/${p.id}`);
              }}
            >
              <span className={styles.planName}>{p.name}</span>
              {/* "Your plan" rides on the detail line, so the name never wraps to make room for it. */}
              <span className={styles.planMeta}>
                {planMeta(p)}
                {activeId === p.id && <span className={styles.badge}>Your plan</span>}
              </span>
              <span className={styles.planSummary}>{p.summary}</span>
              <ChevronRight className={styles.planChevron} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
