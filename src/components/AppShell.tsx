import { useRef, type ReactNode } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { TabBar } from '../ui/TabBar';
import { ResumeBar } from '../ui/ResumeBar';
import { getActiveSession } from '../db/workouts';
import { useLive } from '../hooks/useLive';
import { EdgeSwipe } from '../ui/EdgeSwipe';
import { useNav } from '../ui/nav';
import { TodayScreen } from '../screens/TodayScreen';
import { PlansScreen } from '../screens/plans/PlansScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import styles from './AppShell.module.css';

/** The screen a pushed screen goes back to (null on a tab root). */
export function parentOf(pathname: string): string | null {
  if (pathname === '/settings' || pathname.startsWith('/dev/')) return '/';
  if (pathname.startsWith('/settings/')) return '/settings';
  if (pathname.startsWith('/plans/')) return '/plans';
  if (pathname.startsWith('/history/')) return '/history';
  return null;
}

const UNDER: Record<string, () => ReactNode> = {
  '/': () => <TodayScreen />,
  '/plans': () => <PlansScreen />,
  '/history': () => <HistoryScreen />,
};

/**
 * Fixed full-screen frame. Each screen is its own scroll layer (so it starts at the top and the
 * floating tab bar never rubber-bands with it). Pushed screens get the interactive edge swipe back.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const go = useNav();
  const layerRef = useRef<HTMLElement>(null);
  const parent = parentOf(pathname);
  const pushed = pathname === '/settings' || pathname.startsWith('/plans/') || pathname.startsWith('/history/') || pathname.startsWith('/settings/');
  const active = useLive(() => getActiveSession(), []);
  // Today has its own in progress card; the bar is for the other tabs.
  const resuming = !!active.data && !pushed && pathname !== '/';
  return (
    <div className={styles.shell} data-shell data-resume={resuming || undefined}>
      <div className={styles.stage}>
        <main key={pathname} ref={layerRef} className={styles.page} data-scroller>
          {/* Always a little taller than the screen, so a large title can hand over to the compact
              one on short pages too (iOS pages always scroll). */}
          <div className={styles.content}>{outlet}</div>
        </main>
        {parent && (
          <EdgeSwipe
            key={`swipe-${pathname}`}
            layerRef={layerRef}
            onBack={() => go(parent, { kind: 'none' })}
            under={() => (
              <div className={styles.page} data-scroller>
                {UNDER[parent]?.()}
              </div>
            )}
          />
        )}
      </div>
      {/* A workout in progress floats above the tab bar on every tab (one tap back to its list). */}
      <ResumeBar session={active.data ?? null} hidden={!resuming} />
      {/* Like iOS, pushed screens hide the tab bar (Settings too: it is pushed from Today). */}
      <TabBar hidden={pushed} />
    </div>
  );
}
