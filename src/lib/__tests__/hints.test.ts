import { describe, expect, it } from 'vitest';
import { HINTS_KEY, HINT_TEXT, NEXT_DELAY_MS, createHintStore } from '../hints';

const memory = (init: Record<string, string> = {}) => {
  const data = { ...init };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  };
};

/** A manual clock for the pause between hints. */
const clock = () => {
  const queue: Array<() => void> = [];
  return { schedule: (fn: () => void, ms: number) => (expect(ms).toBe(NEXT_DELAY_MS), queue.push(fn)), flush: () => queue.splice(0).forEach((f) => f()) };
};

describe('hint store', () => {
  it('uses the SPEC 13.5 texts exactly', () => {
    expect(HINT_TEXT).toEqual({
      plates: 'Tap plates to load the bar. We add it up.',
      wheel: 'Spin to pick your dumbbells',
      stack: 'Tap the pin to pick the weight',
      setCard: 'Tap Log set when you finish the set',
    });
  });

  it('shows one hint at a time, in claim order, each once, persisted under one key', () => {
    const storage = memory();
    const c = clock();
    const store = createHintStore(storage, c.schedule);
    let changes = 0;
    const off = store.subscribe(() => changes++);
    store.claim('plates');
    store.claim('setCard');
    store.claim('plates'); // a second claim is a no op
    expect(store.active()).toBe('plates');
    store.dismiss('plates');
    expect(store.active()).toBeNull(); // a short pause before the next
    c.flush();
    expect(store.active()).toBe('setCard');
    store.dismiss('setCard');
    c.flush();
    expect(store.active()).toBeNull();
    expect(JSON.parse(storage.data[HINTS_KEY]!)).toEqual({ plates: true, setCard: true });
    expect(changes).toBeGreaterThan(0);
    off();

    // A new visit: seen hints never come back.
    const again = createHintStore(storage, c.schedule);
    again.claim('plates');
    again.claim('wheel');
    expect(again.seen('plates')).toBe(true);
    expect(again.active()).toBe('wheel');
  });

  it('never shows while blocked (rest countdown) and resumes after', () => {
    const store = createHintStore(memory(), clock().schedule);
    store.claim('setCard');
    expect(store.active()).toBe('setCard');
    store.setBlocked(true);
    store.setBlocked(true);
    expect(store.active()).toBeNull();
    store.claim('plates');
    expect(store.active()).toBeNull();
    store.setBlocked(false);
    expect(store.active()).toBe('setCard');
  });

  it('a hint that unmounts gives its turn to the next without being marked seen', () => {
    const store = createHintStore(memory(), clock().schedule);
    store.claim('stack');
    store.claim('wheel');
    store.release('stack');
    expect(store.active()).toBe('wheel');
    expect(store.seen('stack')).toBe(false);
    store.release('plates'); // not waiting: no op
    store.release('wheel');
    expect(store.active()).toBeNull();
    // Dismissing a hint that is not on screen only marks it seen.
    store.dismiss('stack');
    expect(store.seen('stack')).toBe(true);
  });

  it('survives broken or blocked storage', () => {
    const broken = { getItem: () => '{not json', setItem: () => { throw new Error('full'); } };
    const store = createHintStore(broken, clock().schedule);
    store.claim('plates');
    expect(store.active()).toBe('plates');
    store.dismiss('plates');
    expect(store.seen('plates')).toBe(true);
    const none = createHintStore(null, clock().schedule);
    none.claim('wheel');
    expect(none.active()).toBe('wheel');
    expect(createHintStore(memory({ [HINTS_KEY]: 'null' }), clock().schedule).seen('wheel')).toBe(false);
  });
});
