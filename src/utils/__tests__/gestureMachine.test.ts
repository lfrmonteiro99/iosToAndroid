import {
  commitForHome,
  commitForSwitcher,
  commitForBack,
  commitForQuickSwitch,
  commitForPanel,
  commitForNC,
  commitForSpotlight,
  commitForTodayView,
} from '../gestureMachine';
import type { CommitPredicate } from '../gestureMachine';
import { gestureConfig } from '../gestureConfig';

function pred(overrides: Partial<CommitPredicate>): CommitPredicate {
  return { progress: 0, velocity: 0, holdMs: 0, ...overrides };
}

describe('commitForHome', () => {
  it('returns distance when progress >= homeCommitProgress', () => {
    expect(
      commitForHome(pred({ progress: gestureConfig.homeCommitProgress })),
    ).toBe('distance');
  });

  it('returns velocity when upward velocity magnitude >= homeCommitVelocity', () => {
    // upward velocity is negative; -p.velocity >= threshold means p.velocity <= -threshold
    expect(
      commitForHome(pred({ velocity: -gestureConfig.homeCommitVelocity })),
    ).toBe('velocity');
  });

  it('returns hybrid when progress and velocity meet hybrid thresholds', () => {
    expect(
      commitForHome(
        pred({
          progress: gestureConfig.homeHybridProgress,
          velocity: -gestureConfig.homeHybridVelocity,
        }),
      ),
    ).toBe('hybrid');
  });

  it('returns none when below all thresholds', () => {
    expect(commitForHome(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });
});

describe('commitForBack', () => {
  it('returns distance when progress >= backCommitProgress', () => {
    expect(
      commitForBack(pred({ progress: gestureConfig.backCommitProgress })),
    ).toBe('distance');
  });

  it('returns velocity when rightward velocity >= backCommitVelocity', () => {
    expect(
      commitForBack(pred({ velocity: gestureConfig.backCommitVelocity })),
    ).toBe('velocity');
  });

  it('returns hybrid when progress and velocity meet hybrid thresholds', () => {
    expect(
      commitForBack(
        pred({
          progress: gestureConfig.backHybridProgress,
          velocity: gestureConfig.backHybridVelocity,
        }),
      ),
    ).toBe('hybrid');
  });

  it('returns none when below all thresholds', () => {
    expect(commitForBack(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });
});

describe('commitForSwitcher', () => {
  const validPred: CommitPredicate = {
    progress: gestureConfig.switcherProgressMin,
    velocity: 0,
    holdMs: gestureConfig.switcherHoldMinMs,
  };

  it('returns hold when all switcher conditions are met', () => {
    expect(commitForSwitcher(validPred)).toBe('hold');
  });

  it('returns none when holdMs is too short', () => {
    expect(
      commitForSwitcher({ ...validPred, holdMs: gestureConfig.switcherHoldMinMs - 1 }),
    ).toBe('none');
  });

  it('returns none when progress is below switcherProgressMin', () => {
    expect(
      commitForSwitcher({ ...validPred, progress: gestureConfig.switcherProgressMin - 0.01 }),
    ).toBe('none');
  });

  it('returns none when progress exceeds switcherProgressMax', () => {
    expect(
      commitForSwitcher({ ...validPred, progress: gestureConfig.switcherProgressMax + 0.01 }),
    ).toBe('none');
  });

  it('returns none when velocity magnitude exceeds switcherHoldVelocityMax', () => {
    expect(
      commitForSwitcher({
        ...validPred,
        velocity: gestureConfig.switcherHoldVelocityMax + 0.01,
      }),
    ).toBe('none');
  });

  // #686: Multitask view shows the Android home screen instead of the iOS
  // app switcher. Root cause: switcherProgressMax (0.58) capped the hold
  // zone at the lower-middle of the drag. A natural iOS swipe-up-and-hold
  // (drag most of the way up, pause) sits at progress ~0.8, which the
  // predicate rejected as 'none' — so HomeIndicator.onEnd fell through to
  // commitForHome (progress >= 0.52) and fired goHome(), dropping the user
  // onto the Android launcher. The hold must be recognized for the full
  // upward drag, so the upper bound is eliminated (max === 1.0).
  it('returns hold when the user holds a near-full swipe-up (progress well above switcherProgressMax)', () => {
    expect(
      commitForSwitcher({
        progress: 0.8,
        velocity: 0,
        holdMs: gestureConfig.switcherHoldMinMs,
      }),
    ).toBe('hold');
  });

  it('returns hold at the maximum possible progress (1.0) when held', () => {
    expect(
      commitForSwitcher({
        progress: 1,
        velocity: 0,
        holdMs: gestureConfig.switcherHoldMinMs,
      }),
    ).toBe('hold');
  });
});

describe('commitForQuickSwitch', () => {
  it('returns distance when progress >= 1', () => {
    expect(commitForQuickSwitch(pred({ progress: 1 }))).toBe('distance');
  });

  it('returns velocity when |velocity| >= quickSwitchVelocity', () => {
    expect(
      commitForQuickSwitch(pred({ velocity: gestureConfig.quickSwitchVelocity })),
    ).toBe('velocity');

    expect(
      commitForQuickSwitch(pred({ velocity: -gestureConfig.quickSwitchVelocity })),
    ).toBe('velocity');
  });

  it('returns hybrid when dist and velocity meet hybrid thresholds', () => {
    // progress such that progress * quickSwitchDistanceDp >= quickSwitchHybridDistanceDp
    const hybridProgress =
      gestureConfig.quickSwitchHybridDistanceDp / gestureConfig.quickSwitchDistanceDp;
    expect(
      commitForQuickSwitch(
        pred({
          progress: hybridProgress,
          velocity: gestureConfig.quickSwitchHybridVelocity,
        }),
      ),
    ).toBe('hybrid');
  });

  it('returns none when below all thresholds', () => {
    expect(commitForQuickSwitch(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });
});

describe('commitForPanel', () => {
  it('returns distance when progress >= panelCommitProgress', () => {
    expect(
      commitForPanel(pred({ progress: gestureConfig.panelCommitProgress })),
    ).toBe('distance');
  });

  it('returns velocity when downward velocity >= panelCommitVelocity', () => {
    expect(
      commitForPanel(pred({ velocity: gestureConfig.panelCommitVelocity })),
    ).toBe('velocity');
  });

  it('returns none when below all thresholds', () => {
    expect(commitForPanel(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });
});

describe('commitForNC', () => {
  it('returns distance when progress >= ncCommitProgress', () => {
    expect(
      commitForNC(pred({ progress: gestureConfig.ncCommitProgress })),
    ).toBe('distance');
  });

  it('returns velocity when downward velocity >= ncCommitVelocity', () => {
    expect(
      commitForNC(pred({ velocity: gestureConfig.ncCommitVelocity })),
    ).toBe('velocity');
  });

  it('returns none when below all thresholds', () => {
    expect(commitForNC(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });
});

describe('commitForSpotlight', () => {
  it('returns distance when progress >= 1 (dy >= spotlightCommitDp)', () => {
    expect(commitForSpotlight(pred({ progress: 1 }))).toBe('distance');
  });

  it('returns velocity when downward velocity >= spotlightCommitVelocity', () => {
    expect(
      commitForSpotlight(pred({ velocity: gestureConfig.spotlightCommitVelocity })),
    ).toBe('velocity');
  });

  it('returns none when below all thresholds', () => {
    expect(commitForSpotlight(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });
});

// #455: TodayViewScreen was registered in RootStackParamList and rendered in
// TabNavigator with a `slide_from_left` transition, but nothing in the app
// ever called `navigate('TodayView')` — the gesture the transition was built
// for was never wired up (see LauncherHomeScreen.tsx `todayViewGesture`).
// This is the pure commit predicate for the right-swipe-on-first-page gesture
// that now reaches it. Distance-only: it commits solely on how far the finger
// travelled, with no velocity component.
describe('commitForTodayView', () => {
  it('returns distance once translationX reaches todayViewCommitDp (progress >= 1)', () => {
    expect(commitForTodayView(pred({ progress: 1 }))).toBe('distance');
  });

  it('returns none for a partial drag that never reaches the commit distance', () => {
    expect(commitForTodayView(pred({ progress: 0.5 }))).toBe('none');
  });

  it('returns none for no movement at all', () => {
    expect(commitForTodayView(pred({ progress: 0, velocity: 0 }))).toBe('none');
  });

  it('returns none for a leftward drag (negative progress), never committing on the wrong direction', () => {
    expect(commitForTodayView(pred({ progress: -1 }))).toBe('none');
  });

  it('is not swayed by velocity alone — this gesture only commits on distance', () => {
    expect(commitForTodayView(pred({ progress: 0, velocity: 999 }))).toBe('none');
  });
});
