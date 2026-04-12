import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/settings';

export interface SettingsState {
  airplaneMode: boolean;
  wifiEnabled: boolean;
  wifiNetwork: string;
  bluetoothEnabled: boolean;
  bluetoothName: string;
  cellularDataEnabled: boolean;
  hotspotEnabled: boolean;
  hotspotPassword: string;
  hotspotMaxCompatibility: boolean;
  notificationsEnabled: boolean;
  notificationSounds: boolean;
  notificationBadges: boolean;
  notificationPreviews: 'always' | 'whenUnlocked' | 'never';
  ringtone: string;
  textTone: string;
  volume: number;
  vibration: boolean;
  keyboardClicks: boolean;
  lockSound: boolean;
  focusMode: 'off' | 'doNotDisturb' | 'sleep' | 'work' | 'personal';
  focusScheduleEnabled: boolean;
  screenTimeEnabled: boolean;
  dailyLimit: number;
  downtime: boolean;
  downtimeStart: string;
  downtimeEnd: string;
  textSizeIndex: number;
  trueTone: boolean;
  autoLock: string;
  raiseToWake: boolean;
  airdrop: 'off' | 'contactsOnly' | 'everyone';
  backgroundAppRefresh: 'off' | 'wifi' | 'wifiAndCellular';
  dateTimeAutomatic: boolean;
  timezone: string;
  use24Hour: boolean;
  keyboardAutoCorrect: boolean;
  keyboardAutoCapitalize: boolean;
  keyboardPredictive: boolean;
  language: string;
  region: string;
  vpnEnabled: boolean;
  lowPowerMode: boolean;
  batteryPercentage: boolean;
  locationServices: boolean;
  analyticsEnabled: boolean;
  personalizedAds: boolean;
  wallpaperIndex: number;
  reduceMotion: boolean;
  boldText: boolean;
  showLockScreen: boolean;
  biometricUnlock: boolean;
  showSearchLabel: boolean;
  automaticUpdates: boolean;
}

export const DEFAULT_SETTINGS: SettingsState = {
  airplaneMode: false,
  wifiEnabled: true,
  wifiNetwork: 'Home',
  bluetoothEnabled: true,
  bluetoothName: 'iosToAndroid',
  cellularDataEnabled: true,
  hotspotEnabled: false,
  hotspotPassword: '',
  hotspotMaxCompatibility: false,
  notificationsEnabled: true,
  notificationSounds: true,
  notificationBadges: true,
  notificationPreviews: 'always',
  ringtone: 'Reflection',
  textTone: 'Note',
  volume: 0.7,
  vibration: true,
  keyboardClicks: true,
  lockSound: true,
  focusMode: 'off',
  focusScheduleEnabled: false,
  screenTimeEnabled: false,
  dailyLimit: 60,
  downtime: false,
  downtimeStart: '22:00',
  downtimeEnd: '07:00',
  textSizeIndex: 1,
  trueTone: true,
  autoLock: '5 Minutes',
  raiseToWake: true,
  airdrop: 'contactsOnly',
  backgroundAppRefresh: 'wifi',
  dateTimeAutomatic: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  use24Hour: false,
  keyboardAutoCorrect: true,
  keyboardAutoCapitalize: true,
  keyboardPredictive: true,
  language: 'English',
  region: 'United States',
  vpnEnabled: false,
  lowPowerMode: false,
  batteryPercentage: true,
  locationServices: true,
  analyticsEnabled: false,
  personalizedAds: false,
  wallpaperIndex: 0,
  reduceMotion: false,
  boldText: false,
  showLockScreen: true,
  biometricUnlock: true,
  showSearchLabel: true,
  automaticUpdates: true,
};

interface SettingsContextValue {
  settings: SettingsState;
  update: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  updateMany: (partial: Partial<SettingsState>) => void;
  reset: () => void;
  syncFromDevice: () => Promise<void>;
  isReady: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try { setSettings((prev) => ({ ...prev, ...JSON.parse(stored) })); } catch { /* ignore */ }
      }
      setIsReady(true);
    });
  }, []);

  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, isReady]);

  // Read real device state and sync it into settings
  const syncFromDevice = useCallback(async () => {
    const getLauncherModule = async () => {
      try {
        return (await import('../../modules/launcher-module/src')).default;
      } catch { return null; }
    };

    const partial: Partial<SettingsState> = {};

    // Timezone — always read from JS runtime (reflects system timezone)
    partial.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // WiFi and Bluetooth — read from native module on Android
    try {
      const mod = await getLauncherModule();
      if (mod) {
        const [wifiInfo, btInfo] = await Promise.all([
          mod.getWifiInfo().catch(() => null),
          mod.getBluetoothInfo().catch(() => null),
        ]);
        if (wifiInfo !== null) {
          partial.wifiEnabled = wifiInfo.enabled;
          if (wifiInfo.ssid) partial.wifiNetwork = wifiInfo.ssid;
        }
        if (btInfo !== null) {
          partial.bluetoothEnabled = btInfo.enabled;
          if (btInfo.name) partial.bluetoothName = btInfo.name;
        }
      }
    } catch { /* native module unavailable on non-Android */ }

    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  // Initial device sync after AsyncStorage load
  useEffect(() => {
    if (isReady) { syncFromDevice(); }
  }, [isReady, syncFromDevice]);

  // Re-sync when app comes to foreground (user may have changed settings in system UI)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') { syncFromDevice(); }
    });
    return () => sub.remove();
  }, [syncFromDevice]);

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateMany = useCallback((partial: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo(() => ({ settings, update, updateMany, reset, syncFromDevice, isReady }), [settings, update, updateMany, reset, syncFromDevice, isReady]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
