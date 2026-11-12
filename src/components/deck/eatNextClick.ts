// A hold that opens a sheet (Fix, "Never show") is still under the finger when the sheet rises. On
// Android Chrome the lift that follows is read as a tap on whatever is under the finger then: the
// sheet's own scrim, which would close it at once. So the one click that comes with the lift is
// eaten. A new press (a new tap on anything) ends the guard, so a person's next tap is never eaten.
const LIFT_EVENTS = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'];
const PRESS_EVENTS = ['pointerdown', 'touchstart'];

export function eatNextClick() {
  const eat = (e: Event) => {
    off();
    e.stopPropagation();
    e.preventDefault();
  };
  const lifted = () => {
    for (const t of LIFT_EVENTS) window.removeEventListener(t, lifted, true);
    // The click comes in the same moment as the lift; nothing is eaten after it.
    window.setTimeout(off, 250);
  };
  function off() {
    window.removeEventListener('click', eat, true);
    for (const t of LIFT_EVENTS) window.removeEventListener(t, lifted, true);
    for (const t of PRESS_EVENTS) window.removeEventListener(t, off, true);
  }
  window.addEventListener('click', eat, true);
  for (const t of LIFT_EVENTS) window.addEventListener(t, lifted, true);
  // Added after the hold's own press, so only a later press ends it.
  for (const t of PRESS_EVENTS) window.addEventListener(t, off, true);
}
