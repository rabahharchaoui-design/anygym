// Dev tools (e.g. #/dev/plates) are hidden from normal navigation. They mount in dev builds,
// or in production with `?dev` in the URL (before or after the #, so both
// /anygym/?dev#/dev/viewport and /anygym/#/dev/viewport?dev work) or localStorage `anygym-dev` = '1'.
export function devToolsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const hashQuery = window.location.hash.split('?')[1] ?? '';
    return (
      new URLSearchParams(window.location.search).has('dev') ||
      new URLSearchParams(hashQuery).has('dev') ||
      localStorage.getItem('anygym-dev') === '1'
    );
  } catch {
    return false;
  }
}
