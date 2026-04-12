import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface InstalledApp {
  name: string;
  packageName: string;
  icon: string;
  isSystem: boolean;
}

export interface WifiInfo {
  enabled: boolean;
  ssid: string;
  rssi: number;
  linkSpeed: number;
  ip: string;
}

export interface WifiNetwork {
  ssid: string;
  bssid: string;
  level: number;
  frequency: number;
  isSecure: boolean;
}

export interface BluetoothInfo {
  enabled: boolean;
  name: string;
  address: string;
  pairedDevices: { name: string; address: string; type: number }[];
}

export interface StorageInfo {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  totalGB: string;
  freeGB: string;
  usedGB: string;
  usedPercentage: number;
}

export interface SmsMessage {
  id: string;
  address: string;
  body: string;
  date: number;
  dateFormatted: string;
  type: number; // 1 = inbox, 2 = sent
  isRead: boolean;
}

export interface NetworkInfo {
  isConnected: boolean;
  isWifi: boolean;
  isCellular: boolean;
  isVpn: boolean;
}

export interface CallLogEntry {
  id: string;
  number: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'unknown';
  date: number;
  dateFormatted: string;
  duration: number;
}

export interface DeviceNotification {
  id: string;
  key: string;
  packageName: string;
  title: string;
  text: string;
  time: number;
  isOngoing: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
}

export interface NowPlaying {
  title: string;
  artist: string;
  album: string;
  isPlaying: boolean;
  packageName: string;
}

export interface ScreenTimeApp {
  name: string;
  packageName: string;
  minutes: number;
}

export interface ScreenTimeStat {
  packageName: string;
  totalTimeMs: number;
  appName: string;
  date: string;
}

export interface DailyScreenTime {
  totalMinutes: number;
  topApps: ScreenTimeApp[];
}

interface LauncherModuleType {
  // Apps
  getInstalledApps(): Promise<InstalledApp[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAppIcon(packageName: string): Promise<string>;
  isDefaultLauncher(): Promise<boolean>;
  openLauncherSettings(): Promise<boolean>;
  uninstallApp(packageName: string): Promise<boolean>;
  // Wi-Fi
  getWifiInfo(): Promise<WifiInfo>;
  setWifiEnabled(enabled: boolean): Promise<boolean>;
  getWifiNetworks(): Promise<WifiNetwork[]>;
  // Bluetooth
  getBluetoothInfo(): Promise<BluetoothInfo>;
  setBluetoothEnabled(enabled: boolean): Promise<boolean>;
  // Storage
  getStorageInfo(): Promise<StorageInfo>;
  // SMS
  getRecentMessages(limit: number): Promise<SmsMessage[]>;
  // Volume
  getVolume(): Promise<number>;
  setVolume(level: number): Promise<boolean>;
  // System settings
  openSystemSettings(panel: string): Promise<boolean>;
  // Network
  getNetworkInfo(): Promise<NetworkInfo>;
  // Flashlight
  setFlashlight(enabled: boolean): Promise<boolean>;
  isFlashlightOn(): Promise<boolean>;
  // Call Log
  getCallLog(limit: number): Promise<CallLogEntry[]>;
  makeCall(number: string): Promise<boolean>;
  // Notifications
  getNotifications(): Promise<DeviceNotification[]>;
  clearNotification(key: string): Promise<boolean>;
  clearAllNotifications(): Promise<boolean>;
  isNotificationAccessGranted(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
  // SMS Send
  sendSms(address: string, body: string): Promise<boolean>;
  // Calendar
  getCalendarEvents(daysAhead: number): Promise<CalendarEvent[]>;
  // Media session
  getNowPlaying(): Promise<NowPlaying>;
  mediaPrev(): Promise<boolean>;
  mediaPlayPause(): Promise<boolean>;
  mediaNext(): Promise<boolean>;
  // Screen Time
  isUsageAccessGranted(): Promise<boolean>;
  openUsageAccessSettings(): Promise<boolean>;
  getScreenTimeStats(daysBack: number): Promise<ScreenTimeStat[]>;
  getTodayScreenTime(): Promise<DailyScreenTime>;
  // Permissions
  requestAllPermissions(): Promise<boolean>;
  checkPermissions(): Promise<Record<string, boolean>>;
}

const isAndroid = Platform.OS === 'android';

const nativeModule = isAndroid ? requireNativeModule('LauncherModule') : null;

const stub: LauncherModuleType = {
  getInstalledApps: async () => [],
  launchApp: async () => false,
  getAppIcon: async () => '',
  isDefaultLauncher: async () => false,
  openLauncherSettings: async () => false,
  uninstallApp: async () => false,
  getWifiInfo: async () => ({ enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' }),
  setWifiEnabled: async () => false,
  getWifiNetworks: async () => [],
  getBluetoothInfo: async () => ({ enabled: false, name: '', address: '', pairedDevices: [] }),
  setBluetoothEnabled: async () => false,
  getStorageInfo: async () => ({ totalBytes: 0, freeBytes: 0, usedBytes: 0, totalGB: '0', freeGB: '0', usedGB: '0', usedPercentage: 0 }),
  getRecentMessages: async () => [],
  getVolume: async () => 0.5,
  setVolume: async () => false,
  openSystemSettings: async () => false,
  getNetworkInfo: async () => ({ isConnected: false, isWifi: false, isCellular: false, isVpn: false }),
  setFlashlight: async () => false,
  isFlashlightOn: async () => false,
  getCallLog: async () => [],
  makeCall: async () => false,
  getNotifications: async () => [],
  clearNotification: async () => false,
  clearAllNotifications: async () => false,
  isNotificationAccessGranted: async () => false,
  openNotificationAccessSettings: async () => false,
  sendSms: async () => false,
  requestAllPermissions: async () => false,
  checkPermissions: async () => ({}),
  getCalendarEvents: async () => [],
  getNowPlaying: async () => ({ title: '', artist: '', album: '', isPlaying: false, packageName: '' }),
  mediaPrev: async () => false,
  mediaPlayPause: async () => false,
  mediaNext: async () => false,
  isUsageAccessGranted: async () => false,
  openUsageAccessSettings: async () => false,
  getScreenTimeStats: async () => [],
  getTodayScreenTime: async () => ({ totalMinutes: 0, topApps: [] }),
};

function createBridgedModule(): LauncherModuleType {
  if (!nativeModule) return stub;

  return {
    getInstalledApps: async () => {
      try { return await nativeModule.getInstalledApps(); }
      catch (e) { console.warn('LauncherModule.getInstalledApps failed:', e); return []; }
    },
    launchApp: async (packageName: string) => {
      try { return await nativeModule.launchApp(packageName); }
      catch (e) { console.warn('LauncherModule.launchApp failed:', e); return false; }
    },
    getAppIcon: async (packageName: string) => {
      try { return await nativeModule.getAppIcon(packageName); }
      catch (e) { console.warn('LauncherModule.getAppIcon failed:', e); return ''; }
    },
    isDefaultLauncher: async () => {
      try { return await nativeModule.isDefaultLauncher(); }
      catch (e) { console.warn('LauncherModule.isDefaultLauncher failed:', e); return false; }
    },
    openLauncherSettings: async () => {
      try { return await nativeModule.openLauncherSettings(); }
      catch (e) { console.warn('LauncherModule.openLauncherSettings failed:', e); return false; }
    },
    uninstallApp: async (packageName: string) => {
      try { return await nativeModule.uninstallApp(packageName); }
      catch (e) { console.warn('LauncherModule.uninstallApp failed:', e); return false; }
    },
    getWifiInfo: async () => {
      try { return await nativeModule.getWifiInfo(); }
      catch (e) { console.warn('LauncherModule.getWifiInfo failed:', e); return { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' }; }
    },
    setWifiEnabled: async (enabled: boolean) => {
      try { return await nativeModule.setWifiEnabled(enabled); }
      catch (e) { console.warn('LauncherModule.setWifiEnabled failed:', e); return false; }
    },
    getWifiNetworks: async () => {
      try { return await nativeModule.getWifiNetworks(); }
      catch (e) { console.warn('LauncherModule.getWifiNetworks failed:', e); return []; }
    },
    getBluetoothInfo: async () => {
      try { return await nativeModule.getBluetoothInfo(); }
      catch (e) { console.warn('LauncherModule.getBluetoothInfo failed:', e); return { enabled: false, name: '', address: '', pairedDevices: [] }; }
    },
    setBluetoothEnabled: async (enabled: boolean) => {
      try { return await nativeModule.setBluetoothEnabled(enabled); }
      catch (e) { console.warn('LauncherModule.setBluetoothEnabled failed:', e); return false; }
    },
    getStorageInfo: async () => {
      try { return await nativeModule.getStorageInfo(); }
      catch (e) { console.warn('LauncherModule.getStorageInfo failed:', e); return { totalBytes: 0, freeBytes: 0, usedBytes: 0, totalGB: '0', freeGB: '0', usedGB: '0', usedPercentage: 0 }; }
    },
    getRecentMessages: async (limit: number) => {
      try { return await nativeModule.getRecentMessages(limit); }
      catch (e) { console.warn('LauncherModule.getRecentMessages failed:', e); return []; }
    },
    getVolume: async () => {
      try { return await nativeModule.getVolume(); }
      catch (e) { console.warn('LauncherModule.getVolume failed:', e); return 0.5; }
    },
    setVolume: async (level: number) => {
      try { return await nativeModule.setVolume(level); }
      catch (e) { console.warn('LauncherModule.setVolume failed:', e); return false; }
    },
    openSystemSettings: async (panel: string) => {
      try { return await nativeModule.openSystemSettings(panel); }
      catch (e) { console.warn('LauncherModule.openSystemSettings failed:', e); return false; }
    },
    getNetworkInfo: async () => {
      try { return await nativeModule.getNetworkInfo(); }
      catch (e) { console.warn('LauncherModule.getNetworkInfo failed:', e); return { isConnected: false, isWifi: false, isCellular: false, isVpn: false }; }
    },
    setFlashlight: async (enabled: boolean) => {
      try { return await nativeModule.setFlashlight(enabled); }
      catch (e) { console.warn('LauncherModule.setFlashlight failed:', e); return false; }
    },
    isFlashlightOn: async () => {
      try { return await nativeModule.isFlashlightOn(); }
      catch (e) { console.warn('LauncherModule.isFlashlightOn failed:', e); return false; }
    },
    getCallLog: async (limit: number) => {
      try { return await nativeModule.getCallLog(limit); }
      catch (e) { console.warn('LauncherModule.getCallLog failed:', e); return []; }
    },
    makeCall: async (number: string) => {
      try { return await nativeModule.makeCall(number); }
      catch (e) { console.warn('LauncherModule.makeCall failed:', e); return false; }
    },
    getNotifications: async () => {
      try { return await nativeModule.getNotifications(); }
      catch (e) { console.warn('LauncherModule.getNotifications failed:', e); return []; }
    },
    clearNotification: async (key: string) => {
      try { return await nativeModule.clearNotification(key); }
      catch (e) { console.warn('LauncherModule.clearNotification failed:', e); return false; }
    },
    clearAllNotifications: async () => {
      try { return await nativeModule.clearAllNotifications(); }
      catch (e) { console.warn('LauncherModule.clearAllNotifications failed:', e); return false; }
    },
    isNotificationAccessGranted: async () => {
      try { return await nativeModule.isNotificationAccessGranted(); }
      catch (e) { console.warn('LauncherModule.isNotificationAccessGranted failed:', e); return false; }
    },
    openNotificationAccessSettings: async () => {
      try { return await nativeModule.openNotificationAccessSettings(); }
      catch (e) { console.warn('LauncherModule.openNotificationAccessSettings failed:', e); return false; }
    },
    sendSms: async (address: string, body: string) => {
      try { return await nativeModule.sendSms(address, body); }
      catch (e) { console.warn('LauncherModule.sendSms failed:', e); return false; }
    },
    requestAllPermissions: async () => {
      try { return await nativeModule.requestAllPermissions(); }
      catch (e) { console.warn('LauncherModule.requestAllPermissions failed:', e); return false; }
    },
    checkPermissions: async () => {
      try { return await nativeModule.checkPermissions(); }
      catch (e) { console.warn('LauncherModule.checkPermissions failed:', e); return {}; }
    },
    getCalendarEvents: async (daysAhead: number) => {
      try { return await nativeModule.getCalendarEvents(daysAhead); }
      catch (e) { console.warn('LauncherModule.getCalendarEvents failed:', e); return []; }
    },
    getNowPlaying: async () => {
      try { return await nativeModule.getNowPlaying(); }
      catch (e) { console.warn('LauncherModule.getNowPlaying failed:', e); return { title: '', artist: '', album: '', isPlaying: false, packageName: '' }; }
    },
    mediaPrev: async () => {
      try { return await nativeModule.mediaPrev(); }
      catch (e) { console.warn('LauncherModule.mediaPrev failed:', e); return false; }
    },
    mediaPlayPause: async () => {
      try { return await nativeModule.mediaPlayPause(); }
      catch (e) { console.warn('LauncherModule.mediaPlayPause failed:', e); return false; }
    },
    mediaNext: async () => {
      try { return await nativeModule.mediaNext(); }
      catch (e) { console.warn('LauncherModule.mediaNext failed:', e); return false; }
    },
    isUsageAccessGranted: async () => {
      try { return await nativeModule.isUsageAccessGranted(); }
      catch (e) { console.warn('LauncherModule.isUsageAccessGranted failed:', e); return false; }
    },
    openUsageAccessSettings: async () => {
      try { return await nativeModule.openUsageAccessSettings(); }
      catch (e) { console.warn('LauncherModule.openUsageAccessSettings failed:', e); return false; }
    },
    getScreenTimeStats: async (daysBack: number) => {
      try { return await nativeModule.getScreenTimeStats(daysBack); }
      catch (e) { console.warn('LauncherModule.getScreenTimeStats failed:', e); return []; }
    },
    getTodayScreenTime: async () => {
      try { return await nativeModule.getTodayScreenTime(); }
      catch (e) { console.warn('LauncherModule.getTodayScreenTime failed:', e); return { totalMinutes: 0, topApps: [] }; }
    },
  };
}

const LauncherModule: LauncherModuleType = createBridgedModule();

export { LauncherModuleType };
export default LauncherModule;
