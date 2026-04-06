import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CupertinoSwitch } from '../CupertinoSwitch';

describe('CupertinoSwitch', () => {
  it('renders without crashing', () => {
    const { getByRole } = render(<CupertinoSwitch value={false} />);
    expect(getByRole('switch')).toBeTruthy();
  });

  it('calls onValueChange when pressed', () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <CupertinoSwitch value={false} onValueChange={onValueChange} />,
    );
    fireEvent.press(getByRole('switch'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does not call onValueChange when disabled', () => {
    const onValueChange = jest.fn();
    const { getByRole } = render(
      <CupertinoSwitch value={false} onValueChange={onValueChange} disabled />,
    );
    fireEvent.press(getByRole('switch'));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
