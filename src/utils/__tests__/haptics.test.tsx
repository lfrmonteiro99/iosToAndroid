import React from 'react';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act } from '@testing-library/react-native';
import { hapticImpact, hapticSelection, hapticNotification, setHapticsEnabled } from '../haptics';
import { SettingsProvider, useSettings } from '../../store/SettingsStore';

beforeEach(() => {
  jest.clearAllMocks();
  setHapticsEnabled(true); // restore module default between tests
});

describe('haptics util (H1: no per-call AsyncStorage reads)', () => {
  it('plays haptics by default when no cache has been set', async () => {
    // A fresh module instance has cachedEnabled=true (the safe pre-hydration
    // default) — no setHapticsEnabled call involved.
    let freshHaptics: typeof import('../haptics');
    let freshHapticsMock: typeof Haptics;
    jest.isolateModules(() => {
      freshHapticsMock = jest.requireMock('expo-haptics');
      freshHaptics = jest.requireActual('../haptics');
    });

    await freshHaptics!.hapticImpact();
    expect(freshHapticsMock!.impactAsync).toHaveBeenCalled();
  });

  it('does not fire impactAsync when vibration is disabled', async () => {
    setHapticsEnabled(false);
    await hapticImpact();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('does not fire selectionAsync when vibration is disabled', async () => {
    setHapticsEnabled(false);
    await hapticSelection();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('does not fire notificationAsync when vibration is disabled', async () => {
    setHapticsEnabled(false);
    await hapticNotification();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  it('re-enabling vibration restores haptics', async () => {
    setHapticsEnabled(false);
    await hapticImpact();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    setHapticsEnabled(true);
    await hapticImpact();
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('fires 100 haptics with zero AsyncStorage reads', async () => {
    // The issue's performance target, encoded as a regression test: the old
    // implementation read AsyncStorage on every call.
    (AsyncStorage.getItem as jest.Mock).mockClear();
    for (let i = 0; i < 100; i++) {
      await hapticImpact();
    }
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('swallows native haptic failures instead of rejecting', async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('native haptics unavailable'));
    await expect(hapticImpact()).resolves.toBeUndefined();
  });
});

describe('SettingsStore → haptics wiring (H1)', () => {
  it('pushes vibration changes to the haptics cache live', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <SettingsProvider>{children}</SettingsProvider>
    );
    const { result } = renderHook(() => useSettings(), { wrapper });
    await act(async () => {});

    // Default vibration=true → haptics play
    await hapticImpact();
    expect(Haptics.impactAsync).toHaveBeenCalled();

    // Toggle vibration off → in-flight haptics stop without reload
    (Haptics.impactAsync as jest.Mock).mockClear();
    await act(async () => {
      result.current.update('vibration', false);
    });
    await hapticImpact();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    // Toggle back on → haptics play again
    (Haptics.impactAsync as jest.Mock).mockClear();
    await act(async () => {
      result.current.update('vibration', true);
    });
    await hapticImpact();
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });
});
