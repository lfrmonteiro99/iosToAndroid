import React from 'react';
import { render } from '../../../test-utils';
import { SoundsHapticsScreen } from '../SoundsHapticsScreen';
import { CupertinoSlider } from '../../../components/CupertinoSlider';

const mockSetVolume = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../../../store/DeviceStore', () => ({
  useDevice: () => ({
    volume: 0.5,
    setVolume: mockSetVolume,
    battery: { level: 1, isCharging: false },
    brightness: 0.5,
    wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] },
    bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
    storage: { totalGB: '64', usedGB: '32', freeGB: '32', usedPercentage: 50 },
    network: { isConnected: true, isWifi: true, isCellular: false },
    messages: [],
    contacts: [],
    weather: { temp: 20, condition: 'Sunny', icon: 'sunny', city: 'Lisbon' },
    notificationAccessGranted: true,
    isReady: true,
    refresh: jest.fn(),
    setBrightness: jest.fn(),
    toggleWifi: jest.fn(),
    toggleBluetooth: jest.fn(),
    openSystemPanel: jest.fn(),
    requestContactsPermission: jest.fn(),
    requestSmsPermission: jest.fn(),
  }),
  DeviceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DeviceContext: null,
}));

jest.mock('../../../store/SettingsStore', () => ({
  useSettings: () => ({
    settings: {
      vibration: true,
      ringtone: 'Reflection',
      textTone: 'Note',
    },
    update: mockUpdate,
  }),
  SettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getMany: jest.fn(() => Promise.resolve({})),
  },
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };

describe('SoundsHapticsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { toJSON } = render(<SoundsHapticsScreen navigation={mockNavigation as never} />);
    expect(toJSON()).toBeTruthy();
  });

  // Red step: before fix there were TWO haptics switches (System Haptics orphan + Vibration real).
  // After fix there is exactly ONE (renamed to System Haptics, backed by settings.vibration).
  it('has exactly one haptics switch', () => {
    const { getAllByRole, getByText } = render(<SoundsHapticsScreen navigation={mockNavigation as never} />);
    expect(getByText('System Haptics')).toBeTruthy();
    const switches = getAllByRole('switch');
    expect(switches).toHaveLength(1);
  });

  it('does not show Keyboard Clicks or Lock Sound', () => {
    const { queryByText } = render(<SoundsHapticsScreen navigation={mockNavigation as never} />);
    expect(queryByText('Keyboard Clicks')).toBeNull();
    expect(queryByText('Lock Sound')).toBeNull();
  });

  // Red step: before fix slider fires update('volume', v) on SettingsStore (dead key),
  // never calls device.setVolume. After fix it calls device.setVolume.
  it('volume slider calls device.setVolume, not settings.update', () => {
    const { UNSAFE_getAllByType } = render(<SoundsHapticsScreen navigation={mockNavigation as never} />);
    const sliders = UNSAFE_getAllByType(CupertinoSlider);
    expect(sliders.length).toBeGreaterThan(0);

    // Directly invoke the onValueChange prop — simulates gesture completion
    sliders[0].props.onValueChange(0.7);

    expect(mockSetVolume).toHaveBeenCalledWith(0.7);
    expect(mockUpdate).not.toHaveBeenCalledWith('volume', expect.anything());
  });
});
