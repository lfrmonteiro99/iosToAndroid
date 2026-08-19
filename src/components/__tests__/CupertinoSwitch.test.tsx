import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { CupertinoSwitch } from '../CupertinoSwitch';
import * as Haptics from 'expo-haptics';
import { setHapticsEnabled } from '../../utils/haptics';

describe('CupertinoSwitch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setHapticsEnabled(true);
  });

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

  it('calls haptic feedback when switch is pressed (H5)', () => {
    const { getByRole } = render(<CupertinoSwitch value={false} />);
    fireEvent.press(getByRole('switch'));
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('does not call haptics when disabled (H5)', () => {
    (Haptics.selectionAsync as jest.Mock).mockClear();
    const { getByRole } = render(<CupertinoSwitch value={false} disabled />);
    fireEvent.press(getByRole('switch'));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('swallows haptics rejection without throwing or warning (H5)', async () => {
    // This test ensures that when hapticSelection() rejects,
    // the component has a `.catch()` handler that prevents unhandled rejections.
    // Before fix: hapticSelection() without .catch() causes unhandled rejection warning
    // After fix: hapticSelection().catch(() => {}) swallows the error silently
    (Haptics.selectionAsync as jest.Mock).mockClear();
    (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('haptics unavailable'));

    // Capture unhandled rejections
    const unhandledRejections: Error[] = [];
    const rejectionHandler = (reason: Error) => unhandledRejections.push(reason);
    process.on('unhandledRejection', rejectionHandler as NodeJS.UncaughtExceptionListener);

    const { getByRole } = render(<CupertinoSwitch value={false} />);
    fireEvent.press(getByRole('switch'));

    // Give any microtasks time to run
    await new Promise(resolve => setTimeout(resolve, 10));

    // After fix, there should be no unhandled rejections because .catch() handles it
    // Without the fix, this would have captured the rejection
    expect(unhandledRejections.length).toBe(0);

    process.off('unhandledRejection', rejectionHandler as NodeJS.UncaughtExceptionListener);
  });
});
