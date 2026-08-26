import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import { withAutoLockSuppressed } from '../src/utils/permissions';

// Issue #354: the Auto-Lock picker (DisplayBrightnessScreen) persisted
// `settings.autoLock`, but App.tsx locked the screen off a hardcoded
// `AUTO_LOCK_GRACE_MS = 5000`, so the picker had no effect at all.
//
// These tests exercise the REAL App.tsx AppState wiring end to end: mount
// the real component tree, unlock through the real LockScreen passcode
// flow (no PIN is set, so any 4 digits succeed — see LockScreen.test.tsx
// for the same pattern), background the app via a captured AppState
// handler, and advance real (faked) timers to prove the delay that's
// actually scheduled matches `settings.autoLock`, not the old constant.

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// jest.setup.js mocks './modules/launcher-module/src' (relative to the setup
// file, at repo root) via an explicit jest.mock() without the
// addNotificationListener/onBridgeError named exports App.tsx needs — every
// other test reaches the module through a differently-worded relative path
// that resolves through the moduleNameMapper entry to
// src/__mocks__/launcherModule.js instead, which does have them. App.tsx is
// the only caller that shares jest.setup.js's exact specifier, so it's the
// only place this gap is visible. Overriding locally (same resolved file)
// keeps the fix scoped to this test file.
jest.mock('../modules/launcher-module/src', () => ({
  __esModule: true,
  addNotificationListener: jest.fn(() => jest.fn()),
  addCallStateListener: jest.fn(() => jest.fn()),
  onBridgeError: jest.fn(() => jest.fn()),
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
  },
}));

// jest.setup.js's @react-navigation/native mock doesn't export
// useNavigationContainerRef (no other test renders App.tsx directly, which is
// the only caller). Extend it locally rather than touching the shared mock.
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(() => false),
    getParent: () => ({ navigate: jest.fn() }),
  }),
  useRoute: () => ({ params: {} }),
  // AssistiveTouch/HomeIndicator call methods directly on the ref returned by
  // useNavigationContainerRef (getCurrentRoute, addListener, navigate) — not
  // just `.current`, mirroring the real NavigationContainerRefWithCurrent.
  useNavigationContainerRef: () => ({
    current: null,
    getCurrentRoute: jest.fn(() => undefined),
    addListener: jest.fn(() => jest.fn()),
    navigate: jest.fn(),
    isReady: jest.fn(() => true),
  }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

// TabNavigator statically imports every screen, including ClockScreen, which
// imports expo-notifications — unavailable as a native module under Jest.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', WEEKLY: 'weekly', DATE: 'date' },
}));

const ONBOARDING_KEY = '@iostoandroid/onboarding_done';
const SETTINGS_KEY = '@iostoandroid/settings';

let changeHandlers: ((state: AppStateStatus) => void)[] = [];

function fireAppState(state: AppStateStatus) {
  [...changeHandlers].forEach((handler) => handler(state));
}

function mockPersistedAutoLock(autoLock: string) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
    if (key === ONBOARDING_KEY) return 'true'; // skip onboarding
    if (key === SETTINGS_KEY) return JSON.stringify({ autoLock });
    return null;
  });
}

beforeEach(() => {
  changeHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') changeHandlers.push(handler as (state: AppStateStatus) => void);
    return {
      remove: () => {
        changeHandlers = changeHandlers.filter((h) => h !== handler);
      },
    } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Mounts <App/>, flushes past the onboarding/settings/theme async gates
 *  landing on the (always-shown-first) LockScreen, then unlocks through the
 *  real passcode flow so the AppState background/foreground wiring can be
 *  exercised against the post-unlock app. */
async function renderUnlockedApp() {
  const api = render(<App />);

  // Flush AsyncStorage reads for onboarding, SettingsProvider (+ device
  // sync fallback) and ThemeProvider, each of which gates the next
  // provider's mount — see SettingsStore.tsx / ThemeContext.tsx.
  for (let i = 0; i < 4; i++) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await jest.advanceTimersByTimeAsync(600);
    });
  }

  // expo-local-authentication isn't mocked (no biometric hardware under
  // Jest), so LockScreen's mount-time triggerBiometric() always rejects and
  // falls straight through to the passcode numpad — no need to press "Use
  // passcode to unlock" first.
  expect(api.queryByLabelText('Digit 1')).toBeTruthy();

  await act(async () => {
    fireEvent.press(api.getByLabelText('Digit 1'));
    fireEvent.press(api.getByLabelText('Digit 2'));
    fireEvent.press(api.getByLabelText('Digit 3'));
    fireEvent.press(api.getByLabelText('Digit 4'));
    await jest.advanceTimersByTimeAsync(0);
  });

  expect(api.queryByLabelText('Digit 1')).toBeNull();

  return api;
}

describe('App auto-lock delay (issue #354)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("'Never' — backgrounding and advancing timers far past 5s never re-locks", async () => {
    mockPersistedAutoLock('Never');
    const api = await renderUnlockedApp();

    await act(async () => {
      fireAppState('background');
    });

    // Ten minutes — an order of magnitude past the old hardcoded 5s grace
    // period, and well past every timed option except 'Never'.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * 60_000);
    });

    expect(api.queryByLabelText('Swipe up to unlock')).toBeNull();
    api.unmount();
  });

  it("'30 Seconds' — does not lock at the old 5s, locks at 30s", async () => {
    mockPersistedAutoLock('30 Seconds');
    const api = await renderUnlockedApp();

    await act(async () => {
      fireAppState('background');
    });

    // Old hardcoded AUTO_LOCK_GRACE_MS: must NOT have locked yet.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });
    expect(api.queryByLabelText('Swipe up to unlock')).toBeNull();

    // Cross the configured 30s threshold.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(25_001);
    });
    expect(api.queryByLabelText('Swipe up to unlock')).toBeTruthy();
    api.unmount();
  });

  it('auto-lock suppression (#211) still wins over a configured delay', async () => {
    mockPersistedAutoLock('30 Seconds');
    const api = await renderUnlockedApp();

    let releaseSuppression: () => void = () => {};
    const suppressed = withAutoLockSuppressed(
      () => new Promise<void>((resolve) => { releaseSuppression = resolve; }),
    );

    await act(async () => {
      fireAppState('background');
    });

    // Well past the 30s configured delay while suppression is still held.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(api.queryByLabelText('Swipe up to unlock')).toBeNull();

    await act(async () => {
      releaseSuppression();
      await suppressed;
    });
    api.unmount();
  });
});
