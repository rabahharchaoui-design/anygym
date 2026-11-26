// PLAN R4 (6): the load of a part that has its own chunk (the exercise's muscles and How to). A failed
// fetch is tried once more after a short wait; if that fails too the part shows nothing (never a
// wrong fallback), and the failure is not kept: the next open of the part asks again.

export type OpenRetry<M> = {
  /** One open's load: the module, or the empty fallback after two failed tries. */
  load: () => Promise<M>;
  /** True once after a load that ended in the fallback: the caller makes a fresh lazy part. */
  stale: () => boolean;
};

export function openRetry<M>(fetchPart: () => Promise<M>, fallback: M, wait: (ms: number) => Promise<void>, waitMs = 1500): OpenRetry<M> {
  let failed = false;
  return {
    load: () =>
      fetchPart()
        .catch(() => wait(waitMs).then(fetchPart))
        .catch(() => {
          failed = true;
          return fallback;
        }),
    stale: () => {
      if (!failed) return false;
      failed = false;
      return true;
    },
  };
}
