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
  ip: string;
  networks: { ssid: string; level: number; isSecure: boolean }[];
}

export interface DeviceBluetooth {
  enabled: boolean;
  name: string;
  pairedDevices: { name: string; address: string }[];
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

interface DeviceState {
  battery: { level: number; isCharging: boolean };
  brightness: number;
  wifi: DeviceWifi;
  bluetooth: DeviceBluetooth;
  storage: DeviceStorage;
  network: { isConnected: boolean; isWifi: boolean; isCellular: boolean };
  messages: DeviceSms[];
  contacts: DeviceContact[];
  isReady: boolean;
}

interface DeviceContextValue extends DeviceState {
  refresh: () => Promise<void>;
  setBrightness: (value: number) => Promise<void>;
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
  wifi: { enabled: false, ssid: '', rssi: 0, ip: '', networks: [] },
  bluetooth: { enabled: false, name: '', pairedDevices: [] },
  storage: { totalGB: '0', usedGB: '0', freeGB: '0', usedPercentage: 0 },
  network: { isConnected: false, isWifi: false, isCellular: false },
  messages: [],
  contacts: [],
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
        pairedDevices: info.pairedDevices.map((d: { name: string; address: string }) => ({
          name: d.name, address: d.address,
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

  const refresh = useCallback(async () => {
    const [battery, brightness, network, wifi, bluetooth, storage, messages, contacts] = await Promise.all([
      loadBattery(), loadBrightness(), loadNetwork(), loadWifi(),
      loadBluetooth(), loadStorage(), loadMessages(), loadContacts(),
    ]);
    setState({
      battery, brightness, wifi, bluetooth, storage, network, messages, contacts, isReady: true,
    });
  }, [loadBattery, loadBrightness, loadNetwork, loadWifi, loadBluetooth, loadStorage, loadMessages, loadContacts]);

  // Initial load
  useEffect(() => { refresh(); }, [refresh]);

  // Refresh on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

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

  const toggleWifi = useCallback(async () => {
    const mod = await getLauncherModule();
    if (mod) await mod.setWifiEnabled(!state.wifi.enabled);
  }, [getLauncherModule, state.wifi.enabled]);

  const toggleBluetooth = useCallback(async () => {
    const mod = await getLauncherModule();
    if (mod) await mod.setBluetoothEnabled(!state.bluetooth.enabled);
  }, [getLauncherModule, state.bluetooth.enabled]);

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
    toggleWifi,
    toggleBluetooth,
    openSystemPanel,
    requestContactsPermission,
    requestSmsPermission,
  }), [state, refresh, setBrightnessValue, toggleWifi, toggleBluetooth, openSystemPanel, requestContactsPermission, requestSmsPermission]);

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice() {
  const ctx = useContext(DeviceContext);
  if (!ctx) throw new Error('useDevice must be used within DeviceProvider');
  return ctx;
}
