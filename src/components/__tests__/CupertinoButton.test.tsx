import React, { useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import { render, fireEvent } from '../../test-utils';
import { CupertinoButton } from '../CupertinoButton';
import { useSettings } from '../../store/SettingsStore';

// Sets a global press-feedback preference before the button under test mounts
// its press listeners. Mirrors the pattern used elsewhere in this suite for
// asserting against SettingsStore-driven behaviour (see AccessibilityScreen
// tests' Reader components).
function SetPressFeedback({ value }: { value: 'scale-opacity' | 'opacity' | 'none' }) {
  const { update } = useSettings();
  useEffect(() => { update('pressFeedback', value); }, [value, update]);
  return null;
}

describe('CupertinoButton', () => {
  it('renders button with title', () => {
    const { getByText } = render(<CupertinoButton title="Press Me" />);
    expect(getByText('Press Me')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<CupertinoButton title="Tap Me" onPress={onPress} />);
    fireEvent.press(getByText('Tap Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders disabled state and does not call onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <CupertinoButton title="Disabled" onPress={onPress} disabled />,
    );
    expect(getByText('Disabled')).toBeTruthy();
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('debounces rapid successive presses within 300ms', () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    const { getByText } = render(<CupertinoButton title="Send" onPress={onPress} />);
    const button = getByText('Send');

    // First press fires
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    // Second press within 300ms is debounced
    jest.advanceTimersByTime(100);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1); // Still 1, not 2

    jest.useRealTimers();
  });

  it('allows press after debounce window expires', () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    const { getByText } = render(<CupertinoButton title="Send" onPress={onPress} />);
    const button = getByText('Send');

    // First press
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    // Advance past debounce window (300ms)
    jest.advanceTimersByTime(300);

    // Second press should fire
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('handles multiple rapid presses correctly', () => {
    jest.useFakeTimers();
    const onPress = jest.fn();
    const { getByText } = render(<CupertinoButton title="Save" onPress={onPress} />);
    const button = getByText('Save');

    // First press
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    // Rapid presses within 300ms are all debounced
    jest.advanceTimersByTime(50);
    fireEvent.press(button);
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    // After 300ms, new press fires
    jest.advanceTimersByTime(250); // total 300ms from first press
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  // #497: pressFeedback: 'none' removes the visual scale/opacity effect but
  // must never silence the haptic (§3.2.4 — cutting animation ≠ cutting
  // haptics). hapticImpact fires from this component's onPress handler, a
  // call site untouched by useCupertinoPress's visual-only logic — this test
  // guards against a future regression that wires it through pressFeedback.
  it("still fires haptic feedback on press when pressFeedback is 'none'", () => {
    (Haptics.impactAsync as jest.Mock).mockClear();
    const { getByText } = render(
      <>
        <SetPressFeedback value="none" />
        <CupertinoButton title="Tap" onPress={() => {}} />
      </>,
    );

    fireEvent.press(getByText('Tap'));

    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});
