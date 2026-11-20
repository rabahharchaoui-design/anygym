// PLAN 4.6c (1): whether the run engine holds a live run in memory. The engine is a separate
// download (the Run tab), so the update check cannot import it: the engine registers a read-only
// question here when it loads. Before that, no run can be in memory.

let probe: (() => boolean) | null = null;

export function setLiveRunProbe(fn: (() => boolean) | null): void {
  probe = fn;
}

/** True while a run is going in memory, saved or not (its first save may have failed). */
export function liveRunInMemory(): boolean {
  return probe?.() ?? false;
}
