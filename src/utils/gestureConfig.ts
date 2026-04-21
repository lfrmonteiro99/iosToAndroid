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

  // Swipe row actions
  swipeActionRevealDp: 10,
  swipeActionFirstExposedDp: 64,
  swipeActionFullSwipeDp: 132,
  swipeActionFullSwipeVelocity: 1.0,

  // Card dismiss (app switcher card)
  cardDismissDp: 84,
  cardDismissVelocity: -0.9,

  // Springs — per §13.3 of spec
  spring: {
    fastSettle: { stiffness: 760, damping: 58, mass: 1 },
    mediumSettle: { stiffness: 680, damping: 52, mass: 1 },
    softCarousel: { stiffness: 560, damping: 44, mass: 1 },
    homeSettle: { stiffness: 700, damping: 52, mass: 1 },
    switcherSettle: { stiffness: 620, damping: 48, mass: 1 },
    backSettle: { stiffness: 760, damping: 56, mass: 1 },
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
