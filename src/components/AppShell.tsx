import { Outlet } from 'react-router-dom';
import { TabBar } from './TabBar';
import styles from './AppShell.module.css';

/**
 * Fixed full-screen frame: only the content area scrolls, so the tab bar
 * never rubber-bands with the page on iOS.
 */
export function AppShell() {
  return (
    <div className={styles.shell}>
      <main className={styles.content}>
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
