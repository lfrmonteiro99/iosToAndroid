import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { Platform, AppState } from 'react-native';
import * as Battery from 'expo-battery';
import * as Brightness from 'expo-brightness';
import * as Network from 'expo-network';
import * as Contacts from 'expo-contacts';

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
  bluetooth: DeviceBluetooth;
  storage: DeviceStorage;
  network: { isConnected: boolean; isWifi: boolean; isCellular: boolean };
  messages: DeviceSms[];
  contacts: DeviceContact[];
  weather: DeviceWeather;
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
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

const DEFAULT_STATE: DeviceState = {
  battery: { level: 1, isCharging: false },
  brightness: 0.5,
  volume: 0.5,
  wifi: { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '', networks: [] },
  bluetooth: { enabled: false, name: '', address: '', pairedDevices: [] },
  storage: { totalGB: '0', usedGB: '0', freeGB: '0', usedPercentage: 0 },
  network: { isConnected: false, isWifi: false, isCellular: false },
  messages: [],
  contacts: [],
  weather: { temp: 0, condition: '', icon: 'cloud', city: '' },
  isReady: false,
};

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DeviceState>(DEFAULT_STATE);

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

  const loadWifi = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return DEFAULT_STATE.wifi;
    try {
      const [info, networks] = await Promise.all([
        mod.getWifiInfo(),
        mod.getWifiNetworks().catch(() => []),
      ]);
      return {
        enabled: info.enabled,
        ssid: info.ssid,
        rssi: info.rssi,
        linkSpeed: info.linkSpeed ?? 0,
        ip: info.ip,
        networks: networks.map((n: { ssid: string; level: number; isSecure: boolean }) => ({
          ssid: n.ssid, level: n.level, isSecure: n.isSecure,
        })),
      };
    } catch { return DEFAULT_STATE.wifi; }
  }, [getLauncherModule]);

  const loadBluetooth = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return DEFAULT_STATE.bluetooth;
    try {
      const info = await mod.getBluetoothInfo();
      return {
        enabled: info.enabled,
        name: info.name,
        address: info.address ?? '',
        pairedDevices: info.pairedDevices.map((d: { name: string; address: string; type: number }) => ({
          name: d.name, address: d.address, type: d.type ?? 0,
        })),
      };
    } catch { return DEFAULT_STATE.bluetooth; }
  }, [getLauncherModule]);

  const loadStorage = useCallback(async () => {
    const mod = await getLauncherModule();
    if (!mod) return DEFAULT_STATE.storage;
    try {
      const info = await mod.getStorageInfo();
      return {
        totalGB: info.totalGB,
        usedGB: info.usedGB,
        freeGB: info.freeGB,
        usedPercentage: info.usedPercentage,
      };
    } catch { return DEFAULT_STATE.storage; }
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
        const { status } = await import('expo-location').then((m) => m.requestForegroundPermissionsAsync());
        if (status === 'granted') {
          const loc = await import('expo-location').then((m) =>
            m.getCurrentPositionAsync({ accuracy: 3 }),
          );
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

  const refresh = useCallback(async () => {
    const [battery, brightness, volume, network, wifi, bluetooth, storage, messages, contacts, weather] = await Promise.all([
      loadBattery(), loadBrightness(), loadVolume(), loadNetwork(), loadWifi(),
      loadBluetooth(), loadStorage(), loadMessages(), loadContacts(), loadWeather(),
    ]);
    setState({
      battery, brightness, volume, wifi, bluetooth, storage, network, messages, contacts, weather, isReady: true,
    });
  }, [loadBattery, loadBrightness, loadVolume, loadNetwork, loadWifi, loadBluetooth, loadStorage, loadMessages, loadContacts, loadWeather]);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  // Refresh on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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
    try {
      await Brightness.setBrightnessAsync(value);
      setState(prev => ({ ...prev, brightness: value }));
    } catch { /* needs permission */ }
  }, []);

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
    const wifi = await loadWifi();
    setState(prev => ({ ...prev, wifi }));
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
    const bluetooth = await loadBluetooth();
    setState(prev => ({ ...prev, bluetooth }));
  }, [getLauncherModule, state.bluetooth.enabled, loadBluetooth]);

  const openSystemPanel = useCallback(async (panel: string) => {
    const mod = await getLauncherModule();
    if (mod) await mod.openSystemSettings(panel);
  }, [getLauncherModule]);

  const requestContactsPermission = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      const contacts = await loadContacts();
      setState(prev => ({ ...prev, contacts }));
      return true;
    }
    return false;
  }, [loadContacts]);

  const requestSmsPermission = useCallback(async () => {
    // SMS permission is requested at runtime by the system when the native module accesses it
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
  }), [state, refresh, setBrightnessValue, setVolumeValue, toggleWifi, toggleBluetooth, openSystemPanel, requestContactsPermission, requestSmsPermission]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider');
  return ctx;
}
