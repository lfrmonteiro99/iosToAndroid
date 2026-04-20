// Tracks whether an OS permission dialog is expected to be showing.
// Used by App.tsx to suppress auto-lock while a dialog is visible.
//
// Each permission request call wraps itself with withAutoLockSuppressed so
// nested prompts (e.g. Camera → Microphone) compose correctly.

let inFlight = 0;
const MAX_SUPPRESSION_MS = 30_000;

export function suppressAutoLock(): boolean {
  return inFlight > 0;
}

export async function withAutoLockSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  inFlight++;
  // safety cap: auto-decrement after 30s even if fn never resolves
  const safetyTimer = setTimeout(() => { if (inFlight > 0) inFlight--; }, MAX_SUPPRESSION_MS);
  try {
    return await fn();
  } finally {
    clearTimeout(safetyTimer);
    if (inFlight > 0) inFlight--;
  }
}
