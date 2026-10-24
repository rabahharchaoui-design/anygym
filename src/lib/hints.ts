// First time hints (SPEC 13.1, 13.5): each shown once, never two at once, never while blocked
// (a rest countdown). Seen flags persist in localStorage under one key. No React here.

export type HintId = 'plates' | 'wheel' | 'stack' | 'setCard';

export const HINT_TEXT: Record<HintId, string> = {
  plates: 'Tap plates to load the bar. We add it up.',
  wheel: 'Spin to pick your dumbbells',
  stack: 'Tap the pin to pick the weight',
  setCard: 'Tap Log set when you finish the set',
};

export const HINTS_KEY = 'anygym-hints';
/** Pause between one hint going away and the next one showing. */
export const NEXT_DELAY_MS = 600;

type Listener = () => void;

export type HintStore = {
  /** A mounted hint asks to be shown. Order of claims decides who goes first. */
  claim: (id: HintId) => void;
  /** A hint unmounts. Its turn ends without marking it seen. */
  release: (id: HintId) => void;
  /** Tapped or interacted with: marked seen for good, the next waiting hint follows. */
  dismiss: (id: HintId) => void;
  /** While blocked (rest countdown) no hint shows; they wait their turn. */
  setBlocked: (blocked: boolean) => void;
  /** The hint on screen now, or null. */
  active: () => HintId | null;
  seen: (id: HintId) => boolean;
  subscribe: (fn: Listener) => () => void;
};

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createHintStore(storage: Storage | null = safeStorage(), schedule: (fn: () => void, ms: number) => unknown = setTimeout): HintStore {
  const listeners = new Set<Listener>();
  const waiting: HintId[] = [];
  let current: HintId | null = null;
  let blocked = false;
  let cooling = false;

  const read = (): Partial<Record<HintId, true>> => {
    try {
      const v = JSON.parse(storage?.getItem(HINTS_KEY) ?? '{}') as unknown;
      return v && typeof v === 'object' ? (v as Partial<Record<HintId, true>>) : {};
    } catch {
      return {};
    }
  };
  // Session copy, so a blocked storage still shows each hint only once per visit.
  const seenNow = read();

  const emit = () => listeners.forEach((fn) => fn());

  const pick = () => {
    if (current || blocked || cooling) return;
    const next = waiting.find((id) => !seenNow[id]) ?? null;
    if (next !== current) {
      current = next;
      emit();
    }
  };

  return {
    claim(id) {
      if (!waiting.includes(id)) waiting.push(id);
      pick();
    },
    release(id) {
      const i = waiting.indexOf(id);
      if (i >= 0) waiting.splice(i, 1);
      if (current === id) {
        current = null;
        emit();
        pick();
      }
    },
    dismiss(id) {
      seenNow[id] = true;
      try {
        storage?.setItem(HINTS_KEY, JSON.stringify({ ...read(), [id]: true }));
      } catch {
        /* storage full or blocked: the session copy still holds */
      }
      if (current === id) {
        current = null;
        cooling = true;
        emit();
        schedule(() => {
          cooling = false;
          pick();
        }, NEXT_DELAY_MS);
      }
    },
    setBlocked(b) {
      if (b === blocked) return;
      blocked = b;
      if (b && current) {
        current = null;
        emit();
      }
      pick();
    },
    active: () => (blocked ? null : current),
    seen: (id) => !!seenNow[id],
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The app's one hint store. */
export const hints = createHintStore();
