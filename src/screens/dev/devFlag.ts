// Dev tools (e.g. #/dev/plates) are hidden from normal navigation. They mount in dev builds,
// or in production with `?dev` in the URL or localStorage `anygym-dev` = '1'.
export function devToolsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('dev') || localStorage.getItem('anygym-dev') === '1';
  } catch {
    return false;
  }
}
