import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CupertinoButton } from '../CupertinoButton';

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
});
