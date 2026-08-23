import React from 'react';
import { render, fireEvent, act } from '../../../test-utils';
import { DisplayBrightnessScreen } from '../DisplayBrightnessScreen';
import Brightness from 'expo-brightness';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('DisplayBrightnessScreen', () => {
  it('offers Light / Dark / Automatic appearance options', () => {
    const { getAllByText } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    // 'Light'/'Dark' appear both as the phone-mock labels and as the segmented
    // control options; 'Automatic' only exists in the segmented control.
    expect(getAllByText('Light').length).toBeGreaterThan(0);
    expect(getAllByText('Dark').length).toBeGreaterThan(0);
    expect(getAllByText('Automatic').length).toBeGreaterThan(0);
  });

  it('renders an "Auto-Brightness" toggle defaulting to on (#612)', () => {
    const { getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    const toggle = getByTestId('auto-brightness-switch');
    expect(toggle.props.accessibilityState.checked).toBe(true);
    expect(toggle.props.accessibilityState.disabled).toBe(false);
  });

  it('disables the brightness slider while Auto-Brightness is on (#612)', () => {
    const { getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    const slider = getByTestId('brightness-slider');
    expect(slider.props.accessibilityState.disabled).toBe(true);
  });

  it('enables the slider and flips auto off when the toggle is switched (#612)', () => {
    const { getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);

    const toggle = getByTestId('auto-brightness-switch');
    expect(toggle.props.accessibilityState.checked).toBe(true);
    expect(getByTestId('brightness-slider').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(toggle);

    // Toggle now off…
    expect(getByTestId('auto-brightness-switch').props.accessibilityState.checked).toBe(false);
    // …and the slider is now interactive.
    expect(getByTestId('brightness-slider').props.accessibilityState.disabled).toBe(false);
  });

  it('does not flip auto back on when the slider is moved while manual (#612)', () => {
    const { getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    fireEvent.press(getByTestId('auto-brightness-switch'));

    const slider = getByTestId('brightness-slider');
    expect(slider.props.accessibilityState.disabled).toBe(false);
    // Moving the slider must not re-enable auto-brightness.
    fireEvent(slider, 'onValueChange', 0.4);
    expect(getByTestId('auto-brightness-switch').props.accessibilityState.checked).toBe(false);
    expect(getByTestId('brightness-slider').props.accessibilityState.disabled).toBe(false);
  });

  it('does NOT call setBrightnessAsync when the manual slider is moved while auto is on (local no-op, #612)', () => {
    const setBrightnessAsync = Brightness.setBrightnessAsync as jest.Mock;
    setBrightnessAsync.mockClear();

    const { getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);

    // Auto-Brightness is on by default → slider is disabled and its
    // onValueChange is guarded. A (programmatic) onValueChange must be ignored.
    const slider = getByTestId('brightness-slider');
    fireEvent(slider, 'onValueChange', 0.8);
    expect(setBrightnessAsync).not.toHaveBeenCalled();
  });

  it('calls setBrightnessAsync when the manual slider is moved after auto is turned off (local no-op released, #612)', async () => {
    const setBrightnessAsync = Brightness.setBrightnessAsync as jest.Mock;
    setBrightnessAsync.mockClear();

    const { getByTestId } = render(<DisplayBrightnessScreen navigation={mockNavigation as never} />);
    await act(async () => { fireEvent.press(getByTestId('auto-brightness-switch')); });

    const slider = getByTestId('brightness-slider');
    fireEvent(slider, 'onValueChange', 0.3);
    expect(setBrightnessAsync).toHaveBeenCalledWith(0.3);
  });
});
