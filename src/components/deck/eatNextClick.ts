// A hold that opens a sheet (Fix, "Never show") is still under the finger when the sheet rises. On
// Android Chrome the lift that follows is read as a tap on whatever is under the finger then: the
// sheet's own scrim, which would close it at once. So the one click that follows the lift is eaten.
export function eatNextClick() {
  const eat = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  const off = () => window.removeEventListener('click', eat, true);
  window.addEventListener('click', eat, true);
  const lifted = () => {
    for (const t of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) window.removeEventListener(t, lifted, true);
    // The click comes right after the lift; nothing later is ever eaten.
    window.setTimeout(off, 400);
  };
  for (const t of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) window.addEventListener(t, lifted, true);
}
