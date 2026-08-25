import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppsProvider, useApps } from '../AppsStore';
import { authenticateWithBiometrics } from '../../utils/biometricAuth';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- default export of the jest-mocked module, needed to assert calls
const LauncherModule = require('../../../modules/launcher-module/src').default;

jest.mock('../../utils/biometricAuth', () => ({
  authenticateWithBiometrics: jest.fn(),
}));

const PROTECTED_APPS_KEY = '@iostoandroid/protected_apps';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppsProvider>{children}</AppsProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (LauncherModule.getInstalledApps as jest.Mock).mockResolvedValue([]);
  (LauncherModule.isDefaultLauncher as jest.Mock).mockResolvedValue(false);
  (LauncherModule.launchApp as jest.Mock).mockResolvedValue(true);
});

describe('AppsStore — Protected Apps biometric gate (#627)', () => {
  it('does not gate launchApp for a package that is not protected', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.launchApp('com.example.unprotected');
    });

    expect(ok).toBe(true);
    expect(authenticateWithBiometrics).not.toHaveBeenCalled();
    expect(LauncherModule.launchApp).toHaveBeenCalledWith('com.example.unprotected');
  });

  it('blocks launchApp for a protected package when biometric auth fails', async () => {
    (authenticateWithBiometrics as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.protectApp!('com.example.banking');
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.launchApp('com.example.banking');
    });

    expect(ok).toBe(false);
    expect(authenticateWithBiometrics).toHaveBeenCalledTimes(1);
    expect(LauncherModule.launchApp).not.toHaveBeenCalled();
  });

  it('launches a protected package once biometric auth succeeds', async () => {
    (authenticateWithBiometrics as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.protectApp!('com.example.banking');
    });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.launchApp('com.example.banking');
    });

    expect(ok).toBe(true);
    expect(authenticateWithBiometrics).toHaveBeenCalledTimes(1);
    expect(LauncherModule.launchApp).toHaveBeenCalledWith('com.example.banking');
  });

  it('unprotectApp lifts the gate — the same package launches without auth again', async () => {
    (authenticateWithBiometrics as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.protectApp!('com.example.banking');
    });
    await act(async () => {
      result.current.unprotectApp!('com.example.banking');
    });

    await act(async () => {
      await result.current.launchApp('com.example.banking');
    });

    expect(authenticateWithBiometrics).not.toHaveBeenCalled();
    expect(LauncherModule.launchApp).toHaveBeenCalledWith('com.example.banking');
  });

  it('protectApp persists the set under @iostoandroid/protected_apps', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.protectApp!('com.example.banking');
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      PROTECTED_APPS_KEY,
      JSON.stringify(['com.example.banking']),
    );
    expect(result.current.protectedApps).toEqual(['com.example.banking']);
  });

  it('protectApp is idempotent — calling it twice for the same package does not duplicate the entry', async () => {
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    await act(async () => {
      result.current.protectApp!('com.example.banking');
    });
    await act(async () => {
      result.current.protectApp!('com.example.banking');
    });

    expect(result.current.protectedApps).toEqual(['com.example.banking']);
  });

  it('loads a previously persisted protected-apps set on mount', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === PROTECTED_APPS_KEY ? JSON.stringify(['com.example.banking']) : null)
    );
    const { result } = renderHook(() => useApps(), { wrapper });
    await act(async () => {});

    expect(result.current.protectedApps).toEqual(['com.example.banking']);
  });
});
