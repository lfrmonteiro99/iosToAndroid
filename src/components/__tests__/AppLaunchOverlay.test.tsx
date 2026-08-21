import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import { render } from '../../test-utils';
import { AppLaunchOverlay, interpolateLaunchFrame } from '../AppLaunchOverlay';

const BOUNDS = { x: 12, y: 34, width: 60, height: 60 };

describe('interpolateLaunchFrame (#509 §6.3)', () => {
  it('sits exactly at the icon bounds at progress 0', () => {
    const frame = interpolateLaunchFrame(BOUNDS, 0, 1080, 2000);
    expect(frame).toEqual(expect.objectContaining({ x: 12, y: 34, width: 60, height: 60 }));
  });

  it('covers the full screen at progress 1', () => {
    const frame = interpolateLaunchFrame(BOUNDS, 1, 1080, 2000);
    expect(frame).toEqual(expect.objectContaining({ x: 0, y: 0, width: 1080, height: 2000 }));
  });

  it('is exactly halfway between the icon and the screen at progress 0.5', () => {
    const frame = interpolateLaunchFrame(BOUNDS, 0.5, 1080, 2000);
    expect(frame.x).toBeCloseTo(6);
    expect(frame.y).toBeCloseTo(17);
    expect(frame.width).toBeCloseTo((60 + 1080) / 2);
    expect(frame.height).toBeCloseTo((60 + 2000) / 2);
  });

  it('rounds the corner radius down to 0 as the icon becomes the full screen', () => {
    expect(interpolateLaunchFrame(BOUNDS, 0, 1080, 2000).borderRadius).toBeGreaterThan(0);
    expect(interpolateLaunchFrame(BOUNDS, 1, 1080, 2000).borderRadius).toBe(0);
  });

  it('clamps progress outside [0, 1] instead of overshooting the frame', () => {
    const under = interpolateLaunchFrame(BOUNDS, -0.5, 1080, 2000);
    const over = interpolateLaunchFrame(BOUNDS, 1.5, 1080, 2000);
    expect(under).toEqual(interpolateLaunchFrame(BOUNDS, 0, 1080, 2000));
    expect(over).toEqual(interpolateLaunchFrame(BOUNDS, 1, 1080, 2000));
  });
});

describe('AppLaunchOverlay', () => {
  afterEach(() => jest.restoreAllMocks());

  it('fires onExpandComplete when the expand spring reports it settled', () => {
    jest.spyOn(Reanimated, 'withSpring').mockImplementation(
      ((toValue: number, _cfg: unknown, cb?: (finished: boolean) => void) => {
        cb?.(true);
        return toValue;
      }) as typeof Reanimated.withSpring,
    );
    const onExpandComplete = jest.fn();
    render(
      <AppLaunchOverlay icon="file://icon.png" bounds={BOUNDS} phase="expand" onExpandComplete={onExpandComplete} />,
    );
    expect(onExpandComplete).toHaveBeenCalledTimes(1);
  });

  it('does not fire onExpandComplete when the spring is interrupted (finished=false)', () => {
    jest.spyOn(Reanimated, 'withSpring').mockImplementation(
      ((toValue: number, _cfg: unknown, cb?: (finished: boolean) => void) => {
        cb?.(false);
        return toValue;
      }) as typeof Reanimated.withSpring,
    );
    const onExpandComplete = jest.fn();
    render(
      <AppLaunchOverlay icon="file://icon.png" bounds={BOUNDS} phase="expand" onExpandComplete={onExpandComplete} />,
    );
    expect(onExpandComplete).not.toHaveBeenCalled();
  });

  it('fires onCollapseComplete (not onExpandComplete) when mounted directly in the collapse phase', () => {
    jest.spyOn(Reanimated, 'withSpring').mockImplementation(
      ((toValue: number, _cfg: unknown, cb?: (finished: boolean) => void) => {
        cb?.(true);
        return toValue;
      }) as typeof Reanimated.withSpring,
    );
    const onExpandComplete = jest.fn();
    const onCollapseComplete = jest.fn();
    render(
      <AppLaunchOverlay
        icon="file://icon.png"
        bounds={BOUNDS}
        phase="collapse"
        onExpandComplete={onExpandComplete}
        onCollapseComplete={onCollapseComplete}
      />,
    );
    expect(onCollapseComplete).toHaveBeenCalledTimes(1);
    expect(onExpandComplete).not.toHaveBeenCalled();
  });

  it('renders with the app-launch-overlay testID so callers can assert visibility', () => {
    const { getByTestId } = render(
      <AppLaunchOverlay icon="file://icon.png" bounds={BOUNDS} phase="expand" onExpandComplete={() => {}} />,
    );
    expect(getByTestId('app-launch-overlay')).toBeTruthy();
  });
});
