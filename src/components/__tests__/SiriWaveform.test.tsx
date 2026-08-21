import React from 'react';
import * as Reanimated from 'react-native-reanimated';
import { render as rtlRender } from '@testing-library/react-native';
import {
  SiriWaveform,
  SIRI_WAVEFORM_BAR_COUNT,
  SIRI_WAVEFORM_ACTIVE_OPACITY,
  SIRI_WAVEFORM_ACTIVE_SCALE,
} from '../SiriWaveform';
import { SettingsProvider } from '../../store/SettingsStore';
import { ThemeProvider } from '../../theme/ThemeContext';
import * as gestureReduceMotionModule from '../../utils/useGestureReduceMotion';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider gateFirstRender={false}>
      <ThemeProvider gateFirstRender={false}>{children}</ThemeProvider>
    </SettingsProvider>
  );
}

function render(ui: React.ReactElement) {
  return rtlRender(<Providers>{ui}</Providers>);
}

// rtlRender's `rerender` does not re-apply the `wrapper` option, so wrap
// explicitly whenever a test re-renders — otherwise the tree is remounted and
// the effect re-runs for the wrong reason.
function wrap(ui: React.ReactElement) {
  return <Providers>{ui}</Providers>;
}

describe('SiriWaveform', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the bars in the idle state without starting a loop', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    const { getByTestId, getAllByTestId } = render(<SiriWaveform listening={false} />);

    expect(getByTestId('siri-waveform')).toBeTruthy();
    expect(getAllByTestId(/^siri-waveform-bar-/)).toHaveLength(SIRI_WAVEFORM_BAR_COUNT);
    expect(withRepeatSpy).not.toHaveBeenCalled();
  });

  it('starts a repeating animation per bar when mounted while listening', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    render(<SiriWaveform listening />);

    // scale + opacity per bar, all infinite (-1) and reversing (true).
    expect(withRepeatSpy).toHaveBeenCalledTimes(SIRI_WAVEFORM_BAR_COUNT * 2);
    for (const call of withRepeatSpy.mock.calls) {
      expect(call[1]).toBe(-1);
      expect(call[2]).toBe(true);
    }
  });

  it('starts the loop when listening flips from false to true', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    const { rerender } = render(<SiriWaveform listening={false} />);
    expect(withRepeatSpy).not.toHaveBeenCalled();

    rerender(wrap(<SiriWaveform listening />));
    expect(withRepeatSpy).toHaveBeenCalledTimes(SIRI_WAVEFORM_BAR_COUNT * 2);
  });

  it('cancels the loop when listening flips back to false (inverse of the fix)', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const cancelSpy = jest.spyOn(Reanimated, 'cancelAnimation');

    const { rerender } = render(<SiriWaveform listening />);
    cancelSpy.mockClear();

    rerender(wrap(<SiriWaveform listening={false} />));

    // effect cleanup (2 per bar) + explicit idle reset (2 per bar)
    expect(cancelSpy).toHaveBeenCalled();
    expect(cancelSpy.mock.calls.length).toBeGreaterThanOrEqual(SIRI_WAVEFORM_BAR_COUNT * 2);
  });

  it('animates towards the documented active scale/opacity targets', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const withTimingSpy = jest.spyOn(Reanimated, 'withTiming');

    render(<SiriWaveform listening />);

    const targets = withTimingSpy.mock.calls.map((call) => call[0]);
    expect(targets).toHaveLength(SIRI_WAVEFORM_BAR_COUNT * 2);
    expect(new Set(targets)).toEqual(
      new Set([SIRI_WAVEFORM_ACTIVE_SCALE, SIRI_WAVEFORM_ACTIVE_OPACITY]),
    );
    for (const call of withTimingSpy.mock.calls) {
      expect((call[1] as { duration: number }).duration).toBeGreaterThan(0);
    }
  });

  it('cancels every animation on unmount while listening (no dangling callback)', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);
    const cancelSpy = jest.spyOn(Reanimated, 'cancelAnimation');

    const { unmount } = render(<SiriWaveform listening />);
    cancelSpy.mockClear();

    unmount();

    expect(cancelSpy).toHaveBeenCalledTimes(SIRI_WAVEFORM_BAR_COUNT * 2);
  });

  it('does not loop when reduce motion is enabled, even while listening', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(true);
    const withRepeatSpy = jest.spyOn(Reanimated, 'withRepeat');

    const { getAllByTestId } = render(<SiriWaveform listening />);

    expect(withRepeatSpy).not.toHaveBeenCalled();
    expect(getAllByTestId(/^siri-waveform-bar-/)).toHaveLength(SIRI_WAVEFORM_BAR_COUNT);
  });

  it('exposes the listening state through the accessibility label', () => {
    jest.spyOn(gestureReduceMotionModule, 'useGestureReduceMotion').mockReturnValue(false);

    const { getByTestId, rerender } = render(<SiriWaveform listening={false} />);
    expect(getByTestId('siri-waveform').props.accessibilityLabel).toBe('Not listening');

    rerender(wrap(<SiriWaveform listening />));
    expect(getByTestId('siri-waveform').props.accessibilityLabel).toBe('Listening');
  });
});
