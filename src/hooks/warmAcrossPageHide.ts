// A background save (the voice pack, the plan's photos) that a page going away stops cleanly and a
// page coming back picks up again (PLAN 4.4b 7, 16). iOS keeps a Home Screen app's page in memory
// when it is switched away (pagehide, then pageshow on return): without this the save stopped on
// pagehide and never went on in that visit. What was already kept is skipped by the save itself.

/** One go of the save; `stopped`: it was cut short by the signal and is not done. */
export type WarmGo = (signal: AbortSignal) => Promise<{ stopped: boolean } | undefined>;

type Win = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** Starts the save now; returns a stop for good (a React cleanup). */
export function warmAcrossPageHide(go: WarmGo, win: Win = window): () => void {
  let done = false;
  let stop: AbortController | null = null;
  const start = () => {
    if (done || (stop && !stop.signal.aborted)) return;
    const mine = new AbortController();
    stop = mine;
    void go(mine.signal).then(
      (r) => {
        if (!mine.signal.aborted && !r?.stopped) done = true;
      },
      () => undefined,
    );
  };
  const leave = () => stop?.abort();
  win.addEventListener('pagehide', leave);
  win.addEventListener('beforeunload', leave);
  win.addEventListener('pageshow', start);
  start();
  return () => {
    win.removeEventListener('pagehide', leave);
    win.removeEventListener('beforeunload', leave);
    win.removeEventListener('pageshow', start);
    done = true;
    stop?.abort();
  };
}
