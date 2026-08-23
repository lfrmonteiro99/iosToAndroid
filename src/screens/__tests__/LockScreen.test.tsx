import React from 'react';
import { render, fireEvent, waitFor } from '../../test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { LockScreen } from '../LockScreen';
import { DeviceContext, DeviceContextValue } from '../../store/DeviceStore';
import launcherModule from '../../../modules/launcher-module/src';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Stateful in-memory AsyncStorage mock: setItem persists so a subsequent
// getItem returns what was written — unlike the stateless default mock.
function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
});

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
    const { getByLabelText } = render(<LockScreen />);
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

  it('migrates a PIN from the namespaced AsyncStorage key to SecureStore on mount', async () => {
    const store = setupMemoryAsyncStorage({ '@iostoandroid/lock_pin': '1234' });

    render(<LockScreen />);

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lock_pin', '1234');
    });
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/lock_pin');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@lock_pin');
    expect(store.has('@iostoandroid/lock_pin')).toBe(false);
    expect(store.has('@lock_pin')).toBe(false);
  });

  it('migrates a PIN from the legacy AsyncStorage key to SecureStore on mount', async () => {
    const store = setupMemoryAsyncStorage({ '@lock_pin': '4321' });

    render(<LockScreen />);

    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('lock_pin', '4321');
    });
    expect(store.has('@lock_pin')).toBe(false);
  });

  it('does not overwrite a SecureStore PIN when a stored copy exists', async () => {
    setupMemoryAsyncStorage({ '@iostoandroid/lock_pin': '1111' });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('9999');

    render(<LockScreen />);

    await new Promise((r) => setTimeout(r, 50));
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@iostoandroid/lock_pin');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@lock_pin');
  });

  it('unlocks with a PIN stored only in the namespaced key when SecureStore is unavailable', async () => {
    // Fully-broken SecureStore: reads and writes both throw, so the AsyncStorage
    // copy is the only PIN source and the mount-migration cannot run.
    setupMemoryAsyncStorage({ '@iostoandroid/lock_pin': '1234', '@lock_pin': '9999' });
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore unavailable'));
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('SecureStore unavailable'));
    const onUnlock = jest.fn();

    const { getByLabelText } = render(<LockScreen onUnlock={onUnlock} />);
    fireEvent.press(getByLabelText('Use passcode to unlock'));
    fireEvent.press(getByLabelText('Digit 1'));
    fireEvent.press(getByLabelText('Digit 2'));
    fireEvent.press(getByLabelText('Digit 3'));
    fireEvent.press(getByLabelText('Digit 4'));

    await waitFor(() => expect(onUnlock).toHaveBeenCalled());
  });
});

// Notification-access CTA + re-fetch behaviour (issue 206).

// The DeviceStore's real launcher-module polling can't run in jest: the dynamic
// `import()` used by `getLauncher` is not supported by jest's VM, so the store
// value would stay `null` forever. These tests therefore drive the LockScreen
// through a controlled DeviceContext value — the same context `useDevice()`
// reads — so the render branch and the re-fetch reactivity are exercised.
function MockDeviceProvider({
  notificationAccessGranted,
  children,
}: {
  notificationAccessGranted: boolean | null;
  children: React.ReactNode;
}) {
  const value: DeviceContextValue = {
    battery: { level: 0.72, isCharging: false },
    brightness: 0.5,
    volume: 0.5,
    wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] },
    wifiError: false,
    bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
    bluetoothError: false,
    storage: { totalGB: '0', usedGB: '0', freeGB: '0', usedPercentage: 0 },
    storageError: false,
    network: { isConnected: false, isWifi: false, isCellular: false },
    messages: [],
    contacts: [],
    weather: { temp: 0, condition: '', icon: 'cloud', city: '' },
    notificationAccessGranted,
    isReady: true,
    refresh: async () => {},
    setBrightness: async () => {},
    setVolume: async () => {},
    toggleWifi: async () => {},
    toggleBluetooth: async () => {},
    openSystemPanel: async () => {},
    requestContactsPermission: async () => false,
    requestSmsPermission: async () => false,
    autoBrightness: true,
    setAutoBrightness: async () => {},
  };
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

afterEach(() => {
  // Restore launcher-module defaults so unrelated tests keep the denied-access default.
  (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(false);
  (launcherModule.getNotifications as jest.Mock).mockResolvedValue([]);
});

describe('LockScreen notification access', () => {
  it('shows the CTA when notification access is not granted', () => {
    const { getByText, getByLabelText } = render(
      <MockDeviceProvider notificationAccessGranted={false}>
        <LockScreen />
      </MockDeviceProvider>
    );
    expect(getByText('Notifications are off')).toBeTruthy();
    expect(getByText('Grant access to see them on the lock screen.')).toBeTruthy();
    expect(getByLabelText('Open notification access settings')).toBeTruthy();
  });

  it('opens notification access settings when the CTA button is pressed', async () => {
    const { getByLabelText } = render(
      <MockDeviceProvider notificationAccessGranted={false}>
        <LockScreen />
      </MockDeviceProvider>
    );
    fireEvent.press(getByLabelText('Open notification access settings'));
    await waitFor(() => expect(launcherModule.openNotificationAccessSettings).toHaveBeenCalled());
  });

  it('renders notifications and no CTA when access is granted', async () => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([
      { id: 'n1', packageName: 'com.whatsapp', title: 'Hello', text: 'Message body', time: Date.now(), isOngoing: false },
    ]);
    const { getByText, queryByText } = render(
      <MockDeviceProvider notificationAccessGranted={true}>
        <LockScreen />
      </MockDeviceProvider>
    );
    await waitFor(() => expect(getByText('Hello')).toBeTruthy());
    expect(queryByText('Notifications are off')).toBeNull();
  });

  it('keeps the empty state (no CTA) when access is granted but there are no notifications', async () => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([]);
    const { queryByText } = render(
      <MockDeviceProvider notificationAccessGranted={true}>
        <LockScreen />
      </MockDeviceProvider>
    );
    // Wait for the fetch to have run so the "empty" state is settled, then
    // confirm the CTA is NOT shown.
    await waitFor(() => expect(launcherModule.getNotifications).toHaveBeenCalled());
    expect(queryByText('Notifications are off')).toBeNull();
  });

  it('re-fetches notifications after access is granted later (returning from settings)', async () => {
    // Fresh install / revoked: denied at first.
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(false);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([]);
    const { getByText, queryByText, rerender } = render(
      <MockDeviceProvider notificationAccessGranted={false}>
        <LockScreen />
      </MockDeviceProvider>
    );
    expect(getByText('Notifications are off')).toBeTruthy();
    // Let the mount effect's async body finish reading access=false (no fetch yet)
    // before flipping the permission state — otherwise the effect reads the new
    // mock value and this test would pass even without the re-fetch fix.
    await waitFor(() =>
      expect(launcherModule.isNotificationAccessGranted).toHaveBeenCalled()
    );

    // User grants access in the system settings and returns to the app: the store
    // value flips to true and the LockScreen must re-fetch notifications.
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([
      { id: 'n1', packageName: 'com.whatsapp', title: 'Granted message', text: 'Body', time: Date.now(), isOngoing: false },
    ]);
    rerender(
      <MockDeviceProvider notificationAccessGranted={true}>
        <LockScreen />
      </MockDeviceProvider>
    );

    await waitFor(() => expect(getByText('Granted message')).toBeTruthy());
    expect(queryByText('Notifications are off')).toBeNull();
  });

  it('shows the CTA again and hides notifications when access is revoked', async () => {
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(true);
    (launcherModule.getNotifications as jest.Mock).mockResolvedValue([
      { id: 'n1', packageName: 'com.whatsapp', title: 'Hello', text: 'Message body', time: Date.now(), isOngoing: false },
    ]);
    const { getByText, queryByText, rerender } = render(
      <MockDeviceProvider notificationAccessGranted={true}>
        <LockScreen />
      </MockDeviceProvider>
    );
    await waitFor(() => expect(getByText('Hello')).toBeTruthy());

    // Access revoked while the app is open.
    (launcherModule.isNotificationAccessGranted as jest.Mock).mockResolvedValue(false);
    rerender(
      <MockDeviceProvider notificationAccessGranted={false}>
        <LockScreen />
      </MockDeviceProvider>
    );

    await waitFor(() => expect(getByText('Notifications are off')).toBeTruthy());
    expect(queryByText('Hello')).toBeNull();
  });
});
