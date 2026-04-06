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
});
