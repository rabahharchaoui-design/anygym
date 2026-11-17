import { say, unlockVoice } from '../../hooks/voicePlayer';
import type { DistanceUnit } from '../../lib/intake/answers';
import { previewEvent, SPLIT_CHOICES, type VoiceSettings } from '../../lib/run';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import styles from './Run.module.css';
import iv from './Intervals.module.css';

/** SPEC 12.2, word for word. */
export const POCKET_LINES = ['Keep AnyGym open with the screen on.', 'Your music keeps playing.', 'Locking the phone pauses GPS.'] as const;

type PocketProps = { open: boolean; onGo: () => void; onClose: () => void };

/** Shown once, before the first run (SPEC 12.2 pocket mode). "Got it" goes on to the countdown. */
export function PocketSheet({ open, onGo, onClose }: PocketProps) {
  return (
    <Sheet open={open} onClose={onClose} label="Before your first run">
      <div className={styles.sheet} data-testid="pocket-sheet">
        <h2 className={styles.sheetTitle}>Before your first run</h2>
        {POCKET_LINES.map((l) => (
          <p key={l} className={styles.sheetLine}>
            {l}
          </p>
        ))}
        <p className={styles.sheetLine}>The screen dims by itself after 10 seconds. Tap it to wake it.</p>
        <div className={styles.sheetActions}>
          <Button onClick={onGo} data-testid="pocket-go">
            Got it
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

type SettingsProps = {
  open: boolean;
  autoPause: boolean;
  onAutoPause: (on: boolean) => void;
  voice: VoiceSettings;
  onVoice: (v: VoiceSettings) => void;
  unit: DistanceUnit;
  onClose: () => void;
};

/**
 * Run settings: auto pause (SPEC 12.3, on by default) and the voice coach (SPEC 12.4): on or off,
 * how often it says a split, and a sample to hear it (the place to check it against your music).
 */
export function RunSettingsSheet({ open, autoPause, onAutoPause, voice, onVoice, unit, onClose }: SettingsProps) {
  const splitWord = unit === 'mi' ? 'mile' : 'km';
  const preview = () => {
    unlockVoice();
    // The sample is always said, whatever the settings: it is what a split sounds like.
    say(previewEvent(unit), { on: true, splits: 'every' });
  };
  return (
    <Sheet open={open} onClose={onClose} label="Run settings">
      <div className={styles.sheet} data-testid="run-settings-sheet">
        <h2 className={styles.sheetTitle}>Run settings</h2>
        <Switch label="Auto pause" hint="The clock stops when you stand still and starts again when you move." checked={autoPause} onChange={onAutoPause} />
        <Switch label="Voice coach" hint="Says your time and pace over your music." checked={voice.on} onChange={(on) => onVoice({ ...voice, on })} />
        {voice.on && (
          <div className={iv.voice} data-testid="voice-settings">
            <span className={iv.voiceLabel} id="voice-splits-label">{`Say each ${splitWord}`}</span>
            <Segmented options={SPLIT_CHOICES} value={voice.splits} onChange={(splits) => onVoice({ ...voice, splits })} labelledBy="voice-splits-label" testId="voice-splits" block glass />
            <Button variant="secondary" onClick={preview} data-testid="voice-preview">
              Play a sample
            </Button>
            <p className={iv.voiceNote}>Interval cues are always said. On an iPhone the voice is silent while the ring switch is on silent.</p>
          </div>
        )}
        <div className={styles.sheetActions}>
          <Button variant="secondary" onClick={onClose} data-testid="run-settings-done">
            Done
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
