// The door to the art pack (PLAN 3.6h). The pack is a separate chunk asked for only when a piece
// of art is first shown, so nothing here is on the first paint path. Each piece keeps its room
// while it loads (no layout shift); if the chunk cannot be read, the room stays empty: art is
// decoration, never a reason for an error screen.
import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { afterPaint } from '../afterPaint';
import type { BadgeProps } from '../badges/Badge';
import type { AmbientProps } from '../celebrate/fx/Ambient';
import type { FxCanvasProps } from '../celebrate/fx/FxCanvas';
import type { SceneProps } from './Scene';
import { SCENE_RATIO } from './scenes';

type Pack = typeof import('./artpack');
let pack: Promise<Pack> | null = null;
const load = (): Promise<Pack> => (pack ??= import('./artpack'));

/** Ask for the pack ahead of the moment it is needed (a screen that will celebrate calls this as it opens). */
export function preloadArt(): void {
  load().catch(() => {
    pack = null;
  });
}

const Nothing = () => null;
function piece<P>(pick: (p: Pack) => ComponentType<P>) {
  return lazy(() => load().then((p) => ({ default: pick(p) }), () => ({ default: Nothing as ComponentType<P> })));
}

const BadgeArt = piece<BadgeProps>((p) => p.Badge);
const FxArt = piece<FxCanvasProps>((p) => p.FxCanvas);
const SceneArt = piece<SceneProps>((p) => p.Scene);
const AmbientArt = piece<AmbientProps>((p) => p.Ambient);

/** An achievement medal (src/ui/badges). Its square is kept while the art loads. */
export function ArtBadge(props: BadgeProps) {
  const size = props.size ?? 64;
  return (
    <Suspense fallback={<span style={{ display: 'inline-block', width: size, height: size }} aria-hidden="true" />}>
      <BadgeArt {...props} />
    </Suspense>
  );
}

/** A drawn celebration effect (src/ui/celebrate/fx). It fills its positioned parent; nothing is shown while it loads. */
export function ArtFx(props: FxCanvasProps) {
  return (
    <Suspense fallback={null}>
      <FxArt {...props} />
    </Suspense>
  );
}

/** The calm drifting glass behind a summary. */
export function ArtAmbient(props: AmbientProps) {
  return (
    <Suspense fallback={null}>
      <AmbientArt {...props} />
    </Suspense>
  );
}

/** A small vector scene for an empty state or a hero (10 wide to 7 tall). Its room is kept from the first frame, so nothing moves when it arrives.
 * `className` styles that room. */
export function ArtScene({ end, ...props }: SceneProps & { /** Push it to the end of its row. */ end?: boolean }) {
  const width = props.width ?? 120;
  // The scene is asked for only once the screen it sits on has painted: never on the first paint path.
  const [painted, setPainted] = useState(false);
  useEffect(() => afterPaint(() => setPainted(true)), []);
  return (
    <span className={props.className} style={{ display: 'block', flex: 'none', width, height: width * SCENE_RATIO, ...(end ? { marginLeft: 'auto' } : null) }} aria-hidden="true" data-testid="art-scene-slot">
      {painted && (
        <Suspense fallback={null}>
          <SceneArt {...props} className={undefined} />
        </Suspense>
      )}
    </span>
  );
}

type Kids = { children?: ReactNode; className?: string };
const LeatherArt = piece<Kids>((p) => p.LeatherCover);
const PaperArt = piece<Kids>((p) => p.GuillochePaper);
const BloomArt = piece<{ children?: ReactNode; seed?: number; size?: number; className?: string }>((p) => p.InkBloom);

/** The passport surfaces (src/ui/art/passport), for PLAN 4.7: a leather cover, a page of guilloche paper, an ink bloom. */
export const ArtLeather = (props: Kids) => (
  <Suspense fallback={null}>
    <LeatherArt {...props} />
  </Suspense>
);
export const ArtPaper = (props: Kids) => (
  <Suspense fallback={null}>
    <PaperArt {...props} />
  </Suspense>
);
export const ArtInkBloom = (props: { children?: ReactNode; seed?: number; size?: number; className?: string }) => (
  <Suspense fallback={null}>
    <BloomArt {...props} />
  </Suspense>
);
