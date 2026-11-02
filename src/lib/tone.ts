// Soft tone at the end of rest (SPEC 5.1). Feature detected; silent when audio is blocked or missing.

type AudioCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctor: AudioCtor | undefined =
      globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Makes the (suspended) audio context ahead of time, when the phone is idle (PLAN 2.2d): creating
 * it took about 50 ms of the first ✓ tap on a mid range phone. The tap then only resumes it, which
 * is what iOS needs inside the gesture.
 */
export function warmAudio(): () => void {
  const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (ctx) return () => undefined;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(() => void context(), { timeout: 1500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = setTimeout(() => void context(), 600);
  return () => clearTimeout(t);
}

/** Call from a tap (e.g. Log set) so iOS lets the later tone play. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

/** Two short soft sine notes. Never throws. */
export function playTone(): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  try {
    const t = c.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    });
  } catch {
    /* silent fallback */
  }
}
