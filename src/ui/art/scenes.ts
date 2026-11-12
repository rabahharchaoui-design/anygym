// The names of the small vector scenes (PLAN 3.6h). Pure and tiny, so anything may import it
// without pulling in the drawings (those are in Scene.tsx, part of the lazy art pack).
export const SCENES = ['today', 'history', 'plans', 'planReady', 'welcome'] as const;
export type SceneName = (typeof SCENES)[number];

/** A scene is 10 wide to 7 tall. */
export const SCENE_RATIO = 0.7;
