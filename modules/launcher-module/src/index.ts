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

export interface DeviceNotification {
  id: string;
  packageName: string;
  title: string;
  text: string;
  time: number;
  isOngoing: boolean;
}

interface LauncherModuleType {
  // Apps
  getInstalledApps(): Promise<InstalledApp[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAppIcon(packageName: string): Promise<string>;
  isDefaultLauncher(): Promise<boolean>;
  openLauncherSettings(): Promise<boolean>;
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
  // System settings
  openSystemSettings(panel: string): Promise<boolean>;
  // Network
  getNetworkInfo(): Promise<NetworkInfo>;
  // Notifications
  getNotifications(): Promise<DeviceNotification[]>;
  isNotificationAccessGranted(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
}

const isAndroid = Platform.OS === 'android';

const stub: LauncherModuleType = {
  getInstalledApps: async () => [],
  launchApp: async () => false,
  getAppIcon: async () => '',
  isDefaultLauncher: async () => false,
  openLauncherSettings: async () => false,
  getWifiInfo: async () => ({ enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' }),
  setWifiEnabled: async () => false,
  getWifiNetworks: async () => [],
  getBluetoothInfo: async () => ({ enabled: false, name: '', address: '', pairedDevices: [] }),
  setBluetoothEnabled: async () => false,
  getStorageInfo: async () => ({ totalBytes: 0, freeBytes: 0, usedBytes: 0, totalGB: '0', freeGB: '0', usedGB: '0', usedPercentage: 0 }),
  getRecentMessages: async () => [],
  openSystemSettings: async () => false,
  getNetworkInfo: async () => ({ isConnected: false, isWifi: false, isCellular: false, isVpn: false }),
  getNotifications: async () => [],
  isNotificationAccessGranted: async () => false,
  openNotificationAccessSettings: async () => false,
};

const LauncherModule: LauncherModuleType = isAndroid
  ? requireNativeModule('LauncherModule')
  : stub;

export { LauncherModuleType };
export default LauncherModule;
