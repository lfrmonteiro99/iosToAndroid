/**
 * Notification firewall / router engine (#630).
 *
 * The native `NotificationListenerService` (modules/launcher-module/.../
 * NotificationService.kt) already observes notifications from OTHER apps and
 * exposes them through `LauncherModule.getNotifications()` + the
 * `onNotificationPosted` event. What was missing is the *classification layer*:
 * nothing decides whether a given notification should be shown immediately,
 * held for a scheduled summary, batched into a digest, or blocked. This module
 * is that layer, kept pure and framework-free so it can be unit-tested without
 * mounting React or touching the native bridge.
 *
 * The router is the single source of truth consulted by:
 *   - the banner path (App.tsx's notification listener), to decide whether to
 *     surface a banner now or defer it, and
 *   - a future Notification Center router view that buckets the live feed by
 *     tier.
 *
 * Precedence (most-specific wins except where noted):
 *   1. Router disabled            -> immediate (unchanged current behaviour).
 *   2. Explicit per-app rule       -> that tier (unless it's 'blocked', which
 *                                      is never promoted).
 *   3. Built-in default per-app    -> that tier (DEFAULT_APP_TIERS).
 *   4. No match                    -> immediate (preserve current behaviour).
 *   When Reduce Interruptions is ON, every non-exempt notification is held for
 *   the summary (tier 'digest'): an app is exempt only if it is an active call,
 *   is in the allow-list, or the user explicitly promoted it to 'immediate'.
 */

export type NotificationTier = 'immediate' | 'scheduled' | 'digest' | 'blocked';

export type RoutingSource =
  | 'disabled'
  | 'appRule'
  | 'default'
  | 'fallback'
  | 'allowList'
  | 'reduceInterruptions';

/** A per-app routing override. `tier` wins over DEFAULT_APP_TIERS. */
export interface AppRule {
  packageName: string;
  tier: NotificationTier;
}

export interface ClassifyOptions {
  packageName: string;
  /**
   * True when this notification represents an active/incoming call. Calls are
   * always exempt from Reduce Interruptions ("Calls" membership).
   */
  isCall?: boolean;
  /** Per-app routing overrides. Empty when none configured. */
  appRules?: AppRule[];
  /** Master router switch. When false, every notification routes immediate. */
  routerEnabled?: boolean;
  /** Reduce Interruptions mode: hold non-exempt notifications for the summary. */
  reduceInterruptionsEnabled?: boolean;
  /** Package names allowed to break through Reduce Interruptions. */
  reduceInterruptionsAllowList?: string[];
}

export interface RoutingDecision {
  tier: NotificationTier;
  source: RoutingSource;
}

/**
 * Curated sensible defaults so the router does something useful out of the box.
 * WhatsApp/Telegram/Messenger break through immediately; Reddit/Twitter/
 * Instagram are digested; Gmail/Netflix are scheduled. Anything absent here
 * defaults to 'immediate' (resolveBaseTier fallback) so unmapped apps keep
 * behaving exactly as today.
 *
 * Matching is exact and case-sensitive on `packageName` — Android package names
 * are case-sensitive identifiers, so 'com.WhatsApp' must not match
 * 'com.whatsapp'.
 */
export const DEFAULT_APP_TIERS: Readonly<Record<string, NotificationTier>> = {
  'com.whatsapp': 'immediate',
  'com.whatsapp.w4b': 'immediate',
  'org.telegram.messenger': 'immediate',
  'com.facebook.orca': 'immediate',
  'com.reddit.frontpage': 'digest',
  'com.twitter.android': 'digest',
  'com.instagram.android': 'digest',
  'com.google.android.gm': 'scheduled',
  'com.netflix.mediaclient': 'scheduled',
};

export interface BaseTier {
  tier: NotificationTier;
  source: RoutingSource;
  /** True only for an explicit per-app rule (vs. a built-in default / fallback). */
  explicit: boolean;
}

/**
 * Resolve the base tier for a package before Reduce Interruptions is applied.
 * Explicit user rules beat built-in defaults, which beat the immediate fallback.
 * When several rules name the same package, the first match wins.
 *
 * `appRules` is normalized defensively: it arrives from the persisted Settings
 * blob and the native bridge (both `any`-typed boundaries, like the AsyncStorage
 * blobs SettingsStore normalizes on read), so a non-array here is treated as
 * "no rules" rather than throwing on `.find`.
 */
export function resolveBaseTier(
  packageName: string,
  appRules: AppRule[] = [],
): BaseTier {
  const rules = Array.isArray(appRules) ? appRules : [];
  const rule = rules.find((r) => r.packageName === packageName);
  if (rule) {
    return { tier: rule.tier, source: 'appRule', explicit: true };
  }
  const def = DEFAULT_APP_TIERS[packageName];
  if (def) {
    return { tier: def, source: 'default', explicit: false };
  }
  return { tier: 'immediate', source: 'fallback', explicit: false };
}

/**
 * Classify a single notification into its delivery tier.
 *
 * Pure: no I/O, no React, no native bridge. The same inputs always yield the
 * same decision, which is what makes the unit tests meaningful.
 */
export function classifyNotification(opts: ClassifyOptions): RoutingDecision {
  const {
    packageName,
    isCall = false,
    appRules = [],
    routerEnabled = false,
    reduceInterruptionsEnabled = false,
    reduceInterruptionsAllowList = [],
  } = opts;

  // 1. Router off: behave exactly as before the router existed.
  if (!routerEnabled) {
    return { tier: 'immediate', source: 'disabled' };
  }

  const base = resolveBaseTier(packageName, appRules);

  // A blocked app stays blocked even under Reduce Interruptions — blocking is
  // stronger than holding.
  if (base.tier === 'blocked') {
    return { tier: 'blocked', source: 'appRule' };
  }

  // 2. Reduce Interruptions: hold everything non-exempt for the summary.
  if (reduceInterruptionsEnabled) {
    const allowList = Array.isArray(reduceInterruptionsAllowList)
      ? reduceInterruptionsAllowList
      : [];
    const exempt = isCall || allowList.includes(packageName);
    if (exempt) {
      return { tier: 'immediate', source: 'allowList' };
    }
    // The user explicitly promoted this app to immediate; respect that.
    if (base.explicit && base.tier === 'immediate') {
      return { tier: 'immediate', source: 'appRule' };
    }
    // Scheduled/digest/default apps are deferred to the scheduled summary.
    return { tier: 'digest', source: 'reduceInterruptions' };
  }

  // 3. Normal routing by resolved tier.
  return { tier: base.tier, source: base.source };
}
