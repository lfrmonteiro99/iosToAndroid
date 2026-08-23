/**
 * #508: Android re-delivers the HOME intent via onNewIntent (singleTask
 * launchMode), but nothing on the JS side reacted — the button did nothing
 * whenever the launcher was already in the foreground (folder open, App
 * Library page, page 3, ...).
 *
 * This file locks the React-side wiring: LauncherHomeScreen subscribes to
 * the native "onHomePressed" event on mount and unsubscribes on unmount.
 * The decision table itself (resolveHomePressAction) is unit-tested directly
 * in LauncherHomeScreen.test.tsx — this file only proves the subscription
 * lifecycle, so it needs its own full launcher-module mock (test-file
 * jest.mock > setupFiles — see App.bridgeError.test.tsx for the same
 * pattern) since jest.setup.js's factory only exposes `default`, not the
 * named `addHomePressedListener` export.
 */
import React from 'react';
import { render, waitFor, act } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Names must start with "mock" (case-insensitive) — jest.mock factories are
// hoisted above imports/const, and jest only allows writing to out-of-scope
// vars from inside a factory when they're recognizable as mock state.
// eslint-disable-next-line no-var
var mockCapturedHomePressedCb: (() => void) | null = null;
// eslint-disable-next-line no-var
var mockHomePressedUnsubscribe: jest.Mock;

jest.mock('../../../modules/launcher-module/src', () => ({
  __esModule: true,
  addHomePressedListener: jest.fn((cb: () => void) => {
    mockCapturedHomePressedCb = cb;
    mockHomePressedUnsubscribe = jest.fn();
    return mockHomePressedUnsubscribe;
  }),
  default: {
    getInstalledApps: jest.fn(() => Promise.resolve([])),
    launchApp: jest.fn(() => Promise.resolve(true)),
    getAppIcon: jest.fn(() => Promise.resolve('')),
    isDefaultLauncher: jest.fn(() => Promise.resolve(false)),
    // #517: a instrumentação de cold start chama isto no arranque de App.tsx.
    getProcessStartAgeMs: jest.fn(() => Promise.resolve(-1)),
    openLauncherSettings: jest.fn(() => Promise.resolve(true)),
    getWifiInfo: jest.fn(() => Promise.resolve({ enabled: true, ssid: 'TestWiFi', rssi: -50, ip: '192.168.1.100' })),
    setWifiEnabled: jest.fn(() => Promise.resolve(true)),
    isLocationEnabled: jest.fn(() => Promise.resolve(true)),
    getWifiNetworks: jest.fn(() => Promise.resolve([{ ssid: 'TestWiFi', level: -50, isSecure: true }])),
    getBluetoothInfo: jest.fn(() => Promise.resolve({ enabled: true, name: 'TestDevice', address: '', pairedDevices: [] })),
    setBluetoothEnabled: jest.fn(() => Promise.resolve(true)),
    getStorageInfo: jest.fn(() => Promise.resolve({ totalGB: '128.0', usedGB: '89.3', freeGB: '38.7', usedPercentage: 70 })),
    getRecentMessages: jest.fn(() => Promise.resolve([])),
    getVolume: jest.fn(() => Promise.resolve(0.5)),
    setVolume: jest.fn(() => Promise.resolve(true)),
    openSystemSettings: jest.fn(() => Promise.resolve(true)),
    getNetworkInfo: jest.fn(() => Promise.resolve({ isConnected: true, isWifi: true, isCellular: false, isVpn: false })),
    setFlashlight: jest.fn(() => Promise.resolve(true)),
    isFlashlightOn: jest.fn(() => Promise.resolve(false)),
    getCallLog: jest.fn(() => Promise.resolve([])),
    makeCall: jest.fn(() => Promise.resolve(true)),
    getNotifications: jest.fn(() => Promise.resolve([])),
    clearNotification: jest.fn(() => Promise.resolve(true)),
    clearAllNotifications: jest.fn(() => Promise.resolve(true)),
    isNotificationAccessGranted: jest.fn(() => Promise.resolve(false)),
    openNotificationAccessSettings: jest.fn(() => Promise.resolve(true)),
    sendSms: jest.fn(() => Promise.resolve(true)),
    requestAllPermissions: jest.fn(() => Promise.resolve(true)),
    checkPermissions: jest.fn(() => Promise.resolve({})),
    getCalendarEvents: jest.fn(() => Promise.resolve([])),
    getNowPlaying: jest.fn(() => Promise.resolve({ title: '', artist: '', album: '', isPlaying: false, packageName: '' })),
    uninstallApp: jest.fn(() => Promise.resolve(true)),
    getInstalledKeyboards: jest.fn(() => Promise.resolve([])),
    getRingtone: jest.fn(() => Promise.resolve('')),
    canWriteSystemSettings: jest.fn(() => Promise.resolve(false)),
    openWriteSettingsAccess: jest.fn(() => Promise.resolve(true)),
    setRingtone: jest.fn(() => Promise.resolve(false)),
    goHome: jest.fn(() => Promise.resolve(true)),
    joinWifiNetwork: jest.fn(() => Promise.resolve(true)),
    forgetWifiNetwork: jest.fn(() => Promise.resolve(true)),
    startBluetoothDiscovery: jest.fn(() => Promise.resolve(true)),
    stopBluetoothDiscovery: jest.fn(() => Promise.resolve(true)),
    getDiscoveredBluetoothDevices: jest.fn(() => Promise.resolve([])),
    pairBluetoothDevice: jest.fn(() => Promise.resolve(true)),
    unpairBluetoothDevice: jest.fn(() => Promise.resolve(true)),
    getAppStorageStats: jest.fn(() => Promise.resolve([])),
    mediaPrev: jest.fn(() => Promise.resolve(true)),
    mediaPlayPause: jest.fn(() => Promise.resolve(true)),
    mediaNext: jest.fn(() => Promise.resolve(true)),
    isUsageAccessGranted: jest.fn(() => Promise.resolve(false)),
    openUsageAccessSettings: jest.fn(() => Promise.resolve(true)),
    getScreenTimeStats: jest.fn(() => Promise.resolve([])),
    getTodayScreenTime: jest.fn(() => Promise.resolve({ totalMinutes: 0, topApps: [] })),
    // #608 Tap to Wake
    wakeScreen: jest.fn(() => Promise.resolve()),
  },
}));

import { LauncherHomeScreen } from '../LauncherHomeScreen';

describe('LauncherHomeScreen HOME button wiring (#508)', () => {
  beforeEach(() => {
    mockCapturedHomePressedCb = null;
  });

  it('subscribes to onHomePressed exactly once on mount', () => {
    render(<LauncherHomeScreen />);

    const { addHomePressedListener } = jest.requireMock('../../../modules/launcher-module/src') as {
      addHomePressedListener: jest.Mock;
    };
    expect(addHomePressedListener).toHaveBeenCalledTimes(1);
    expect(addHomePressedListener).toHaveBeenCalledWith(expect.any(Function));
    expect(mockCapturedHomePressedCb).toEqual(expect.any(Function));
  });

  it('removes the listener on unmount, so a stale callback never fires against a detached component', () => {
    const { unmount } = render(<LauncherHomeScreen />);

    expect(mockHomePressedUnsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(mockHomePressedUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the native HOME event fires against a mounted screen', () => {
    render(<LauncherHomeScreen />);
    expect(() => mockCapturedHomePressedCb!()).not.toThrow();
  });
});

describe('LauncherHomeScreen Tap to Wake wiring (#608)', () => {
  // Reuse the homePress mock's addHomePressedListener capture, but drive the
  // LauncherModule default (incl. wakeScreen) so we can assert the gate.
  beforeEach(() => {
    mockCapturedHomePressedCb = null;
    // jest.setup.js provides a wakeScreen mock on the default module; ensure it
    // is present for the require() inside the screen's HOME handler.
  });

  function loadHome(tapToWake: boolean) {
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
      key === '@iostoandroid/settings'
        ? Promise.resolve(JSON.stringify({ tapToWake }))
        : Promise.resolve(null),
    );
    render(<LauncherHomeScreen />);
  }

  it('calls mod.wakeScreen() when the HOME event fires and settings.tapToWake is enabled', async () => {
    loadHome(true);
    await waitFor(() => expect(mockCapturedHomePressedCb).toEqual(expect.any(Function)));

    const { default: launcher } = jest.requireMock('../../../modules/launcher-module/src') as {
      default: { wakeScreen: jest.Mock };
    };
    launcher.wakeScreen.mockClear();
    expect(launcher.wakeScreen).not.toHaveBeenCalled();

    act(() => { mockCapturedHomePressedCb!(); });

    await waitFor(() => expect(launcher.wakeScreen).toHaveBeenCalledTimes(1));
  });

  it('does NOT call mod.wakeScreen() when settings.tapToWake is disabled', async () => {
    loadHome(false);
    await waitFor(() => expect(mockCapturedHomePressedCb).toEqual(expect.any(Function)));

    const { default: launcher } = jest.requireMock('../../../modules/launcher-module/src') as {
      default: { wakeScreen: jest.Mock };
    };

    // The shared module-level mock may carry calls from the enabled test above;
    // clear before firing so we assert only this test's HOME press.
    launcher.wakeScreen.mockClear();

    act(() => { mockCapturedHomePressedCb!(); });

    // The wakeScreen gate must stay closed: even after firing HOME, no call.
    await new Promise((r) => setTimeout(r, 0));
    expect(launcher.wakeScreen).not.toHaveBeenCalled();
  });
});
