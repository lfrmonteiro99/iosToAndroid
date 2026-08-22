/** Milliseconds of inactivity after which the home indicator / assistive touch fades */
export const IDLE_DIM_MS = 2500;

export const gestureConfig = {
  // Zones (all dp = React Native px)
  bottomZoneHeightDp: 28,
  leftEdgeWidthDp: 20,
  topZoneHeightDp: 24,
  controlCenterWidthRatio: 0.34,

  // Travel distances
  homeTravelDp: 220,
  switcherTravelDp: 220,
  backTravelRatio: 0.33,
  panelTravelDp: 180,

  // Axis lock
  axisLockDp: 10,

  // Home
  homeCommitProgress: 0.52,
  homeCommitVelocity: 1.10,
  homeHybridProgress: 0.32,
  homeHybridVelocity: 0.75,

  // Switcher (hold)
  switcherHoldMinMs: 140,
  switcherProgressMin: 0.28,
  switcherProgressMax: 0.58,
  switcherHoldVelocityMax: 0.35,

  // Quick switch (horizontal on home bar)
  quickSwitchDistanceDp: 56,
  quickSwitchVelocity: 0.85,
  quickSwitchHybridDistanceDp: 32,
  quickSwitchHybridVelocity: 0.55,

  // Back
  backCommitProgress: 0.35,
  backCommitVelocity: 0.75,
  backHybridProgress: 0.18,
  backHybridVelocity: 0.55,

  // Top panels (CC)
  panelCommitProgress: 0.32,
  panelCommitVelocity: 0.80,
  // Notification Center
  ncCommitProgress: 0.28,
  ncCommitVelocity: 0.75,

  // Spotlight
  spotlightRevealDp: 8,
  spotlightCommitDp: 32,
  spotlightCommitVelocity: 0.55,

  // Today View (right-swipe reveal from the first home page — #455)
  todayViewCommitDp: 64,

  // Swipe row actions
  swipeActionRevealDp: 10,
  swipeActionFirstExposedDp: 64,
  swipeActionFullSwipeDp: 132,
  swipeActionFullSwipeVelocity: 1.0,

  // Card dismiss (app switcher card)
  cardDismissDp: 84,
  cardDismissVelocity: -0.9,

  // Springs — tuned empirically against real on-device gesture feel, NOT from
  // ESPECIFICACAO.md §3.1's estimated presets (see src/theme/springPresets.ts).
  // Stiffness here runs 3-4x higher than the theme's springs because these settle
  // a gesture that's already moving — `resolveSpringConfig` (useGestureReduceMotion.ts)
  // merges in the real release velocity, so a spring tuned for a standstill UI
  // transition reads as sluggish/laggy mid-drag. Do not "align" these to
  // springPresets.ts without a before/after capture (issue #492).
  // (The previous "§13.3" reference was dead: the current spec's §13 is "Aferição"
  // and has no subsections — issue #492.)
  spring: {
    fastSettle: { stiffness: 760, damping: 58, mass: 1 },
    mediumSettle: { stiffness: 680, damping: 52, mass: 1 },
    softCarousel: { stiffness: 560, damping: 44, mass: 1 },
    homeSettle: { stiffness: 700, damping: 52, mass: 1 },
    switcherSettle: { stiffness: 620, damping: 48, mass: 1 },
    backSettle: { stiffness: 760, damping: 56, mass: 1 },
    // App-icon expand transition (#509, §6.3) — tuned to settle in ~280ms.
    appLaunch: { stiffness: 320, damping: 30, mass: 1 },
  },

  // Velocity window
  velocityWindowMs: 60,
  velocityClampDpPerMs: 4.0,
} as const;

export function dpPerMsToPtPerSec(v: number): number {
  return v * 1000;
}

export function ptPerSecToDpPerMs(v: number): number {
  return v / 1000;
}

export function zones(
  width: number,
  height: number,
): {
  bottom: { top: number; bottom: number; left: number; right: number };
  leftEdge: { top: number; bottom: number; left: number; right: number };
  controlCenter: { top: number; bottom: number; left: number; right: number };
  notificationCenter: { top: number; bottom: number; left: number; right: number };
} {
  'worklet';
  const topStripHeight = gestureConfig.topZoneHeightDp + 20;
  const ccWidth = Math.round(width * gestureConfig.controlCenterWidthRatio);

  return {
    bottom: {
      top: height - gestureConfig.bottomZoneHeightDp,
      bottom: height,
      left: 0,
      right: width,
    },
    leftEdge: {
      top: 0,
      bottom: height,
      left: 0,
      right: gestureConfig.leftEdgeWidthDp,
    },
    controlCenter: {
      top: 0,
      bottom: topStripHeight,
      left: width - ccWidth,
      right: width,
    },
    notificationCenter: {
      top: 0,
      bottom: topStripHeight,
      left: 0,
      right: width - ccWidth,
    },
  };
}
