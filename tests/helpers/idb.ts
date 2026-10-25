// IndexedDB timing seams for race tests, installed into the page by the test (never shipped in
// the app). They only change WHEN transactions run, never what they write:
//   holdNextSetWrite(page)      keeps the app's next readwrite transaction on `sets` open
//                               (uncommitted) until releaseSetWrite(page): a Log set that is
//                               still being written,
//   delayReadsAfterNextWrite    right behind the app's next write on `sets`, a blocker
//     (page, ms)                transaction holds the store for `ms`, so the live query that
//                               re-reads the sets after the write waits: the window where the
//                               write landed but the screen has not heard about it yet.
import type { Page } from '../fixtures';

type Seam = {
  holdWrite: boolean;
  released: boolean;
  held: number;
  readsMs: number;
  side: IDBDatabase | null;
};

/** Runs in the page before the app (context.addInitScript / page.addInitScript). */
export function installIdbSeams() {
  const w = window as unknown as { __idbSeam: Seam };
  w.__idbSeam = { holdWrite: false, released: false, held: 0, readsMs: 0, side: null };
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: string | string[], mode?: IDBTransactionMode, opts?: IDBTransactionOptions) {
    const tx = original.call(this, stores, mode, opts);
    const seam = w.__idbSeam;
    const names = typeof stores === 'string' ? [stores] : [...stores];
    if (mode !== 'readwrite' || !names.includes('sets') || this === seam.side) return tx;
    if (seam.holdWrite) {
      seam.holdWrite = false;
      seam.held++;
      // Keeps the app's own transaction busy (so it cannot commit) until released.
      const spin = () => {
        if (seam.released) return;
        try {
          tx.objectStore('sets').count().onsuccess = spin;
        } catch {
          // The transaction ended (aborted): nothing to hold.
        }
      };
      spin();
    }
    if (seam.readsMs > 0 && seam.side) {
      const ms = seam.readsMs;
      seam.readsMs = 0;
      // Queued right behind the app's write (same store): runs once it committed, and every
      // transaction on `sets` created after that (the live query's re-read) waits for it.
      const blocker = original.call(seam.side, ['sets'], 'readwrite');
      let end = 0;
      const spin = () => {
        if (!end) end = performance.now() + ms;
        if (performance.now() < end) blocker.objectStore('sets').count().onsuccess = spin;
      };
      spin();
    }
    return tx;
  } as typeof IDBDatabase.prototype.transaction;
}

/** Installs the seams on a page before its next navigation (call before page.goto). */
export const addIdbSeams = (page: Page) => page.addInitScript(installIdbSeams);

export const holdNextSetWrite = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __idbSeam: Seam }).__idbSeam;
    s.released = false;
    s.holdWrite = true;
  });

/** How many writes the seam has held so far. */
export const heldWrites = (page: Page) => page.evaluate(() => (window as unknown as { __idbSeam: Seam }).__idbSeam.held);

export const releaseSetWrite = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __idbSeam: Seam }).__idbSeam.released = true;
  });

/** Opens the side connection (the app must have created its database) and arms the read delay. */
export const delayReadsAfterNextWrite = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<void>((resolve, reject) => {
        const s = (window as unknown as { __idbSeam: Seam }).__idbSeam;
        const arm = () => {
          s.readsMs = ms;
          resolve();
        };
        if (s.side) return arm();
        const req = indexedDB.open('anygym');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          s.side = req.result;
          s.side.onversionchange = () => s.side?.close();
          arm();
        };
      }),
    ms,
  );
