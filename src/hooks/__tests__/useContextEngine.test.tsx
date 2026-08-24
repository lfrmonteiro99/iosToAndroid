import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SettingsProvider, useSettings } from '../../store/SettingsStore';
import type { ContextRule } from '../../utils/contextTriggerEngine';
import { useContextEngine } from '../useContextEngine';

// DeviceStore e LocationStore são mocked por inteiro (mesmo padrão de
// BluetoothScreen.test.tsx) para controlar o snapshot Wi-Fi/Bluetooth/
// localização sem depender do bridge nativo real nem de I/O assíncrono.
const mockUseDevice = jest.fn();
jest.mock('../../store/DeviceStore', () => ({
  useDevice: () => mockUseDevice(),
}));

const mockUseLocation = jest.fn();
jest.mock('../../store/LocationStore', () => ({
  useLocation: () => mockUseLocation(),
}));

function baseDevice(overrides: Partial<ReturnType<typeof mockUseDevice>> = {}) {
  return {
    wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] },
    bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
    ...overrides,
  };
}

const refreshLocation = jest.fn(() => Promise.resolve());

function baseLocation(overrides: Partial<ReturnType<typeof mockUseLocation>> = {}) {
  return {
    currentLocation: null,
    history: [],
    permissionStatus: 'granted',
    isReady: true,
    requestPermission: jest.fn(),
    refreshLocation,
    clearHistory: jest.fn(),
    ...overrides,
  };
}

function makeClock(initial: Date) {
  let current = initial;
  return {
    now: () => current,
    set: (d: Date) => { current = d; },
  };
}

function Harness({ children }: { children: React.ReactNode }) {
  return <SettingsProvider gateFirstRender={false}>{children}</SettingsProvider>;
}

function useProbe(clock: ReturnType<typeof makeClock>) {
  const handle = useContextEngine(clock.now);
  const s = useSettings();
  return { handle, ...s };
}

function wifiRule(overrides: Partial<ContextRule> = {}): ContextRule {
  return {
    id: 'r1',
    name: 'Office wifi',
    enabled: true,
    combinator: 'AND',
    conditions: [{ type: 'wifi', ssid: 'Office-5G' }],
    targetMode: 'work',
    ...overrides,
  };
}

describe('useContextEngine', () => {
  beforeEach(() => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    mockUseDevice.mockReturnValue(baseDevice());
    mockUseLocation.mockReturnValue(baseLocation());
    refreshLocation.mockClear();
  });

  it('activates the target mode immediately when its condition already matches (no boot guard)', async () => {
    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    await act(async () => {
      result.current.update('contextRules', [wifiRule()]);
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });

    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));
  });

  it('does nothing when no rule matches', async () => {
    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Home', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    await act(async () => {
      result.current.update('contextRules', [wifiRule()]);
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });

    expect(result.current.settings.focusMode).toBe('off');
  });

  it('does not activate a disabled rule even if its condition matches', async () => {
    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    await act(async () => {
      result.current.update('contextRules', [wifiRule({ enabled: false })]);
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });

    expect(result.current.settings.focusMode).toBe('off');
  });

  it('deactivates once the matching condition stops holding', async () => {
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});
    await act(async () => {
      result.current.update('contextRules', [wifiRule()]);
    });

    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));

    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] } }));
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('off'));
  });

  it('does not override a manually-activated different focus mode', async () => {
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    await act(async () => {
      result.current.update('contextRules', [wifiRule()]);
      result.current.update('focusMode', 'personal'); // utilizador ativou manualmente
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });

    expect(result.current.settings.focusMode).toBe('personal');
  });

  it('reclaims control and activates once the user manually returns to off', async () => {
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    await act(async () => {
      result.current.update('contextRules', [wifiRule()]);
      result.current.update('focusMode', 'personal');
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });
    expect(result.current.settings.focusMode).toBe('personal');

    await act(async () => {
      result.current.update('focusMode', 'off');
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));
  });

  it('switches directly between two engine-owned modes as priority changes', async () => {
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    const sleepRule = wifiRule({ id: 'sleep-rule', targetMode: 'sleep', conditions: [{ type: 'wifi', ssid: 'Home' }] });
    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    await act(async () => {
      result.current.update('contextRules', [wifiRule(), sleepRule]);
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));

    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Home', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('sleep'));
  });

  it('turns off an orphaned engine-set mode once all rules are disabled', async () => {
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    mockUseDevice.mockReturnValue(baseDevice({ wifi: { enabled: true, ssid: 'Office-5G', rssi: -50, linkSpeed: 0, ip: '', networks: [] } }));
    await act(async () => {
      result.current.update('contextRules', [wifiRule()]);
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('work'));

    await act(async () => {
      result.current.update('contextRules', [wifiRule({ enabled: false })]);
    });
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('off'));
  });

  it('reads the bluetooth condition from paired devices only while bluetooth is enabled', async () => {
    const btRule = wifiRule({
      id: 'bt-rule',
      targetMode: 'doNotDisturb',
      conditions: [{ type: 'bluetooth', address: 'AA:BB:CC:DD:EE:FF' }],
    });
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});
    await act(async () => {
      result.current.update('contextRules', [btRule]);
    });

    // Paired but Bluetooth reported OFF — must not match.
    mockUseDevice.mockReturnValue(
      baseDevice({ bluetooth: { enabled: false, name: '', address: '', pairedDevices: [{ name: 'Car', address: 'AA:BB:CC:DD:EE:FF', type: 9 }] } }),
    );
    act(() => { rerender(undefined); result.current.handle.tick(); });
    expect(result.current.settings.focusMode).toBe('off');

    // Same paired device, Bluetooth now ON — must match.
    mockUseDevice.mockReturnValue(
      baseDevice({ bluetooth: { enabled: true, name: '', address: '', pairedDevices: [{ name: 'Car', address: 'AA:BB:CC:DD:EE:FF', type: 9 }] } }),
    );
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('doNotDisturb'));
  });

  it('reads the location condition from the LocationStore snapshot', async () => {
    const locationRule = wifiRule({
      id: 'loc-rule',
      targetMode: 'sleep',
      conditions: [{ type: 'location', latitude: 38.7223, longitude: -9.1393, radiusMeters: 100 }],
    });
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result, rerender } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});
    await act(async () => {
      result.current.update('contextRules', [locationRule]);
    });

    act(() => { rerender(undefined); result.current.handle.tick(); });
    expect(result.current.settings.focusMode).toBe('off'); // no location known yet

    mockUseLocation.mockReturnValue(
      baseLocation({ currentLocation: { latitude: 38.7223, longitude: -9.1393, accuracy: 5, timestamp: 0 } }),
    );
    act(() => { rerender(undefined); result.current.handle.tick(); });
    await waitFor(() => expect(result.current.settings.focusMode).toBe('sleep'));
  });

  it('only polls refreshLocation when an enabled rule has a location condition', async () => {
    const clock = makeClock(new Date(2026, 0, 5, 10, 0, 0));
    const { result } = renderHook(() => useProbe(clock), { wrapper: Harness });
    await act(async () => {});

    await act(async () => {
      result.current.update('contextRules', [wifiRule()]); // wifi-only rule
    });
    expect(refreshLocation).not.toHaveBeenCalled();

    await act(async () => {
      result.current.update('contextRules', [
        wifiRule(),
        wifiRule({ id: 'loc', conditions: [{ type: 'location', latitude: 0, longitude: 0, radiusMeters: 10 }] }),
      ]);
    });
    await waitFor(() => expect(refreshLocation).toHaveBeenCalled());
  });
});
