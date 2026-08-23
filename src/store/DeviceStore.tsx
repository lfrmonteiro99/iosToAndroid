import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, AppState, PermissionsAndroid } from 'react-native';
import { withAutoLockSuppressed } from '../utils/permissions';
import * as Battery from 'expo-battery';
import * as Brightness from 'expo-brightness';
import * as Network from 'expo-network';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import { syncAlarmsWithDeviceTimezone } from '../utils/alarmTimezone';
import { useSettings } from './SettingsStore';

export interface DeviceWifi {
  enabled: boolean;
  ssid: string;
  rssi: number;
  linkSpeed: number;
  ip: string;
  networks: { ssid: string; level: number; isSecure: boolean }[];
}

export interface DeviceBluetooth {
  enabled: boolean;
  name: string;
  address: string;
  pairedDevices: { name: string; address: string; type: number }[];
}

export interface DeviceStorage {
  totalGB: string;
  usedGB: string;
  freeGB: string;
  usedPercentage: number;
}

export interface DeviceSms {
  id: string;
  address: string;
  body: string;
  dateFormatted: string;
  type: number;
  isRead: boolean;
}

export interface DeviceContact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  company?: string;
  imageUri?: string;
}

export interface DeviceWeather {
  temp: number;
  condition: string;
  icon: string;
  city: string;
}

function mapWeatherIcon(code: string): string {
  const c = parseInt(code, 10);
  if (c === 113) return 'sunny';
  if (c === 116) return 'partly-sunny';
  if ([119, 122].includes(c)) return 'cloud';
  if ([176, 263, 266, 293, 296, 299, 302, 305, 308, 353, 356, 359].includes(c)) return 'rainy';
  if ([200, 386, 389, 392, 395].includes(c)) return 'thunderstorm';
  if ([227, 230, 323, 326, 329, 332, 335, 338, 368, 371, 374, 377].includes(c)) return 'snow';
  return 'cloud';
}

interface DeviceState {
  battery: { level: number; isCharging: boolean };
  brightness: number;
  volume: number;
  wifi: DeviceWifi;
  wifiError: boolean;
  bluetooth: DeviceBluetooth;
  bluetoothError: boolean;
  storage: DeviceStorage;
  storageError: boolean;
  network: { isConnected: boolean; isWifi: boolean; isCellular: boolean };
  messages: DeviceSms[];
  contacts: DeviceContact[];
  weather: DeviceWeather;
  notificationAccessGranted: boolean | null;
  isReady: boolean;
}

interface DeviceContextValue extends DeviceState {
  refresh: () => Promise<void>;
  setBrightness: (value: number) => Promise<void>;
  setVolume: (value: number) => Promise<void>;
  toggleWifi: () => Promise<void>;
  toggleBluetooth: () => Promise<void>;
  openSystemPanel: (panel: string) => Promise<void>;
  requestContactsPermission: () => Promise<boolean>;
  requestSmsPermission: () => Promise<boolean>;
  /** Whether OS ambient-light auto-brightness is engaged (#612). Mirrors SettingsStore.autoBrightness. */
  autoBrightness: boolean;
  /**
   * Enable/disable OS auto-brightness. When enabled the device is put in
   * AUTOMATIC brightness mode and the manual slider becomes a no-op; when
   * disabled the device is switched to MANUAL mode so `setBrightness` controls
   * it directly. Updates the `autoBrightness` setting so it persists.
   */
  setAutoBrightness: (enabled: boolean) => Promise<void>;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export { DeviceContext, type DeviceContextValue };

const DEFAULT_STATE: DeviceState = {
  battery: { level: 1, isCharging: false },
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
  notificationAccessGranted: null,
  isReady: false,
};

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DeviceState>(DEFAULT_STATE);
  const { settings, update } = useSettings();
  const autoBrightness = settings.autoBrightness;

  // Keep the device's OS brightness mode in lock-step with the autoBrightness
  // setting. `autoBrightnessModeRef` guards against re-issuing the same
  // setSystemBrightnessModeAsync on every render (iOS does not expose a real
  // mode setter in this mock, and calling it repeatedly would cause flicker on
  // device) — see #612 "Sem flicker ao alternar".
  const autoBrightnessModeRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (autoBrightnessModeRef.current === autoBrightness) return;
    autoBrightnessModeRef.current = autoBrightness;
    Brightness.setSystemBrightnessModeAsync(
      autoBrightness ? Brightness.BrightnessMode.AUTOMATIC : Brightness.BrightnessMode.MANUAL,
    ).catch(() => { /* needs SYSTEM_BRIGHTNESS permission on Android */ });
  }, [autoBrightness]);
  const getLauncherModule = useCallback(async () => {
    if (Platform.OS !== 'android') return null;
    try {
      return (await import('../../modules/launcher-module/src')).default;
    } catch { return null; }
  }, []);

  const loadBattery = useCallback(async () => {
    try {
      const level = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      return {
        level: Math.round(level * 100) / 100,
        isCharging: batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL,
      };
    } catch { return DEFAULT_STATE.battery; }
  }, []);

  const loadBrightness = useCallback(async () => {
    try {
      return await Brightness.getBrightnessAsync();
    } catch { return 0.5; }
  }, []);

  const loadVolume = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return 0.5;
    try { return await mod.getVolume(); }
    catch { return 0.5; }
  }, [getLauncherModule]);

  const loadNetwork = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      return {
        isConnected: state.isConnected ?? false,
        isWifi: state.type === Network.NetworkStateType.WIFI,
        isCellular: state.type === Network.NetworkStateType.CELLULAR,
      };
    } catch { return DEFAULT_STATE.network; }
  }, []);

  const loadWifi = useCallback(async (): Promise<{ wifi: DeviceWifi; wifiError: boolean }> => {
    const mod = await getLauncherModule();
    if (!mod) return { wifi: DEFAULT_STATE.wifi, wifiError: false };
    try {
      const [info, networks] = await Promise.all([
        mod.getWifiInfo(),
        mod.getWifiNetworks().catch(() => []),
      ]);
      if (info === null) return { wifi: DEFAULT_STATE.wifi, wifiError: true };
      return {
        wifi: {
          enabled: info.enabled,
          ssid: info.ssid,
          rssi: info.rssi,
          linkSpeed: info.linkSpeed ?? 0,
          ip: info.ip,
          networks: networks.map((n: { ssid: string; level: number; isSecure: boolean }) => ({
            ssid: n.ssid, level: n.level, isSecure: n.isSecure,
          })),
        },
        wifiError: false,
      };
    } catch { return { wifi: DEFAULT_STATE.wifi, wifiError: false }; }
  }, [getLauncherModule]);

  const loadBluetooth = useCallback(async (): Promise<{ bluetooth: DeviceBluetooth; bluetoothError: boolean }> => {
    const mod = await getLauncherModule();
    if (!mod) return { bluetooth: DEFAULT_STATE.bluetooth, bluetoothError: false };
    try {
      const info = await mod.getBluetoothInfo();
      if (info === null) return { bluetooth: DEFAULT_STATE.bluetooth, bluetoothError: true };
      return {
        bluetooth: {
          enabled: info.enabled,
          name: info.name,
          address: info.address ?? '',
          pairedDevices: info.pairedDevices.map((d: { name: string; address: string; type: number }) => ({
            name: d.name, address: d.address, type: d.type ?? 0,
          })),
        },
        bluetoothError: false,
      };
    } catch { return { bluetooth: DEFAULT_STATE.bluetooth, bluetoothError: false }; }
  }, [getLauncherModule]);

  const loadStorage = useCallback(async (): Promise<{ storage: DeviceStorage; storageError: boolean }> => {
    const mod = await getLauncherModule();
    if (!mod) return { storage: DEFAULT_STATE.storage, storageError: false };
    try {
      const info = await mod.getStorageInfo();
      if (info === null) return { storage: DEFAULT_STATE.storage, storageError: true };
      return {
        storage: {
          totalGB: info.totalGB,
          usedGB: info.usedGB,
          freeGB: info.freeGB,
          usedPercentage: info.usedPercentage,
        },
        storageError: false,
      };
    } catch { return { storage: DEFAULT_STATE.storage, storageError: false }; }
  }, [getLauncherModule]);

  const loadMessages = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return [];
    try {
      return await mod.getRecentMessages(50);
    } catch { return []; }
  }, [getLauncherModule]);

  const loadContacts = useCallback(async () => {
    try {
      const { status } = await Contacts.getPermissionsAsync();
      if (status !== 'granted') return [];
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.Image,
        ],
        sort: Contacts.SortTypes.LastName,
      });
      return data.slice(0, 500).map((c) => ({
        id: c.id,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        phone: c.phoneNumbers?.[0]?.number || '',
        email: c.emails?.[0]?.email,
        company: c.company || undefined,
        imageUri: c.image?.uri,
      }));
    } catch { return []; }
  }, []);

  const loadWeather = useCallback(async (): Promise<DeviceWeather> => {
    try {
      let locationQuery = '';
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          locationQuery = `${loc.coords.latitude.toFixed(4)},${loc.coords.longitude.toFixed(4)}`;
        }
      } catch { /* fall back to IP geolocation */ }

      const url = locationQuery
        ? `https://wttr.in/${locationQuery}?format=j1`
        : 'https://wttr.in/?format=j1';
      const res = await fetch(url);
      const data = await res.json();
      const current = data.current_condition[0];
      const area = data.nearest_area[0];
      return {
        temp: parseInt(current.temp_C, 10),
        condition: current.weatherDesc[0].value,
        icon: mapWeatherIcon(current.weatherCode),
        city: area.areaName[0].value,
      };
    } catch {
      return { temp: 0, condition: '', icon: 'cloud', city: '' };
    }
  }, []);

  const loadNotificationAccess = useCallback(async (): Promise<boolean | null> => {
    const mod = await getLauncherModule();
    if (!mod) return null;
    try {
      return await mod.isNotificationAccessGranted();
    } catch { return null; }
  }, [getLauncherModule]);

  const refresh = useCallback(async () => {
    const [battery, brightness, volume, network, wifiResult, bluetoothResult, storageResult, messages, contacts, weather, notificationAccessGranted] = await Promise.all([
      loadBattery(), loadBrightness(), loadVolume(), loadNetwork(), loadWifi(),
      loadBluetooth(), loadStorage(), loadMessages(), loadContacts(), loadWeather(), loadNotificationAccess(),
    ]);
    setState({
      battery, brightness, volume, network, messages, contacts, weather, notificationAccessGranted, isReady: true,
      wifi: wifiResult.wifi, wifiError: wifiResult.wifiError,
      bluetooth: bluetoothResult.bluetooth, bluetoothError: bluetoothResult.bluetoothError,
      storage: storageResult.storage, storageError: storageResult.storageError,
    });
  }, [loadBattery, loadBrightness, loadVolume, loadNetwork, loadWifi, loadBluetooth, loadStorage, loadMessages, loadContacts, loadWeather, loadNotificationAccess]);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  // Refresh on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Bring scheduled alarms back in line with the device timezone. This lives in
  // the provider, not in the Clock screen: the Alarm tab is only mounted while
  // `tabIndex === 1`, so a traveller who changes zones with any other screen (or
  // any other Clock tab) open would never trigger the reconciliation. Running it
  // on mount as well covers the cold start that happens already in the new zone,
  // where no foreground transition is ever observed.
  useEffect(() => {
    syncAlarmsWithDeviceTimezone();
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') syncAlarmsWithDeviceTimezone();
    });
    return () => sub.remove();
  }, []);

  // Lightweight background refresh — battery + messages every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const [battery, messages] = await Promise.all([loadBattery(), loadMessages()]);
      setState(prev => ({ ...prev, battery, messages }));
    }, 30000);
    return () => clearInterval(interval);
  }, [loadBattery, loadMessages]);

  // Battery subscription
  useEffect(() => {
    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setState(prev => ({ ...prev, battery: { ...prev.battery, level: Math.round(batteryLevel * 100) / 100 } }));
    });
    return () => sub.remove();
  }, []);

  const setBrightnessValue = useCallback(async (value: number) => {
    // #612: this is the SHARED brightness setter, also used by the Control
    // Center (ControlCenterScreen.applyBrightness → device.setBrightness). It
    // must always write the value — OS auto-brightness does NOT make it a
    // no-op. The Display & Brightness manual slider disables itself locally
    // (DisplayBrightnessScreen: slider disabled + guarded onValueChange), and
    // the OS mode is switched via setSystemBrightnessModeAsync in the effect
    // below. Guarding this setter would silently break the Control Center
    // brightness slider whenever autoBrightness is true (its default).
    try {
      await Brightness.setBrightnessAsync(value);
      setState(prev => ({ ...prev, brightness: value }));
    } catch { /* needs permission */ }
  }, []);

  const setAutoBrightnessValue = useCallback(async (enabled: boolean) => {
    // The OS brightness-mode sync lives in the device effect below, which
    // reacts to the `autoBrightness` setting change exactly once (guarded by
    // autoBrightnessModeRef). Calling setSystemBrightnessModeAsync here too
    // would double-issue and is exactly the flicker we must avoid (#612).
    update('autoBrightness', enabled);
  }, [update]);

  const setVolumeValue = useCallback(async (value: number) => {
    const mod = await getLauncherModule();
    if (!mod) return;
    try {
      await mod.setVolume(value);
      setState(prev => ({ ...prev, volume: value }));
    } catch { /* needs permission or unavailable */ }
  }, [getLauncherModule]);

  const toggleWifi = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return;
    try {
      // Try direct toggle (works on Android <10); falls back to opening settings panel on Android 10+
      await mod.setWifiEnabled(!state.wifi.enabled);
    } catch {
      // Android 10+ disallows direct WiFi toggle — open system panel instead
      await mod.openSystemSettings('wifi').catch(() => {});
    }
    // Re-read real state after the action (whether toggled directly or via system panel)
    const { wifi, wifiError } = await loadWifi();
    setState(prev => ({ ...prev, wifi, wifiError }));
  }, [getLauncherModule, state.wifi.enabled, loadWifi]);

  const toggleBluetooth = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return;
    try {
      // Try direct toggle (works on Android <12); falls back to opening settings panel on Android 12+
      await mod.setBluetoothEnabled(!state.bluetooth.enabled);
    } catch {
      // Android 12+ disallows direct Bluetooth toggle — open system panel instead
      await mod.openSystemSettings('bluetooth').catch(() => {});
    }
    // Re-read real state after the action
    const { bluetooth, bluetoothError } = await loadBluetooth();
    setState(prev => ({ ...prev, bluetooth, bluetoothError }));
  }, [getLauncherModule, state.bluetooth.enabled, loadBluetooth]);

  const openSystemPanel = useCallback(async (panel: string) => {
    const mod = await getLauncherModule();
    if (mod) await mod.openSystemSettings(panel);
  }, [getLauncherModule]);

  const requestContactsPermission = useCallback(async () => {
    const { status } = await withAutoLockSuppressed(() => Contacts.requestPermissionsAsync());
    if (status === 'granted') {
      const contacts = await loadContacts();
      setState(prev => ({ ...prev, contacts }));
      return true;
    }
    return false;
  }, [loadContacts]);

  const requestSmsPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await withAutoLockSuppressed(() => PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_SMS,
          {
            title: 'SMS Access',
            message: 'Allow this app to read your SMS messages?',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        ));
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
      } catch { return false; }
    }
    const messages = await loadMessages();
    setState(prev => ({ ...prev, messages }));
    return messages.length > 0;
  }, [loadMessages]);

  const value = useMemo<DeviceContextValue>(() => ({
    ...state,
    refresh,
    setBrightness: setBrightnessValue,
    setVolume: setVolumeValue,
    toggleWifi,
    toggleBluetooth,
    openSystemPanel,
    requestContactsPermission,
    requestSmsPermission,
    autoBrightness,
    setAutoBrightness: setAutoBrightnessValue,
  }), [state, refresh, setBrightnessValue, setVolumeValue, toggleWifi, toggleBluetooth, openSystemPanel, requestContactsPermission, requestSmsPermission, autoBrightness, setAutoBrightnessValue]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider');
  return ctx;
}
