import type { ReactNode } from 'react';

/** The demo's photo box: a button that opens the full screen viewer, or a plain box without one. */
export function DemoStage({ className, name, onOpen, children }: { className: string; name: string; onOpen?: () => void; children: ReactNode }) {
  return onOpen ? (
    <button type="button" className={`${className} pressable`} onClick={onOpen} aria-label={`Show ${name} full screen`} data-testid="demo-stage">
      {children}
    </button>
  ) : (
    <div className={className} data-testid="demo-stage">
      {children}
    </div>
  );
}
