/**
 * Foreground-app monitor + Protected-Apps gate (#627 child issue).
 *
 * The native side is an Android AccessibilityService (ForegroundMonitorService)
 * that learns the protected set via `LauncherModule.setProtectedApps` and, when
 * it sees a protected package move to the foreground, shows a BiometricPrompt
 * before releasing the app. The JS side owns the protected set (AppsStore) and
 * is responsible for pushing it down to the service, and for reacting to the
 * `onForegroundAppChanged` events the service emits.
 *
 * This file is the pure, platform-agnostic decision logic shared by both ends:
 * whether a given foreground transition should be gated. Keeping it in TS (and
 * unit-tested here) means the *rule* has a single source of truth and a test
 * that exercises it without needing an Android build — the Kotlin service
 * mirrors the same predicate so the two never drift.
 */

export interface ForegroundApp {
  /** Package name that just moved to the foreground (or '' when none / home). */
  packageName: string;
}

/**
 * Decide whether the launcher must gate the now-foreground app.
 *
 * Rules, each a real edge case this predicate exists to handle:
 *  - No package (null/undefined/empty string) → never gate. The service fires
 *    on HOME / "no app" transitions too, and there is nothing to protect.
 *  - `protectedApps` is missing or not an array → never gate. A malformed
 *    payload must not become a blanket "gate everything" (fail-open for the
 *    rule itself; the service layer decides what a missing set means).
 *  - The package is the launcher's own → never gate. The service runs inside
 *    this app; gating ourselves would lock the launcher out of its own
 *    foreground transitions and is exactly the "no absolute control" trap the
 *    issue calls out.
 *  - Package present in the protected set → gate.
 *
 * `ownPackageName` is optional so the helper is usable in pure unit tests
 * without a real package name; production callers always pass it.
 */
export function isForegroundAppProtected(
  packageName: string | null | undefined,
  protectedApps: string[] | null | undefined,
  ownPackageName?: string | null,
): boolean {
  if (!packageName) return false;
  if (protectedApps == null || !Array.isArray(protectedApps)) return false;
  if (ownPackageName != null && packageName === ownPackageName) return false;
  return protectedApps.includes(packageName);
}
