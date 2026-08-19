import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent } from '../../test-utils';
import { CupertinoSwitch } from '../CupertinoSwitch';
import * as Haptics from 'expo-haptics';
import { setHapticsEnabled } from '../../utils/haptics';
import { useSettings } from '../../store/SettingsStore';

/** Turns the real `vibration` setting off; SettingsStore feeds the haptics cache. */
function DisableVibration() {
  const { update } = useSettings();
  return (
    <Pressable testID="disable-vibration" onPress={() => update('vibration', false)}>
      <Text>off</Text>
    </Pressable>
  );
}

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

  it('does not touch the native module when the user disabled vibration (H5)', () => {
    // The old `Haptics.selectionAsync()` call site ignored the vibration setting
    // entirely; hapticSelection() consults the cache fed by SettingsStore.
    const onValueChange = jest.fn();
    const { getByRole, getByTestId } = render(
      <>
        <DisableVibration />
        <CupertinoSwitch value={false} onValueChange={onValueChange} />
      </>,
    );
    fireEvent.press(getByTestId('disable-vibration'));
    fireEvent.press(getByRole('switch'));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    // Silencing vibration must not silence the switch itself.
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does not leak an unhandled rejection when the native module rejects (H5)', async () => {
    // What this proves is the routing, not the `.catch(() => {})` at the call site:
    // a rejection from expo-haptics is absorbed inside hapticSelection()
    // (src/utils/haptics.ts). Before H5 the component awaited nothing and caught
    // nothing, so the rejected promise reached Node as unhandled.
    (Haptics.selectionAsync as jest.Mock).mockRejectedValueOnce(new Error('haptics unavailable'));

    const captured: unknown[] = [];
    const handler = (reason: unknown) => captured.push(reason);
    process.on('unhandledRejection', handler);
    try {
      const { getByRole } = render(<CupertinoSwitch value={false} />);
      fireEvent.press(getByRole('switch'));
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off('unhandledRejection', handler);
    }

    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(captured).toEqual([]);
  });
});
