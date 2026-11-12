import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Chip } from './WorkoutDock';
import { nextToastId } from './workoutToast';

/** The "Nice. Next" chip above the rest bar: it shows for a moment, then `then` runs if the user is still on that exercise. */
export function useNiceChip(exerciseId: string | null, routeRef: MutableRefObject<string | null>) {
  const [chip, setChip] = useState<Chip | null>(null);
  const chipTimer = useRef<number | undefined>(undefined);
  /** "Nice. Next: Romanian deadlift" for a moment, then `then` if the user is still on that exercise. */
  const chipArm = useRef<((ms: number) => void) | null>(null);
  const showChip = (text: string, ms: number, from: string, then: () => void, open?: string) => {
    window.clearTimeout(chipTimer.current);
    const c: Chip = { id: nextToastId(), text, ...(open ? { open } : {}) };
    setChip(c);
    const arm = (wait: number) => {
      window.clearTimeout(chipTimer.current);
      chipTimer.current = window.setTimeout(() => {
        const fire = () => {
          setChip((cur) => (cur?.id === c.id ? null : cur));
          if (routeRef.current === from) then();
        };
        fire();
      }, wait);
    };
    chipArm.current = arm;
    arm(ms);
  };
  // A finger on the chip holds the automatic return; lifted without a tap, it carries on.
  const holdChip = () => window.clearTimeout(chipTimer.current);
  const releaseChip = () => chipArm.current?.(900);
  useEffect(() => () => window.clearTimeout(chipTimer.current), []);
  useEffect(() => {
    // Leaving the exercise by hand ends its chip.
    setChip(null);
    window.clearTimeout(chipTimer.current);
  }, [exerciseId]);
  return { chip, setChip, chipTimer, showChip, holdChip, releaseChip };
}
