import { NavLink, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { HistoryIcon, ICON_STROKE, PlansIcon, RunIcon, TodayIcon } from './icons';
import { tick } from './haptics';
import { SPRING, FADE } from './motion';

const BOUNCE = { duration: 0.34, ease: 'easeOut' } as const;
import { useNav } from './nav';
import styles from './TabBar.module.css';

const TABS = [
  { to: '/', label: 'Today', Icon: TodayIcon, also: ['/settings'] },
  { to: '/run', label: 'Run', Icon: RunIcon, also: [] },
  { to: '/history', label: 'History', Icon: HistoryIcon, also: [] },
  { to: '/plans', label: 'Plans', Icon: PlansIcon, also: [] },
] as const;

/**
 * Floating, blurred tab bar (SPEC 23.1): a lime pill slides to the tab you pick (shared layout
 * animation) and its icon gives a small spring bounce. The nav itself reaches the bottom edge and
 * owns the one bottom inset (PLAN 1.10b); the capsule floats inside it. Hidden on pushed screens.
 */
export function TabBar({ hidden = false }: { hidden?: boolean }) {
  const { pathname } = useLocation();
  const go = useNav();
  const reduce = useReducedMotion();
  // Pushed screens hide it like iOS: it slides away, and takes no taps or focus while gone.
  return (
    <nav className={styles.bar} aria-label="Main" data-hidden={hidden || undefined} aria-hidden={hidden || undefined} {...(hidden ? { inert: '' } : {})}>
      <div className={styles.capsule}>
        {TABS.map(({ to, label, Icon, also }) => {
          const active = pathname === to || (also as readonly string[]).includes(pathname) || (to !== '/' && pathname.startsWith(`${to}/`));
          return (
            <NavLink
              key={to}
              to={to}
              end
              className={styles.tab}
              data-active={active || undefined}
              aria-current={active ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (pathname === to) return;
                tick();
                go(to, { kind: 'tab' });
              }}
            >
              {active && <motion.span layoutId="tab-pill" className={styles.pill} transition={reduce ? FADE : SPRING} />}
              <motion.span
                className={styles.iconWrap}
                initial={false}
                animate={active && !reduce ? { scale: [1, 0.84, 1.1, 1] } : { scale: 1 }}
                transition={active ? BOUNCE : FADE}
              >
                <Icon className={styles.icon} strokeWidth={ICON_STROKE} aria-hidden="true" />
              </motion.span>
              <span className={styles.label}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
