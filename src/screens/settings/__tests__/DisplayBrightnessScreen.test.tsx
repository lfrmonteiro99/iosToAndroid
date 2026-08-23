import React from 'react';
import { render, fireEvent } from '../../../test-utils';
import { DisplayBrightnessScreen } from '../DisplayBrightnessScreen';

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
});
