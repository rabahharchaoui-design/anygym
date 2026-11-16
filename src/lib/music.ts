// The music buttons (SPEC 11, 12.1): on a workout's day list and above Start on the Run tab. Each
// one only opens the music app; AnyGym never controls what plays.
//
// What works from an iPhone Home Screen web app (standalone):
//   - A tap on a normal link to https://open.spotify.com/ or https://music.apple.com/ is a
//     universal link: iOS hands it to the Spotify or Music app when it is installed, and the
//     music keeps playing when the user comes back to AnyGym. Without the app, iOS shows the
//     website in a sheet over AnyGym (never a dead end, never an error).
//   - The custom schemes (spotify:, music:) are not used: with no app installed they fail with a
//     system error alert, and a web app cannot find out beforehand.
//   - The link must be followed by the user's own tap on a real <a>; a scripted window.open is
//     not treated as a universal link.
// Android: the same https links open the installed app through its app links, or the website.
export type MusicApp = { id: 'spotify' | 'apple'; /** The short name on a small pill. */ label: string; /** The full name where there is room. */ name: string; href: string; say: string };

export const MUSIC_APPS: readonly MusicApp[] = [
  { id: 'spotify', label: 'Spotify', name: 'Spotify', href: 'https://open.spotify.com/', say: 'Open Spotify' },
  { id: 'apple', label: 'Music', name: 'Apple Music', href: 'https://music.apple.com/', say: 'Open Apple Music' },
];
