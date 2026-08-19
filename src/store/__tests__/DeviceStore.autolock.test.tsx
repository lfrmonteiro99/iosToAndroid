import React from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import type { PermissionStatus } from 'react-native/Libraries/PermissionsAndroid/PermissionsAndroid';
import { renderHook, act } from '@testing-library/react-native';
import { DeviceProvider, useDevice } from '../DeviceStore';
import { suppressAutoLock } from '../../utils/permissions';

// Proves App.tsx's auto-lock suppression engages while the native
// READ_SMS permission dialog (PermissionsAndroid.request) is up — the M11
// defect: DeviceStore.requestSmsPermission called PermissionsAndroid.request
// directly, bypassing withAutoLockSuppressed entirely.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DeviceProvider>{children}</DeviceProvider>
);

describe('DeviceStore requestSmsPermission auto-lock suppression (M11)', () => {
  it('platform is android in this test env', () => {
    expect(Platform.OS).toBe('android');
  });

  it('suppresses auto-lock while the READ_SMS permission dialog is pending', async () => {
    let resolveRequest: (v: PermissionStatus) => void;
    jest.spyOn(PermissionsAndroid, 'request').mockImplementation(
      () => new Promise((resolve) => { resolveRequest = resolve; }),
    );

    const { result } = renderHook(() => useDevice(), { wrapper });
    await act(async () => {});

    let requestPromise!: Promise<boolean>;
    act(() => {
      requestPromise = result.current.requestSmsPermission();
    });

    expect(suppressAutoLock()).toBe(true);

    await act(async () => {
      resolveRequest(PermissionsAndroid.RESULTS.GRANTED);
      await requestPromise;
    });

    expect(suppressAutoLock()).toBe(false);
  });
});
