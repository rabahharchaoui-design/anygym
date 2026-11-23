// You's door to the voice coach setting (PLAN M14): read once, changes show at once and are saved
// behind, like the Run tab's settings sheet (hooks/useRunSetup.ts).
import { useCallback, useEffect, useState } from 'react';
import { readRunVoice, saveRunVoice } from '../db/runVoice';
import type { VoiceSettings } from '../lib/run/voice/settings';

export function useRunVoice(): { voice: VoiceSettings | null; setVoice: (v: VoiceSettings) => void } {
  const [voice, set] = useState<VoiceSettings | null>(null);
  useEffect(() => {
    let alive = true;
    void readRunVoice()
      .catch(() => null)
      .then((v) => alive && v && set((now) => now ?? v));
    return () => {
      alive = false;
    };
  }, []);
  const setVoice = useCallback((v: VoiceSettings) => {
    set(v);
    void saveRunVoice(v).catch(() => undefined);
  }, []);
  return { voice, setVoice };
}
