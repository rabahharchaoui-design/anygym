import { ArtAmbient, ArtFx } from '../art/lazy';
import { cappedCount, type EffectVariant } from './effects';
import { Particles } from './Particles';

type Props = {
  variant: EffectVariant;
  /** Reduced motion: every variant shows one still picture. */
  reduce?: boolean | null;
  /** How many pieces; each variant has a cap (effects.ts) that this can never pass. */
  count?: number;
  /** One run, in ms. */
  life?: number;
  /** Wait before it starts, in ms. */
  delay?: number;
  onDone?: () => void;
  className?: string;
};

/**
 * One celebration effect by name (PLAN 3.6h): the way a screen asks for any of them. It fills its
 * positioned parent. The burst is the engine's own Particles; the others are drawn by the art
 * pack, which loads the first time one is shown.
 */
export function Effect({ variant, reduce, count, life, delay, onDone, className }: Props) {
  if (variant === 'ambient') return <ArtAmbient reduce={reduce} className={className} />;
  if (variant === 'burst') return <Particles count={cappedCount('burst', count ?? 44)} origin={{ x: 0.5, y: 0.5 }} reach={190} delay={delay} life={life} still={!!reduce} onDone={onDone} className={className} />;
  return <ArtFx variant={variant} reduce={reduce} count={count} life={life} delay={delay} onDone={onDone} className={className} />;
}
