import React from 'react';
import { Text } from 'react-native';
import { render } from '../../test-utils';
import { useSettings } from '../../store/SettingsStore';
import { WhitePointOverlay } from '../WhitePointOverlay';

// Drive the global store from inside the same test tree so we exercise the real
// wiring (SettingsProvider → WhitePointOverlay), not a reimplemented copy.
function StoreDriver({ reduceWhitePoint, whitePointLevel }: { reduceWhitePoint?: boolean; whitePointLevel?: number }) {
  const { update } = useSettings();
  React.useEffect(() => {
    if (reduceWhitePoint !== undefined) update('reduceWhitePoint', reduceWhitePoint);
    if (whitePointLevel !== undefined) update('whitePointLevel', whitePointLevel);
  }, [update, reduceWhitePoint, whitePointLevel]);
  return null;
}

// Sentinel content that must stay visible *under* the overlay: it proves the
// overlay is pointerEvents:none (taps pass through to the UI).
function Underlay() {
  return <Text testID="underlay">visible content</Text>;
}

describe('WhitePointOverlay (#614)', () => {
  it('renders nothing when Reduce White Point is off (no dead overlay)', () => {
    const { queryByTestId } = render(
      <>
        <WhitePointOverlay />
        <Underlay />
      </>,
    );
    expect(queryByTestId('white-point-overlay')).toBeNull();
    expect(queryByTestId('underlay')).toBeTruthy();
  });

  it('mounts the overlay when Reduce White Point is enabled and stays tap-through', () => {
    const { getByTestId, queryByTestId } = render(
      <>
        <StoreDriver reduceWhitePoint />
        <WhitePointOverlay />
        <Underlay />
      </>,
    );
    expect(queryByTestId('underlay')).toBeTruthy();
    const overlay = getByTestId('white-point-overlay');
    expect(overlay).toBeTruthy();
    // Overlay must not eat taps: the underlying content stays interactive.
    expect(overlay.props.pointerEvents).toBe('none');
  });

  it('overlay opacity equals 1 - whitePointLevel (default level 1.0 → 0 opacity)', () => {
    const { getByTestId } = render(
      <>
        <StoreDriver reduceWhitePoint />
        <WhitePointOverlay />
      </>,
    );
    const style = getByTestId('white-point-overlay').props.style;
    const bg = Array.isArray(style) ? style[style.length - 1].backgroundColor : style.backgroundColor;
    expect(bg).toBe('rgba(0,0,0,0)');
  });

  it('overlay opacity reflects a lower white-point level (0.5 → 0.5 opacity)', () => {
    const { getByTestId } = render(
      <>
        <StoreDriver reduceWhitePoint whitePointLevel={0.5} />
        <WhitePointOverlay />
      </>,
    );
    const style = getByTestId('white-point-overlay').props.style;
    const bg = Array.isArray(style) ? style[style.length - 1].backgroundColor : style.backgroundColor;
    expect(bg).toBe('rgba(0,0,0,0.5)');
  });

  it('toggling off after being on removes the overlay (inverse of the fix)', () => {
    const { rerender, queryByTestId } = render(
      <>
        <StoreDriver reduceWhitePoint />
        <WhitePointOverlay />
      </>,
    );
    expect(queryByTestId('white-point-overlay')).toBeTruthy();

    rerender(
      <>
        <StoreDriver reduceWhitePoint={false} />
        <WhitePointOverlay />
      </>,
    );
    expect(queryByTestId('white-point-overlay')).toBeNull();
  });
});
