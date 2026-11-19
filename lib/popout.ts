/**
 * True in a pop-out window (/pop/*). Pop-outs still run the app's providers, so
 * they get alerts on their own, but a few things should happen once per
 * browser, not once per window: alert sounds and speech, and the "leave site?"
 * prompt that guards the main window.
 */
export function isPopoutWindow(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/pop/')
}
