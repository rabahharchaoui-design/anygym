// The 3D icon set's list (PLAN 3.6i). The manifest is written by scripts/make-icons-3d.mjs: each
// name's exported size and bytes. Only the groups on a screen today are offered to the app.
import manifest from './manifest.json';

export type Icon3DEntry = { group: string; path: string; width: number; height: number; webp: number; avif: number };
export const ICONS_3D: Record<string, Icon3DEntry> = manifest;

/** The groups that are on a screen (and precached for offline): goals, places, Quick workout styles. */
export const WIRED_GROUPS: readonly string[] = ['goal', 'place', 'style'];

/** The entry of a wired icon, or undefined (the caller keeps its line icon). */
export const icon3d = (name: string | undefined): Icon3DEntry | undefined => {
  const entry = name ? ICONS_3D[name] : undefined;
  return entry && WIRED_GROUPS.includes(entry.group) ? entry : undefined;
};

/** Where an icon's file is served from. */
export const icon3dUrl = (name: string, format: 'avif' | 'webp', base: string): string => `${base}icons3d/${ICONS_3D[name]?.path ?? ''}${name}.${format}`;

type DataSaver = { connection?: { saveData?: boolean } };
/** The person asked their phone to save data: decoration is not downloaded. */
export function wantsLessData(nav: DataSaver | undefined, matches: (query: string) => boolean): boolean {
  return nav?.connection?.saveData === true || matches('(prefers-reduced-data: reduce)');
}
