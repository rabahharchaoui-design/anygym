import { NavLink, useLocation } from 'react-router-dom';
import { TodayIcon, RunIcon, HistoryIcon, PlansIcon } from './icons';
import styles from './TabBar.module.css';

const TABS = [
  { to: '/', label: 'Today', Icon: TodayIcon, also: ['/settings'] },
  { to: '/run', label: 'Run', Icon: RunIcon, also: [] },
  { to: '/history', label: 'History', Icon: HistoryIcon, also: [] },
  { to: '/plans', label: 'Plans', Icon: PlansIcon, also: [] },
] as const;

export function TabBar() {
  const { pathname } = useLocation();
  return (
    <nav className={styles.bar} aria-label="Main">
      {TABS.map(({ to, label, Icon, also }) => {
        const active = pathname === to || (also as readonly string[]).includes(pathname) || (to !== '/' && pathname.startsWith(`${to}/`));
        return (
          <NavLink
            key={to}
            to={to}
            end
            className={`${styles.tab} pressable`}
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className={styles.icon} />
            <span className={styles.label}>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
