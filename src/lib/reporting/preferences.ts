// Settings → Privacy → "Send crash reports" (SPEC 24): on by default, stored on this phone
// (reportPreferences, schema v9). Subscribable like haptics, for useSyncExternalStore.
// The switch shows only what is saved: it moves once the write has committed. Other tabs hear
// the change (BroadcastChannel, with a storage event fallback), and every crash re-reads the saved
// choice right before it is queued and again right before it is sent.
import { db as defaultDb, type AnyGymDB } from '../../db/schema';
import { readCrashPreference, writeCrashPreference } from '../../db/reports';

export type CrashPreference = {
  /** For the switch: the saved choice once read, on until then. */
  enabled(): boolean;
  /** The saved choice (cached after the first read). If it cannot be read: false. */
  ready(): Promise<boolean>;
  /** The saved choice, read from storage now. If it cannot be read: false (nothing is sent). */
  fresh(): Promise<boolean>;
  /** Saves the choice, then shows it. Turning it off also deletes crashes still waiting. Throws if not saved. */
  setEnabled(on: boolean): Promise<void>;
  subscribe(fn: () => void): () => void;
};

const CHANNEL = 'anygym-crash-reports';
const STORAGE_KEY = 'anygym.crashReports.changed';

export function createCrashPreference(db: AnyGymDB = defaultDb): CrashPreference {
  let value: boolean | undefined;
  let loading: Promise<boolean> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const set = (v: boolean) => {
    if (value === v) return;
    value = v;
    notify();
  };
  const fresh = () =>
    readCrashPreference(db).then(
      (v) => {
        set(v);
        return v;
      },
      () => false,
    );
  const load = () => (loading ??= fresh());

  // Another tab changed it: read the saved value again.
  let channel: BroadcastChannel | undefined;
  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : undefined;
    channel?.addEventListener('message', () => void fresh());
  } catch {
    channel = undefined;
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) void fresh();
    });
  }
  const tellOthers = () => {
    try {
      channel?.postMessage('changed');
    } catch {
      // Closed channel: the storage event below still tells them.
    }
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // No localStorage (private mode, Node): the channel is enough.
    }
  };

  return {
    enabled: () => value ?? true,
    async ready() {
      if (value !== undefined) return value;
      return load();
    },
    fresh,
    async setEnabled(on) {
      await writeCrashPreference(on, db);
      set(on);
      tellOthers();
    },
    subscribe(fn) {
      listeners.add(fn);
      void load();
      return () => listeners.delete(fn);
    },
  };
}

export const crashReports = createCrashPreference();
