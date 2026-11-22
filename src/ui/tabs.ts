// The five main tabs and which one a path belongs to (SPEC 23.1, PLAN M14: G's round 2 boards).
// The tab bar draws them. Settings is the You tab; its sub screens (gyms, import) light no tab.

export const TABS = [
  { to: '/', label: 'Today', id: 'today', also: [] },
  { to: '/plans', label: 'Plan', id: 'plan', also: [] },
  { to: '/run', label: 'Run', id: 'run', also: [] },
  { to: '/history', label: 'History', id: 'history', also: [] },
  { to: '/settings', label: 'You', id: 'you', also: [] },
] as const;

/** The tab roots, each at depth 0 of the navigation. */
export const TAB_ROOTS: readonly string[] = TABS.map((t) => t.to);

/** Which tab a path belongs to: its own route, a route listed under it, or anything below it. */
export function activeTab(pathname: string): string | null {
  const hit = TABS.find(
    ({ to, also }) => pathname === to || (also as readonly string[]).includes(pathname) || (to !== '/' && to !== '/settings' && pathname.startsWith(`${to}/`)),
  );
  return hit?.to ?? null;
}
