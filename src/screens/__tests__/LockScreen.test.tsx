import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { LockScreen } from '../LockScreen';

describe('LockScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<LockScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders flashlight button', () => {
    const { getByLabelText } = render(<LockScreen />);
    expect(getByLabelText('Flashlight')).toBeTruthy();
  });

  it('renders camera button', () => {
    const { getByLabelText } = render(<LockScreen />);
    expect(getByLabelText('Camera')).toBeTruthy();
  });

  it('renders Use Passcode button', () => {
    const { getByLabelText } = render(<LockScreen />);
    expect(getByLabelText('Use passcode to unlock')).toBeTruthy();
  });

  it('shows passcode numpad when Use Passcode is pressed', () => {
    const { getByLabelText, getByText } = render(<LockScreen />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    expect(getByText('Enter Passcode')).toBeTruthy();
  });

  it('passcode numpad has digit buttons', () => {
    const { getByLabelText, getByText } = render(<LockScreen />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    expect(getByLabelText('Digit 1')).toBeTruthy();
    expect(getByLabelText('Digit 0')).toBeTruthy();
    expect(getByLabelText('Delete')).toBeTruthy();
  });

  it('calls onUnlock when correct PIN entered', async () => {
    const onUnlock = jest.fn();
    const { getByLabelText } = render(<LockScreen onUnlock={onUnlock} />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    // Default PIN is 1234
    fireEvent.press(getByLabelText('Digit 1'));
    fireEvent.press(getByLabelText('Digit 2'));
    fireEvent.press(getByLabelText('Digit 3'));
    fireEvent.press(getByLabelText('Digit 4'));
    // Allow async AsyncStorage check to resolve
    await new Promise(r => setTimeout(r, 100));
    expect(onUnlock).toHaveBeenCalled();
  });

  it('cancel hides passcode overlay', () => {
    const { getByLabelText, queryByText } = render(<LockScreen />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    fireEvent.press(getByLabelText('Cancel passcode entry'));
    expect(queryByText('Enter Passcode')).toBeNull();
  });
});
