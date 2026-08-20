import {
  commitForHome,
  commitForSwitcher,
  commitForBack,
  commitForQuickSwitch,
  commitForPanel,
  commitForNC,
  commitForSpotlight,
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
