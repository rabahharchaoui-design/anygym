// The voice coach's settings (SPEC 12.4 "toggle and frequency"), kept with the run setup. Pure.
import type { VoiceEvent } from './compose';

/** How often a split is spoken. 'off' keeps every other cue (intervals, pause, goal). */
export type SplitEvery = 'every' | 'second' | 'off';
export type VoiceSettings = { on: boolean; splits: SplitEvery };

export const DEFAULT_VOICE: VoiceSettings = { on: true, splits: 'every' };

export const SPLIT_CHOICES: ReadonlyArray<{ value: SplitEvery; label: string }> = [
  { value: 'every', label: 'Always' },
  { value: 'second', label: 'Each 2nd' },
  { value: 'off', label: 'Never' },
];

export function sanitizeVoice(raw: unknown): VoiceSettings {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof VoiceSettings, unknown>>;
  return { on: typeof v.on === 'boolean' ? v.on : DEFAULT_VOICE.on, splits: SPLIT_CHOICES.some((c) => c.value === v.splits) ? (v.splits as SplitEvery) : DEFAULT_VOICE.splits };
}

/** Is this event spoken with these settings? */
export function wanted(e: VoiceEvent, s: VoiceSettings): boolean {
  if (!s.on) return false;
  if (e.type !== 'split') return true;
  return s.splits === 'every' || (s.splits === 'second' && e.count % 2 === 0);
}
