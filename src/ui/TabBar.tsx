import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { tick } from './haptics';
import { SPRING } from './motion';
import { useNav } from './nav';
import { activeTab, TABS } from './tabs';
import styles from './TabBar.module.css';

/**
 * The tab bar (SPEC 23.1, Monolith style sheet): docked to the bottom edge, solid graphite with a
 * hairline on top, five words (Today, Plan, Run, History, You; PLAN M14). The active tab is white and bold with a 20 x 3 px ice blue bar above
 * it that slides between tabs (shared layout animation) and lands on a small spring. The nav owns
 * the one bottom inset (PLAN 1.10b). Hidden on pushed screens.
 */
export function TabBar({ hidden = false }: { hidden?: boolean }) {
  const { pathname } = useLocation();
  const go = useNav();
  const reduce = useReducedMotion();
  // PLAN 3.5w: the bar is never inside a page snapshot. A tab switch moves only the screen's
  // content (nav.ts), and the bar (still data-pill for the specs) slides live between tabs on the
  // shared spring (layoutId).
  // Reduced motion: it simply jumps.
  // Pushed screens hide it like iOS: it slides away, and takes no taps or focus while gone.
  return (
    <nav className={styles.bar} aria-label="Main" data-hidden={hidden || undefined} aria-hidden={hidden || undefined} {...(hidden ? { inert: '' } : {})}>
      <div className={styles.capsule} data-tour="tabs">
        {TABS.map(({ to, label, id }) => {
          const active = activeTab(pathname) === to;
          return (
            <NavLink
              key={to}
              to={to}
              end
              className={styles.tab}
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
              data-testid={`tab-${id}`}
              onClick={(e) => {
                e.preventDefault();
                if (pathname === to) return;
                tick();
                go(to, { kind: 'tab' });
              }}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className={styles.pill}
                  data-pill
                  transition={reduce ? { duration: 0 } : SPRING}
                />
              )}
              <span className={styles.label}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
