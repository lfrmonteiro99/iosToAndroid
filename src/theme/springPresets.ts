/**
 * Single vocabulary for spring physics (issue #492).
 *
 * Before this file, the project had three parallel spring vocabularies —
 * `AnimationConfig` (CupertinoTheme.ts), `gestureConfig.spring` (utils/gestureConfig.ts)
 * and ~20 inline `{ damping, stiffness }` literals at call sites — none of which
 * matched ESPECIFICACAO.md §3.1's five usage-named presets.
 *
 * This file is the one source of truth going forward. It does NOT replace
 * `gestureConfig.spring` (those values are tuned against real gesture release
 * velocity and are intentionally a different order of magnitude — see the comment
 * on `gestureConfig.spring`), and it does NOT change any existing numeric value:
 * per the issue's ressalva, §3.1's values are the spec author's own estimates
 * (marked [E], unvalidated against this app's real feel) and swapping them in for
 * tuned production values without a before/after capture could make the product
 * worse. Adopting a shared vocabulary and re-tuning values are separate concerns.
 */

export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
}

// ESPECIFICACAO.md §3.1 — the five presets, named by usage so they survive future
// re-tuning. Values are the spec's own [E] estimates; nothing in the app currently
// applies them, so no behaviour changes as a result of adding them.
export const navigation: SpringConfig = { damping: 18, stiffness: 180, mass: 1 };
export const interactive: SpringConfig = { damping: 12, stiffness: 220, mass: 1 };
export const sheet: SpringConfig = { damping: 20, stiffness: 160, mass: 1 };
export const wobble: SpringConfig = { damping: 8, stiffness: 300, mass: 0.8 };
export const snap: SpringConfig = { damping: 26, stiffness: 400, mass: 1 };

export const SpringPresets = { navigation, interactive, sheet, wobble, snap } as const;

// Component-tuned springs, consolidated here from the inline literals that used to
// live at each call site. Values are UNCHANGED from their original call sites — none
// of them matches a §3.1 preset closely enough to merge without a before/after
// capture, so each keeps its own name instead of being forced into one of the five
// above. The point of consolidating them here is that every spring value in the app
// now has exactly one place it's defined, not that they share a preset.
export const actionSheetPresent: SpringConfig = { damping: 25, stiffness: 300, mass: 1 };
export const alertDialogPresent: SpringConfig = { damping: 25, stiffness: 500, mass: 1 };
export const assistiveTouchSnap: SpringConfig = { damping: 18, stiffness: 220, mass: 1 };
export const assistiveTouchMenuReveal: SpringConfig = { damping: 14, stiffness: 220, mass: 1 };
export const reactionPickerPop: SpringConfig = { damping: 18, stiffness: 400, mass: 1 };
export const notificationBannerEnter: SpringConfig = { damping: 22, stiffness: 350, mass: 0.8 };
export const notificationBannerScale: SpringConfig = { damping: 22, stiffness: 350, mass: 1 };
export const launcherIconPress: SpringConfig = { damping: 12, stiffness: 200, mass: 1 };
// Shared by NotificationBanner's swipe-to-dismiss snap-back and
// CupertinoSwipeableRow's row settle — both used this exact tuple independently
// before this file existed (it also happens to equal AnimationConfig.defaultSpring;
// kept as its own export since AnimationConfig is deprecated).
export const feedbackSettle: SpringConfig = { damping: 20, stiffness: 300, mass: 1 };

// CupertinoContextMenu's pop-in (from #632 mainline): a touch lighter/looser than
// actionSheetPresent so the card "blooms" rather than slides.
export const contextMenuPresent: SpringConfig = { damping: 18, stiffness: 320, mass: 1 };

// iOS long-press context menu (spec §13, issue #632): a soft spring scale+fade as
// the menu pops in beside the pressed element. Values tuned to match the alert/
// action sheet family's "present" feel rather than the snappier launcher-icon
// press. Named `contextMenuPresentIOS` to avoid colliding with the
// `CupertinoContextMenu` preset above (both live in this file).
export const contextMenuPresentIOS: SpringConfig = { damping: 22, stiffness: 320, mass: 1 };
