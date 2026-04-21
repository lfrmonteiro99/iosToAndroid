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

export interface DiscoveredBluetoothDevice {
  name: string;
  address: string;
  type: number;
  rssi: number;
  bondState: number;
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

export interface CarrierInfo {
  carrierName: string;
  networkType: string;
  signalStrength: number;
  isRoaming: boolean;
  phoneNumber: string;
  simOperator: string;
}

export interface AppStorageStat {
  packageName: string;
  appName: string;
  totalBytes: number;
  cacheBytes: number;
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
  goHome(): Promise<boolean>;
  uninstallApp(packageName: string): Promise<boolean>;
  // Wi-Fi
  getWifiInfo(): Promise<WifiInfo>;
  setWifiEnabled(enabled: boolean): Promise<boolean>;
  getWifiNetworks(): Promise<WifiNetwork[]>;
  joinWifiNetwork(ssid: string, password: string, security: string): Promise<boolean>;
  forgetWifiNetwork(ssid: string): Promise<boolean>;
  // Bluetooth
  getBluetoothInfo(): Promise<BluetoothInfo>;
  setBluetoothEnabled(enabled: boolean): Promise<boolean>;
  startBluetoothDiscovery(): Promise<boolean>;
  stopBluetoothDiscovery(): Promise<boolean>;
  getDiscoveredBluetoothDevices(): Promise<DiscoveredBluetoothDevice[]>;
  pairBluetoothDevice(address: string): Promise<boolean>;
  unpairBluetoothDevice(address: string): Promise<boolean>;
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
  // Carrier
  getCarrierInfo(): Promise<CarrierInfo>;
  // App Storage Stats
  getAppStorageStats(): Promise<AppStorageStat[]>;
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
  goHome: async () => false,
  uninstallApp: async () => false,
  getWifiInfo: async () => ({ enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' }),
  setWifiEnabled: async () => false,
  getWifiNetworks: async () => [],
  joinWifiNetwork: async () => false,
  forgetWifiNetwork: async () => false,
  getBluetoothInfo: async () => ({ enabled: false, name: '', address: '', pairedDevices: [] }),
  setBluetoothEnabled: async () => false,
  startBluetoothDiscovery: async () => false,
  stopBluetoothDiscovery: async () => false,
  getDiscoveredBluetoothDevices: async () => [],
  pairBluetoothDevice: async () => false,
  unpairBluetoothDevice: async () => false,
  getStorageInfo: async () => ({ totalBytes: 0, freeBytes: 0, usedBytes: 0, totalGB: '0', freeGB: '0', usedGB: '0', usedPercentage: 0 }),
  getRecentMessages: async () => [],
  getVolume: async () => 0.5,
  setVolume: async () => false,
  openSystemSettings: async () => false,
  getNetworkInfo: async () => ({ isConnected: false, isWifi: false, isCellular: false, isVpn: false }),
  getCarrierInfo: async () => ({ carrierName: '', networkType: 'Unknown', signalStrength: 0, isRoaming: false, phoneNumber: '', simOperator: '' }),
  getAppStorageStats: async () => [],
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
      catch (e) { console.error('LauncherModule.getInstalledApps failed:', e); reportBridgeError('getInstalledApps', e); return []; }
    },
    launchApp: async (packageName: string) => {
      try { return await nativeModule.launchApp(packageName); }
      catch (e) { console.error('LauncherModule.launchApp failed:', e); reportBridgeError('launchApp', e); return false; }
    },
    getAppIcon: async (packageName: string) => {
      try { return await nativeModule.getAppIcon(packageName); }
      catch (e) { console.error('LauncherModule.getAppIcon failed:', e); reportBridgeError('getAppIcon', e); return ''; }
    },
    isDefaultLauncher: async () => {
      try { return await nativeModule.isDefaultLauncher(); }
      catch (e) { console.error('LauncherModule.isDefaultLauncher failed:', e); reportBridgeError('isDefaultLauncher', e); return false; }
    },
    openLauncherSettings: async () => {
      try { return await nativeModule.openLauncherSettings(); }
      catch (e) { console.error('LauncherModule.openLauncherSettings failed:', e); reportBridgeError('openLauncherSettings', e); return false; }
    },
    goHome: async () => {
      try { return await nativeModule.goHome(); }
      catch (e) { console.error('LauncherModule.goHome failed:', e); reportBridgeError('goHome', e); return false; }
    },
    uninstallApp: async (packageName: string) => {
      try { return await nativeModule.uninstallApp(packageName); }
      catch (e) { console.error('LauncherModule.uninstallApp failed:', e); reportBridgeError('uninstallApp', e); return false; }
    },
    getWifiInfo: async () => {
      try { return await nativeModule.getWifiInfo(); }
      catch (e) { console.error('LauncherModule.getWifiInfo failed:', e); reportBridgeError('getWifiInfo', e); return { enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' }; }
    },
    setWifiEnabled: async (enabled: boolean) => {
      try { return await nativeModule.setWifiEnabled(enabled); }
      catch (e) { console.error('LauncherModule.setWifiEnabled failed:', e); reportBridgeError('setWifiEnabled', e); return false; }
    },
    getWifiNetworks: async () => {
      try { return await nativeModule.getWifiNetworks(); }
      catch (e) { console.error('LauncherModule.getWifiNetworks failed:', e); reportBridgeError('getWifiNetworks', e); return []; }
    },
    joinWifiNetwork: async (ssid: string, password: string, security: string) => {
      try { return await nativeModule.joinWifiNetwork(ssid, password, security); }
      catch (e) { console.error('LauncherModule.joinWifiNetwork failed:', e); reportBridgeError('joinWifiNetwork', e); return false; }
    },
    forgetWifiNetwork: async (ssid: string) => {
      try { return await nativeModule.forgetWifiNetwork(ssid); }
      catch (e) { console.error('LauncherModule.forgetWifiNetwork failed:', e); reportBridgeError('forgetWifiNetwork', e); return false; }
    },
    getBluetoothInfo: async () => {
      try { return await nativeModule.getBluetoothInfo(); }
      catch (e) { console.error('LauncherModule.getBluetoothInfo failed:', e); reportBridgeError('getBluetoothInfo', e); return { enabled: false, name: '', address: '', pairedDevices: [] }; }
    },
    setBluetoothEnabled: async (enabled: boolean) => {
      try { return await nativeModule.setBluetoothEnabled(enabled); }
      catch (e) { console.error('LauncherModule.setBluetoothEnabled failed:', e); reportBridgeError('setBluetoothEnabled', e); return false; }
    },
    startBluetoothDiscovery: async () => {
      try { return await nativeModule.startBluetoothDiscovery(); }
      catch (e) { console.error('LauncherModule.startBluetoothDiscovery failed:', e); reportBridgeError('startBluetoothDiscovery', e); return false; }
    },
    stopBluetoothDiscovery: async () => {
      try { return await nativeModule.stopBluetoothDiscovery(); }
      catch (e) { console.error('LauncherModule.stopBluetoothDiscovery failed:', e); reportBridgeError('stopBluetoothDiscovery', e); return false; }
    },
    getDiscoveredBluetoothDevices: async () => {
      try { return await nativeModule.getDiscoveredBluetoothDevices(); }
      catch (e) { console.error('LauncherModule.getDiscoveredBluetoothDevices failed:', e); reportBridgeError('getDiscoveredBluetoothDevices', e); return []; }
    },
    pairBluetoothDevice: async (address: string) => {
      try { return await nativeModule.pairBluetoothDevice(address); }
      catch (e) { console.error('LauncherModule.pairBluetoothDevice failed:', e); reportBridgeError('pairBluetoothDevice', e); return false; }
    },
    unpairBluetoothDevice: async (address: string) => {
      try { return await nativeModule.unpairBluetoothDevice(address); }
      catch (e) { console.error('LauncherModule.unpairBluetoothDevice failed:', e); reportBridgeError('unpairBluetoothDevice', e); return false; }
    },
    getStorageInfo: async () => {
      try { return await nativeModule.getStorageInfo(); }
      catch (e) { console.error('LauncherModule.getStorageInfo failed:', e); reportBridgeError('getStorageInfo', e); return { totalBytes: 0, freeBytes: 0, usedBytes: 0, totalGB: '0', freeGB: '0', usedGB: '0', usedPercentage: 0 }; }
    },
    getRecentMessages: async (limit: number) => {
      try { return await nativeModule.getRecentMessages(limit); }
      catch (e) { console.error('LauncherModule.getRecentMessages failed:', e); reportBridgeError('getRecentMessages', e); return []; }
    },
    getVolume: async () => {
      try { return await nativeModule.getVolume(); }
      catch (e) { console.error('LauncherModule.getVolume failed:', e); reportBridgeError('getVolume', e); return 0.5; }
    },
    setVolume: async (level: number) => {
      try { return await nativeModule.setVolume(level); }
      catch (e) { console.error('LauncherModule.setVolume failed:', e); reportBridgeError('setVolume', e); return false; }
    },
    openSystemSettings: async (panel: string) => {
      try { return await nativeModule.openSystemSettings(panel); }
      catch (e) { console.error('LauncherModule.openSystemSettings failed:', e); reportBridgeError('openSystemSettings', e); return false; }
    },
    getNetworkInfo: async () => {
      try { return await nativeModule.getNetworkInfo(); }
      catch (e) { console.error('LauncherModule.getNetworkInfo failed:', e); reportBridgeError('getNetworkInfo', e); return { isConnected: false, isWifi: false, isCellular: false, isVpn: false }; }
    },
    getCarrierInfo: async () => {
      try { return await nativeModule.getCarrierInfo(); }
      catch (e) { console.error('LauncherModule.getCarrierInfo failed:', e); reportBridgeError('getCarrierInfo', e); return { carrierName: '', networkType: 'Unknown', signalStrength: 0, isRoaming: false, phoneNumber: '', simOperator: '' }; }
    },
    getAppStorageStats: async () => {
      try { return await nativeModule.getAppStorageStats(); }
      catch (e) { console.error('LauncherModule.getAppStorageStats failed:', e); reportBridgeError('getAppStorageStats', e); return []; }
    },
    setFlashlight: async (enabled: boolean) => {
      try { return await nativeModule.setFlashlight(enabled); }
      catch (e) { console.error('LauncherModule.setFlashlight failed:', e); reportBridgeError('setFlashlight', e); return false; }
    },
    isFlashlightOn: async () => {
      try { return await nativeModule.isFlashlightOn(); }
      catch (e) { console.error('LauncherModule.isFlashlightOn failed:', e); reportBridgeError('isFlashlightOn', e); return false; }
    },
    getCallLog: async (limit: number) => {
      try { return await nativeModule.getCallLog(limit); }
      catch (e) { console.error('LauncherModule.getCallLog failed:', e); reportBridgeError('getCallLog', e); return []; }
    },
    makeCall: async (number: string) => {
      try { return await nativeModule.makeCall(number); }
      catch (e) { console.error('LauncherModule.makeCall failed:', e); reportBridgeError('makeCall', e); return false; }
    },
    getNotifications: async () => {
      try { return await nativeModule.getNotifications(); }
      catch (e) { console.error('LauncherModule.getNotifications failed:', e); reportBridgeError('getNotifications', e); return []; }
    },
    clearNotification: async (key: string) => {
      try { return await nativeModule.clearNotification(key); }
      catch (e) { console.error('LauncherModule.clearNotification failed:', e); reportBridgeError('clearNotification', e); return false; }
    },
    clearAllNotifications: async () => {
      try { return await nativeModule.clearAllNotifications(); }
      catch (e) { console.error('LauncherModule.clearAllNotifications failed:', e); reportBridgeError('clearAllNotifications', e); return false; }
    },
    isNotificationAccessGranted: async () => {
      try { return await nativeModule.isNotificationAccessGranted(); }
      catch (e) { console.error('LauncherModule.isNotificationAccessGranted failed:', e); reportBridgeError('isNotificationAccessGranted', e); return false; }
    },
    openNotificationAccessSettings: async () => {
      try { return await nativeModule.openNotificationAccessSettings(); }
      catch (e) { console.error('LauncherModule.openNotificationAccessSettings failed:', e); reportBridgeError('openNotificationAccessSettings', e); return false; }
    },
    sendSms: async (address: string, body: string) => {
      try { return await nativeModule.sendSms(address, body); }
      catch (e) { console.error('LauncherModule.sendSms failed:', e); reportBridgeError('sendSms', e); return false; }
    },
    requestAllPermissions: async () => {
      try { return await nativeModule.requestAllPermissions(); }
      catch (e) { console.error('LauncherModule.requestAllPermissions failed:', e); reportBridgeError('requestAllPermissions', e); return false; }
    },
    checkPermissions: async () => {
      try { return await nativeModule.checkPermissions(); }
      catch (e) { console.error('LauncherModule.checkPermissions failed:', e); reportBridgeError('checkPermissions', e); return {}; }
    },
    getCalendarEvents: async (daysAhead: number) => {
      try { return await nativeModule.getCalendarEvents(daysAhead); }
      catch (e) { console.error('LauncherModule.getCalendarEvents failed:', e); reportBridgeError('getCalendarEvents', e); return []; }
    },
    getNowPlaying: async () => {
      try { return await nativeModule.getNowPlaying(); }
      catch (e) { console.error('LauncherModule.getNowPlaying failed:', e); reportBridgeError('getNowPlaying', e); return { title: '', artist: '', album: '', isPlaying: false, packageName: '' }; }
    },
    mediaPrev: async () => {
      try { return await nativeModule.mediaPrev(); }
      catch (e) { console.error('LauncherModule.mediaPrev failed:', e); reportBridgeError('mediaPrev', e); return false; }
    },
    mediaPlayPause: async () => {
      try { return await nativeModule.mediaPlayPause(); }
      catch (e) { console.error('LauncherModule.mediaPlayPause failed:', e); reportBridgeError('mediaPlayPause', e); return false; }
    },
    mediaNext: async () => {
      try { return await nativeModule.mediaNext(); }
      catch (e) { console.error('LauncherModule.mediaNext failed:', e); reportBridgeError('mediaNext', e); return false; }
    },
    isUsageAccessGranted: async () => {
      try { return await nativeModule.isUsageAccessGranted(); }
      catch (e) { console.error('LauncherModule.isUsageAccessGranted failed:', e); reportBridgeError('isUsageAccessGranted', e); return false; }
    },
    openUsageAccessSettings: async () => {
      try { return await nativeModule.openUsageAccessSettings(); }
      catch (e) { console.error('LauncherModule.openUsageAccessSettings failed:', e); reportBridgeError('openUsageAccessSettings', e); return false; }
    },
    getScreenTimeStats: async (daysBack: number) => {
      try { return await nativeModule.getScreenTimeStats(daysBack); }
      catch (e) { console.error('LauncherModule.getScreenTimeStats failed:', e); reportBridgeError('getScreenTimeStats', e); return []; }
    },
    getTodayScreenTime: async () => {
      try { return await nativeModule.getTodayScreenTime(); }
      catch (e) { console.error('LauncherModule.getTodayScreenTime failed:', e); reportBridgeError('getTodayScreenTime', e); return { totalMinutes: 0, topApps: [] }; }
    },
  };
}

const LauncherModule: LauncherModuleType = createBridgedModule();

// ─── Error reporting ────────────────────────────────────────────────────────
// Subscribe to native module errors. The app can use this to display
// user-facing error notifications instead of silently swallowing failures.

type ErrorListener = (method: string, error: unknown) => void;
const errorListeners: Set<ErrorListener> = new Set();

export function onBridgeError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => { errorListeners.delete(listener); };
}

/** Called internally by the bridged methods when an error occurs. */
export function reportBridgeError(method: string, error: unknown): void {
  for (const listener of errorListeners) {
    try { listener(method, error); } catch { /* don't let listener errors propagate */ }
  }
}

export { LauncherModuleType };
export default LauncherModule;

// ─── Event-driven notification listeners ────────────────────────────────────
// Subscribe to real-time notification events emitted by NotificationService
// via the Expo module's own event emitter (sendEvent from the native side).

type Subscription = { remove: () => void };

function addModuleListener(eventName: string, handler: (payload: any) => void): Subscription {
  if (!nativeModule || typeof nativeModule.addListener !== 'function') {
    return { remove: () => {} };
  }
  const sub: Subscription = nativeModule.addListener(eventName, handler);
  return sub;
}

/**
 * Subscribe to new notifications as they arrive.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addNotificationListener(
  listener: (n: DeviceNotification) => void,
): () => void {
  const sub = addModuleListener('onNotificationPosted', listener);
  return () => sub.remove();
}

/**
 * Subscribe to notification removals.
 * The callback receives the notification key (string id).
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addNotificationRemovedListener(
  listener: (id: string) => void,
): () => void {
  const sub = addModuleListener('onNotificationRemoved', (n: { id: string }) => {
    listener(n.id);
  });
  return () => sub.remove();
}
