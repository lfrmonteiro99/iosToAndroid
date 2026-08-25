/**
 * Reusable primitive dispatcher (#781, part of #629).
 *
 * `launchApp` (AppsStore.tsx) and `setFocusMode` (SettingsStore.tsx) each hold
 * a small decision procedure — the protected-apps biometric gate, the
 * recents bookkeeping, the null→'off' normalisation — inline inside a
 * `useCallback` tied to their own store's React Context. That coupling is
 * fine for the current callers (Control Center, AssistiveTouch, Siri, the
 * home screen), which already run inside the relevant Provider, but it means
 * the logic itself cannot be exercised or reused without mounting that
 * Provider tree — a problem for a future caller like ShortcutsScreen that
 * dispatches primitives outside any single store's context.
 *
 * This module extracts the decision procedure only, framework-free, mirroring
 * the injected-effects shape of `AssistiveTouch.tsx`'s `runAction` (and of
 * `assistant/actions.ts`'s `ActionContext`) without depending on either. Each
 * store now composes its real dependencies (native module calls, storage,
 * alerts) into these functions instead of inlining the procedure.
 */

export type FocusModeValue = 'off' | 'doNotDisturb' | 'sleep' | 'work' | 'personal';

export interface LaunchAppDeps {
  /** False on iOS, where there is no launcher module — see AppsStore.tsx:640. */
  isAndroid: boolean;
  isProtected(packageName: string): boolean;
  authenticate(reason: string): Promise<boolean>;
  launchNative(packageName: string): Promise<boolean>;
  onLaunched(packageName: string): void;
  onError(title: string, message: string): void;
}

/**
 * Open an app by package name. Protected packages are gated behind biometric
 * auth (fail-closed: no hardware, nothing enrolled, or a cancelled/failed
 * prompt all mean "do not launch"). Returns whether the launch actually
 * succeeded, so callers driving an icon-expand transition can revert it.
 */
export async function dispatchLaunchApp(packageName: string, deps: LaunchAppDeps): Promise<boolean> {
  if (!deps.isAndroid) return false;

  if (deps.isProtected(packageName)) {
    const authenticated = await deps.authenticate('Unlock app');
    if (!authenticated) return false;
  }

  try {
    const ok = await deps.launchNative(packageName);
    if (ok) {
      deps.onLaunched(packageName);
    } else {
      deps.onError('Error', 'Could not launch app. Please try again.');
    }
    return ok;
  } catch {
    deps.onError('Error', 'Could not launch app. Please try again.');
    return false;
  }
}

/** `null` clears focus mode back to 'off'; any other string is passed through. */
export function resolveFocusMode(mode: string | null): FocusModeValue {
  return (mode === null ? 'off' : mode) as FocusModeValue;
}

/**
 * Apply a focus/DND mode. Covers both "toggle profile" and "enable DND" —
 * they are the same underlying field (`focusMode`), so one primitive serves
 * both.
 */
export function dispatchSetFocusMode(
  mode: string | null,
  applyFocusMode: (resolved: FocusModeValue) => void,
): void {
  applyFocusMode(resolveFocusMode(mode));
}
