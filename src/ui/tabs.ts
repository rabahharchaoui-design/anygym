// The four main tabs and which one a path belongs to (SPEC 23.1). The tab bar draws them.

export const TABS = [
  { to: '/', label: 'Today', also: ['/settings'] },
  { to: '/run', label: 'Run', also: [] },
  { to: '/history', label: 'History', also: [] },
  { to: '/plans', label: 'Plans', also: [] },
] as const;

/** Which tab a path belongs to: its own route, a route listed under it, or anything below it. */
export function activeTab(pathname: string): string | null {
  const hit = TABS.find(({ to, also }) => pathname === to || (also as readonly string[]).includes(pathname) || (to !== '/' && pathname.startsWith(`${to}/`)));
  return hit?.to ?? null;
}
