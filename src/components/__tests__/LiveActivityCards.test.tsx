import React from 'react';
// Shared harness: turns off the Settings/Theme first-render gate so the
// component tree actually renders (see comment in test-utils.tsx).
import { render } from '../../test-utils';
import launcherModule from '../../../modules/launcher-module/src';
import {
  RideActivityCard,
  MatchActivityCard,
  TimerActivityCard,
  TrackingActivityCard,
  LiveActivityExampleDeck,
  clamp01,
  fractionOf,
  formatRemainingMs,
} from '../LiveActivityCards';

// #639 — example Live Activity cards that CONSUME the #626 helper
// (useLiveActivity) for the four use-cases named in the issue:
// transport (Uber), sports (live match), timers and parcel tracking.

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LiveActivityCards pure helpers (#639)', () => {
  it('clamp01 keeps 0 and 1, and clamps out-of-range values', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-0.2)).toBe(0); // negative → floor
    expect(clamp01(1.5)).toBe(1); // over → ceiling
  });

  it('fractionOf never divides by zero and clamps to 0..1', () => {
    expect(fractionOf(2, 4)).toBe(0.5);
    expect(fractionOf(0, 0)).toBe(0); // empty whole → 0, no NaN
    expect(fractionOf(5, 4)).toBe(1); // part past whole → 1
    expect(fractionOf(-1, 4)).toBe(0); // negative part → 0
  });

  it('formatRemainingMs renders mm:ss and clamps negatives to 00:00', () => {
    expect(formatRemainingMs(0)).toBe('00:00');
    expect(formatRemainingMs(40000)).toBe('00:40');
    expect(formatRemainingMs(65000)).toBe('01:05');
    expect(formatRemainingMs(-5000)).toBe('00:00'); // overdue → 0
  });
});

describe('RideActivityCard — transport / Uber (#639)', () => {
  const base = {
    id: 'ride-1',
    active: true,
    driverName: 'Ana',
    etaText: '2 min away',
    destination: 'Home',
    progress: 0.8,
  };

  it('posts the activity and shows the ride info when active', () => {
    const { getByText } = render(<RideActivityCard {...base} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'ride-1',
      'Uber',
      'Ana · 2 min away',
      80,
      100,
    );
    expect(getByText('Uber')).toBeTruthy();
    expect(getByText('Ana · 2 min away')).toBeTruthy();
  });

  it('does NOT post or render when inactive (inverse of the fix)', () => {
    const { queryByText } = render(<RideActivityCard {...base} active={false} />);

    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
    expect(queryByText('Uber')).toBeNull();
  });

  it('does not post when id is empty even if active', () => {
    render(<RideActivityCard {...base} id="" />);
    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
  });

  it('re-posts (updates in place) when progress changes, without cancelling', () => {
    const { rerender } = render(<RideActivityCard {...base} />);
    (launcherModule.postLiveActivity as jest.Mock).mockClear();

    rerender(<RideActivityCard {...base} progress={0.9} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'ride-1',
      'Uber',
      'Ana · 2 min away',
      90,
      100,
    );
    expect(launcherModule.cancelLiveActivity).not.toHaveBeenCalled();
  });

  it('double toggle (active→inactive→active) leaves it posted, not stuck cancelled', () => {
    const { rerender } = render(<RideActivityCard {...base} />);

    rerender(<RideActivityCard {...base} active={false} />);
    expect(launcherModule.cancelLiveActivity).toHaveBeenCalledTimes(1);

    rerender(<RideActivityCard {...base} active />);
    expect(launcherModule.postLiveActivity).toHaveBeenCalledTimes(2); // mount + re-activation
    expect(launcherModule.cancelLiveActivity).toHaveBeenCalledTimes(1);
  });
});

describe('MatchActivityCard — live sports (#639)', () => {
  const base = {
    id: 'match-1',
    active: true,
    homeTeam: 'Benfica',
    awayTeam: 'Porto',
    homeScore: 2,
    awayScore: 1,
    clock: "67'",
    progress: 0.5,
  };

  it('posts the live score and renders it', () => {
    const { getByText } = render(<MatchActivityCard {...base} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'match-1',
      'Benfica vs Porto',
      '2–1 · 67\'',
      50,
      100,
    );
    expect(getByText('Benfica vs Porto')).toBeTruthy();
    expect(getByText('2–1 · 67\'')).toBeTruthy();
  });

  it('does not post when inactive', () => {
    render(<MatchActivityCard {...base} active={false} />);
    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
  });
});

describe('TimerActivityCard — countdown (#639)', () => {
  const base = {
    id: 'timer-1',
    active: true,
    label: 'Tea',
    remainingMs: 30000,
    totalMs: 60000,
  };

  it('posts elapsed fraction and remaining mm:ss when active', () => {
    const { getByText } = render(<TimerActivityCard {...base} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'timer-1',
      'Tea',
      '00:30',
      50, // (60000-30000)/60000
      100,
    );
    expect(getByText('00:30')).toBeTruthy();
  });

  it('does not divide by zero when totalMs is 0', () => {
    render(<TimerActivityCard {...base} totalMs={0} />);
    // 0 progress, no NaN — still posts a sane (0) value rather than throwing
    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'timer-1',
      'Tea',
      '00:30',
      0,
      100,
    );
  });

  it('does not post when inactive', () => {
    render(<TimerActivityCard {...base} active={false} />);
    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
  });
});

describe('TrackingActivityCard — parcel tracking (#639)', () => {
  const base = {
    id: 'track-1',
    active: true,
    carrier: 'DHL',
    status: 'Out for delivery',
    stepIndex: 2,
    totalSteps: 4,
  };

  it('posts the step fraction and status when active', () => {
    const { getByText } = render(<TrackingActivityCard {...base} />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'track-1',
      'DHL',
      'Out for delivery',
      50, // 2/4
      100,
    );
    expect(getByText('DHL')).toBeTruthy();
    expect(getByText('Out for delivery')).toBeTruthy();
  });

  it('does not divide by zero when totalSteps is 0', () => {
    render(<TrackingActivityCard {...base} totalSteps={0} />);
    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'track-1',
      'DHL',
      'Out for delivery',
      0,
      100,
    );
  });

  it('does not post when inactive', () => {
    render(<TrackingActivityCard {...base} active={false} />);
    expect(launcherModule.postLiveActivity).not.toHaveBeenCalled();
  });
});

describe('LiveActivityExampleDeck (#639)', () => {
  it('mounts all four example cards and posts four distinct activities', () => {
    render(<LiveActivityExampleDeck />);

    expect(launcherModule.postLiveActivity).toHaveBeenCalledTimes(4);
    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'example-ride',
      'Uber',
      expect.any(String),
      80,
      100,
    );
    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'example-match',
      'Benfica vs Porto',
      expect.any(String),
      50,
      100,
    );
    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'example-timer',
      'Tea',
      '00:30',
      50,
      100,
    );
    expect(launcherModule.postLiveActivity).toHaveBeenCalledWith(
      'example-track',
      'DHL',
      'Out for delivery',
      50,
      100,
    );
  });
});
