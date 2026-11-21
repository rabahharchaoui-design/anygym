import { MUSIC_APPS } from '../lib/music';
import { AudioLinesIcon, MusicIcon } from '../ui/icons';
import styles from './MusicLinks.module.css';

const ICONS = { spotify: AudioLinesIcon, apple: MusicIcon } as const;

/**
 * The music buttons (SPEC 11, 12.1): Spotify and Apple Music, as two plain words. Each is a plain link the user taps,
 * which hands over to the music app (lib/music.ts says what works where). Nothing here plays,
 * pauses or reads what is playing.
 */
export function MusicLinks() {
  return (
    <>
      {MUSIC_APPS.map((app) => {
        const Icon = ICONS[app.id];
        return (
          <a key={app.id} className={`${styles.link} pressable`} href={app.href} target="_blank" rel="noopener" aria-label={app.say}>
            <span className={styles.pill}>
              <Icon width={15} height={15} strokeWidth={2.2} aria-hidden="true" />
              {app.label}
            </span>
          </a>
        );
      })}
    </>
  );
}
