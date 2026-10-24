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
