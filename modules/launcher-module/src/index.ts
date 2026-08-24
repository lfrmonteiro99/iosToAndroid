import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface InstalledApp {
  name: string;
  packageName: string;
  /**
   * A COMPLETE URI, already prefixed on the Kotlin side — pass it straight to
   * `<Image source={{ uri: app.icon }} />`; prefixing it again yields a
   * double-prefixed URI that silently renders nothing.
   *
   * `getInstalledApps()` returns a `file://` URI pointing at a PNG cached
   * under `context.filesDir/icons/<packageName>_<versionCode>.png`
   * (LauncherModule.kt's `getInstalledApps` AsyncFunction + `IconCache`) — the
   * icon is decoded from the launcher activity only once per app version, not
   * on every app start. `getAppIcon(packageName)` still returns a one-off
   * `data:image/png;base64,<payload>` (LauncherModule.kt's `drawableToBase64`),
   * uncached, for on-demand single-icon lookups.
   * Empty string when the icon could not be loaded.
   */
  icon: string;
  isSystem: boolean;
  /**
   * ApplicationInfo.category mapped to a stable string constant.
   * Possible values: 'undefined', 'game', 'audio', 'video', 'image', 'social',
   * 'news', 'maps', 'productivity', 'accessibility'.
   * API 26+; older devices return 'undefined'.
   */
  category: string;
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

export interface InstalledKeyboard {
  id: string;
  label: string;
  enabled: boolean;
}

/**
 * Máscara a aplicar aos ícones, decidida em JS (src/utils/iconShape.ts) e
 * aplicada nativamente. `exponent: null` significa "sem máscara" — o drawable
 * do sistema tal como ele vem. `cacheKey` entra no nome do PNG em disco, o que
 * é o que faz uma mudança de forma invalidar a cache em vez de devolver o
 * ficheiro com a forma antiga.
 */
export interface IconMask {
  shape: string;
  exponent: number | null;
  cacheKey: string;
}

interface LauncherModuleType {
  // Apps
  /**
   * [mask] selects the icon mask applied at render time (#482); [treatment]
   * selects whether icons get the squircle mask applied — 'mask-all' |
   * 'mask-adaptive-only' | 'none', mirrors SettingsState['iconTreatment']
   * (#486). treatment is folded into the on-disk cache key
   * (IconCache.fileName), so passing a different value than last time makes
   * the previous PNGs orphaned and forces a redraw. Omit to use the native
   * default ('mask-adaptive-only').
   */
  getInstalledApps(mask?: IconMask, treatment?: string): Promise<InstalledApp[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAppIcon(packageName: string, mask?: IconMask): Promise<string>;
  /**
   * Single-package variant of getInstalledApps: resolves the launcher entry for
   * one package, or null when the package is not installed or has no launcher
   * activity. Used to refresh only the package a PACKAGE_* broadcast named,
   * instead of rescanning every installed app. [treatment] — see getInstalledApps.
   */
  /**
   * Single-package variant of getInstalledApps: resolves the launcher entry for
   * one package, or null when the package is not installed or has no launcher
   * activity. Used to refresh only the package a PACKAGE_* broadcast named,
   * instead of rescanning every installed app. [mask]/[treatment] — see
   * getInstalledApps.
   */
  getAppInfo(packageName: string, mask?: IconMask, treatment?: string): Promise<InstalledApp | null>;
  /**
   * Deletes every cached icon PNG under filesDir/icons. Returns the number of
   * files deleted. The manual escape hatch (#486) for when versionCode/treatment
   * key invalidation misses a case — callers must re-populate the cache
   * themselves afterwards (e.g. via getAppInfo per package).
   */
  clearIconCache(): Promise<number>;
  /** Total size, in bytes, of the on-disk icon cache (filesDir/icons). */
  getIconCacheSizeBytes(): Promise<number>;
  isDefaultLauncher(): Promise<boolean>;
  openLauncherSettings(): Promise<boolean>;
  goHome(): Promise<boolean>;
  /**
   * Idade do processo em ms. -1 quando indisponível (< API 24, fora de Android,
   * ou erro na bridge) — nunca 0, para "sem medição" não passar por
   * "instantâneo". Async como todos os métodos desta bridge, ainda que o lado
   * nativo seja uma leitura de relógio: o contrato uniforme é o que o
   * tratamento de erros (`onBridgeError`) e os seus testes assumem.
   */
  getProcessStartAgeMs(): Promise<number>;
  uninstallApp(packageName: string): Promise<boolean>;
  // Wi-Fi
  getWifiInfo(): Promise<WifiInfo | null>;
  setWifiEnabled(enabled: boolean): Promise<boolean>;
  isLocationEnabled(): Promise<boolean>;
  getWifiNetworks(): Promise<WifiNetwork[]>;
  joinWifiNetwork(ssid: string, password: string, security: string): Promise<boolean>;
  forgetWifiNetwork(ssid: string): Promise<boolean>;
  // Bluetooth
  getBluetoothInfo(): Promise<BluetoothInfo | null>;
  setBluetoothEnabled(enabled: boolean): Promise<boolean>;
  startBluetoothDiscovery(): Promise<boolean>;
  stopBluetoothDiscovery(): Promise<boolean>;
  getDiscoveredBluetoothDevices(): Promise<DiscoveredBluetoothDevice[]>;
  pairBluetoothDevice(address: string): Promise<boolean>;
  unpairBluetoothDevice(address: string): Promise<boolean>;
  // Storage
  getStorageInfo(): Promise<StorageInfo | null>;
  // SMS
  getRecentMessages(limit: number): Promise<SmsMessage[]>;
  // Volume
  getVolume(): Promise<number>;
  setVolume(level: number): Promise<boolean>;
  // System settings
  openSystemSettings(panel: string): Promise<boolean>;
  // Network
  getNetworkInfo(): Promise<NetworkInfo | null>;
  // Carrier
  getCarrierInfo(): Promise<CarrierInfo>;
  // App Storage Stats
  getAppStorageStats(): Promise<AppStorageStat[]>;
  // Flashlight
  setFlashlight(enabled: boolean): Promise<boolean>;
  isFlashlightOn(): Promise<boolean>;
  // Wake Screen (Tap to Wake, #608) — wakes the (app-dimmed) screen on tap
  wakeScreen(): Promise<void>;
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
  // Keyboards
  getInstalledKeyboards(): Promise<InstalledKeyboard[]>;
  // Ringtone
  getRingtone(): Promise<string>;
  canWriteSystemSettings(): Promise<boolean>;
  openWriteSettingsAccess(): Promise<boolean>;
  setRingtone(uri: string): Promise<boolean>;
  // Speech recognition (Siri / voice-to-text)
  startSpeechRecognition(): Promise<boolean>;
  stopSpeechRecognition(): Promise<boolean>;
  isSpeechRecognitionAvailable(): Promise<boolean>;
  // Foreground monitor + Protected-Apps gate (#627 child issue). The native
  // AccessibilityService (ForegroundMonitorService) watches the foreground app
  // and, after setProtectedApps([...]) seeds its in-memory set, shows a
  // BiometricPrompt before releasing a protected package. The launcher pushes
  // its AppsStore set down here whenever it changes.
  setProtectedApps(packageNames: string[]): Promise<boolean>;
  // True when the AccessibilityService is enabled in system settings (the user
  // must toggle it there — we cannot do it for them). Used to warn the user
  // that the global gate is inactive.
  isForegroundMonitorEnabled(): Promise<boolean>;
  // Opens the Accessibility settings screen so the user can enable the service.
  openAccessibilitySettings(): Promise<boolean>;
  // Live Activities (Android equivalent of iOS Live Activities, #626): an
  // ongoing notification whose title/text/progress updates in place.
  // `progress`/`maxProgress` are normalized client-side (clampLiveActivityProgress)
  // before reaching native — see createBridgedModule().
  postLiveActivity(
    id: string,
    title: string,
    text: string,
    progress: number,
    maxProgress: number,
  ): Promise<boolean>;
  cancelLiveActivity(id: string): Promise<boolean>;
  // Back Tap (#636): foreground sensor service detecting double/triple taps on
  // the device back via accelerometer + gyroscope; emits `onBackTap`.
  startTapDetection(): Promise<boolean>;
  stopTapDetection(): Promise<boolean>;
  isTapDetectionRunning(): Promise<boolean>;
}

export interface LiveActivityProgress {
  percent: number;
  indeterminate: boolean;
}

/**
 * Normalizes a progress/maxProgress pair for a live-activity notification.
 * `maxProgress <= 0` (or either value non-finite) means "no known total" —
 * the Android progress bar should be indeterminate rather than showing a
 * bogus percentage from a division by zero.
 */
export function clampLiveActivityProgress(progress: number, maxProgress: number): LiveActivityProgress {
  if (!Number.isFinite(progress) || !Number.isFinite(maxProgress) || maxProgress <= 0) {
    return { percent: 0, indeterminate: true };
  }
  const ratio = Math.min(1, Math.max(0, progress / maxProgress));
  return { percent: Math.round(ratio * 100), indeterminate: false };
}

const isAndroid = Platform.OS === 'android';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- requireNativeModule returns an opaque native object; typing it as any is required for property access
let nativeModule: any = null;
if (isAndroid) {
  try { nativeModule = requireNativeModule('LauncherModule'); }
  catch (e) { console.error('LauncherModule unavailable, using stub', e); }
}

const stub: LauncherModuleType = {
  getInstalledApps: async () => [],
  launchApp: async () => false,
  getAppIcon: async () => '',
  getAppInfo: async () => null,
  isDefaultLauncher: async () => false,
  openLauncherSettings: async () => false,
  goHome: async () => false,
  getProcessStartAgeMs: async () => -1,
  uninstallApp: async () => false,
  clearIconCache: async () => 0,
  getIconCacheSizeBytes: async () => 0,
  getWifiInfo: async () => ({ enabled: false, ssid: '', rssi: 0, linkSpeed: 0, ip: '' }),
  setWifiEnabled: async () => false,
  isLocationEnabled: async () => true,
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
  wakeScreen: async () => { /* stub: app-dimmed wake is best-effort / no-op off-Android */ },
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
  getInstalledKeyboards: async () => [],
  getRingtone: async () => '',
  canWriteSystemSettings: async () => false,
  openWriteSettingsAccess: async () => false,
  setRingtone: async () => false,
  startSpeechRecognition: async () => false,
  stopSpeechRecognition: async () => false,
  isSpeechRecognitionAvailable: async () => false,
  setProtectedApps: async () => false,
  isForegroundMonitorEnabled: async () => false,
  openAccessibilitySettings: async () => false,
  getCalendarEvents: async () => [],
  getNowPlaying: async () => ({ title: '', artist: '', album: '', isPlaying: false, packageName: '' }),
  mediaPrev: async () => false,
  mediaPlayPause: async () => false,
  mediaNext: async () => false,
  isUsageAccessGranted: async () => false,
  openUsageAccessSettings: async () => false,
  getScreenTimeStats: async () => [],
  getTodayScreenTime: async () => ({ totalMinutes: 0, topApps: [] }),
  postLiveActivity: async () => false,
  cancelLiveActivity: async () => false,
  startTapDetection: async () => false,
  stopTapDetection: async () => false,
  isTapDetectionRunning: async () => false,
};

/**
 * Collapses a launcher list to one entry per packageName, keeping the first.
 *
 * Both getInstalledApps and getAppStorageStats are built from PackageManager's
 * queryIntentActivities, which yields one entry per launcher activity rather
 * than per package — an app registering several (Google also registers "Voice
 * Search") arrives as repeated packageNames. Consumers key React lists by
 * packageName and StorageScreen sums totalBytes per entry, so duplicates both
 * collide as keys and inflate the Apps storage total.
 *
 * The native side dedupes at the source too; this keeps existing installs
 * correct when the JS bundle updates ahead of the native binary.
 */
// `InstalledApp.category` é declarado obrigatório, e uma declaração de tipo não
// é uma garantia: o valor vem da ponte nativa. Falta em dois casos reais — um
// dispositivo em API 24/25, onde o campo `ApplicationInfo.category` não existe, e
// um APK com uma versão anterior deste módulo nativo instalada. Nesses casos o
// consumidor recebia `undefined` num campo tipado como `string`, e o TypeScript
// não avisa porque a fronteira nativa é `any`.
//
// Normaliza a AUSÊNCIA, não o valor: qualquer string que o nativo mande passa
// intacta, incluindo categorias novas de APIs futuras. Coagir strings
// desconhecidas para 'undefined' esconderia exactamente a informação nova.
function withCategory<T extends { category?: unknown }>(items: T[]): T[] {
  if (!Array.isArray(items)) return items;
  return items.map((item) =>
    item && typeof item === 'object' && typeof (item as { category?: unknown }).category !== 'string'
      ? { ...item, category: 'undefined' }
      : item,
  );
}

function dedupeByPackageName<T extends { packageName?: string }>(items: T[]): T[] {
  // A malformed payload is passed through untouched rather than coerced, so a
  // native contract break stays visible to the caller instead of becoming [].
  if (!Array.isArray(items)) return items;

  const seen = new Set<string>();
  return items.filter((item) => {
    const packageName = item?.packageName;
    // An entry without a usable packageName is malformed native data, not a
    // duplicate: collapsing those together would silently drop real apps.
    if (typeof packageName !== 'string' || packageName === '') return true;
    if (seen.has(packageName)) return false;
    seen.add(packageName);
    return true;
  });
}

/**
 * True when a rejected bridge call is the Android 12+ BLUETOOTH_CONNECT
 * SecurityException (issue #675). The native rejection arrives over RN as an
 * Error whose message embeds the Java cause, e.g.
 *   "Call to function 'LauncherModule.getBluetoothInfo' has been rejected.
 *    → Caused by: java.lang.SecurityException: Need android.permission.BLUETOOTH_CONNECT ..."
 * We match on the runtime permission name rather than the exact method, so the
 * same guard covers getBluetoothInfo / getDiscoveredBluetoothDevices / etc. if
 * any of them ever rejects with the same permission error. A genuine failure
 * (no adapter, a different exception) is NOT a permission error and must still
 * be reported.
 */
export function isBluetoothPermissionSecurityException(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return /BLUETOOTH_CONNECT/.test(message) && /SecurityException/.test(message);
}

function createBridgedModule(): LauncherModuleType {
  if (!nativeModule) return stub;

  return {
    getInstalledApps: async (mask?: IconMask, treatment?: string) => {
      try { return dedupeByPackageName<InstalledApp>(withCategory(await nativeModule.getInstalledApps(mask ?? null, treatment ?? null))); }
      catch (e) { console.error('LauncherModule.getInstalledApps failed:', e); reportBridgeError('getInstalledApps', e); return []; }
    },
    launchApp: async (packageName: string) => {
      try {
        const ok = await nativeModule.launchApp(packageName);
        // A false result is a rejection (malformed / not installed / not
        // launchable), not an exception — surface it so the UI can react.
        if (!ok) {
          reportBridgeError('launchApp', new Error(`Could not launch app: ${packageName}`));
        }
        return ok;
      } catch (e) { console.error('LauncherModule.launchApp failed:', e); reportBridgeError('launchApp', e); return false; }
    },
    getAppIcon: async (packageName: string, mask?: IconMask) => {
      try { return await nativeModule.getAppIcon(packageName, mask ?? null); }
      catch (e) { console.error('LauncherModule.getAppIcon failed:', e); reportBridgeError('getAppIcon', e); return ''; }
    },
    getAppInfo: async (packageName: string, mask?: IconMask, treatment?: string) => {
      try { return await nativeModule.getAppInfo(packageName, mask ?? null, treatment ?? null); }
      catch (e) { console.error('LauncherModule.getAppInfo failed:', e); reportBridgeError('getAppInfo', e); return null; }
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
    clearIconCache: async () => {
      try { return await nativeModule.clearIconCache(); }
      catch (e) { console.error('LauncherModule.clearIconCache failed:', e); reportBridgeError('clearIconCache', e); return 0; }
    },
    getIconCacheSizeBytes: async () => {
      try { return await nativeModule.getIconCacheSizeBytes(); }
      catch (e) { console.error('LauncherModule.getIconCacheSizeBytes failed:', e); reportBridgeError('getIconCacheSizeBytes', e); return 0; }
    },
    getWifiInfo: async () => {
      try { return await nativeModule.getWifiInfo(); }
      catch (e) { console.error('LauncherModule.getWifiInfo failed:', e); reportBridgeError('getWifiInfo', e); return null; }
    },
    setWifiEnabled: async (enabled: boolean) => {
      try { return await nativeModule.setWifiEnabled(enabled); }
      catch (e) { console.error('LauncherModule.setWifiEnabled failed:', e); reportBridgeError('setWifiEnabled', e); return false; }
    },
    isLocationEnabled: async () => {
      try { return await nativeModule.isLocationEnabled(); }
      catch (e) { console.error('LauncherModule.isLocationEnabled failed:', e); reportBridgeError('isLocationEnabled', e); return true; }
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
      catch (e) {
        // #675: on Android 12+ (API 31) reading the adapter name/address without
        // the BLUETOOTH_CONNECT runtime permission throws a SecurityException
        // over the bridge. That is an expected, recoverable state (the UI already
        // falls back to "Unknown"/"" when the call returns null) — surfacing it as
        // a reportBridgeError would paint a LogBox toast on every launch. Swallow
        // that one permission error silently; any other failure is still reported.
        if (!isBluetoothPermissionSecurityException(e)) {
          console.error('LauncherModule.getBluetoothInfo failed:', e);
          reportBridgeError('getBluetoothInfo', e);
        }
        return null;
      }
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
    getProcessStartAgeMs: async () => {
      try {
        const age = await nativeModule.getProcessStartAgeMs();
        return typeof age === 'number' ? age : -1;
      } catch (e) { reportBridgeError('getProcessStartAgeMs', e); return -1; }
    },
    getStorageInfo: async () => {
      try { return await nativeModule.getStorageInfo(); }
      catch (e) { console.error('LauncherModule.getStorageInfo failed:', e); reportBridgeError('getStorageInfo', e); return null; }
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
      catch (e) { console.error('LauncherModule.getNetworkInfo failed:', e); reportBridgeError('getNetworkInfo', e); return null; }
    },
    getCarrierInfo: async () => {
      try { return await nativeModule.getCarrierInfo(); }
      catch (e) { console.error('LauncherModule.getCarrierInfo failed:', e); reportBridgeError('getCarrierInfo', e); return { carrierName: '', networkType: 'Unknown', signalStrength: 0, isRoaming: false, phoneNumber: '', simOperator: '' }; }
    },
    getAppStorageStats: async () => {
      try { return dedupeByPackageName<AppStorageStat>(await nativeModule.getAppStorageStats()); }
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
    wakeScreen: async () => {
      try { await nativeModule.wakeScreen(); }
      catch (e) { console.error('LauncherModule.wakeScreen failed:', e); reportBridgeError('wakeScreen', e); }
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
    getInstalledKeyboards: async () => {
      try { return await nativeModule.getInstalledKeyboards(); }
      catch (e) { console.error('LauncherModule.getInstalledKeyboards failed:', e); reportBridgeError('getInstalledKeyboards', e); return []; }
    },
    getRingtone: async () => {
      try { return await nativeModule.getRingtone(); }
      catch (e) { console.error('LauncherModule.getRingtone failed:', e); reportBridgeError('getRingtone', e); return ''; }
    },
    canWriteSystemSettings: async () => {
      try { return await nativeModule.canWriteSystemSettings(); }
      catch (e) { console.error('LauncherModule.canWriteSystemSettings failed:', e); reportBridgeError('canWriteSystemSettings', e); return false; }
    },
    openWriteSettingsAccess: async () => {
      try { return await nativeModule.openWriteSettingsAccess(); }
      catch (e) { console.error('LauncherModule.openWriteSettingsAccess failed:', e); reportBridgeError('openWriteSettingsAccess', e); return false; }
    },
    setRingtone: async (uri: string) => {
      try { return await nativeModule.setRingtone(uri); }
      catch (e) { console.error('LauncherModule.setRingtone failed:', e); reportBridgeError('setRingtone', e); return false; }
    },
    startSpeechRecognition: async () => {
      try { return await nativeModule.startSpeechRecognition(); }
      catch (e) { console.error('LauncherModule.startSpeechRecognition failed:', e); reportBridgeError('startSpeechRecognition', e); return false; }
    },
    stopSpeechRecognition: async () => {
      try { return await nativeModule.stopSpeechRecognition(); }
      catch (e) { console.error('LauncherModule.stopSpeechRecognition failed:', e); reportBridgeError('stopSpeechRecognition', e); return false; }
    },
    isSpeechRecognitionAvailable: async () => {
      try { return await nativeModule.isSpeechRecognitionAvailable(); }
      catch (e) { console.error('LauncherModule.isSpeechRecognitionAvailable failed:', e); reportBridgeError('isSpeechRecognitionAvailable', e); return false; }
    },
    // #627 child issue: push the protected set to the foreground monitor.
    // Accepts null/undefined from a careless caller → normalize to [] so the
    // service never receives a malformed payload; a null set is "nothing
    // protected", not a rejected promise.
    setProtectedApps: async (packageNames: string[]) => {
      const list = Array.isArray(packageNames) ? packageNames : [];
      try { return await nativeModule.setProtectedApps(list); }
      catch (e) { console.error('LauncherModule.setProtectedApps failed:', e); reportBridgeError('setProtectedApps', e); return false; }
    },
    isForegroundMonitorEnabled: async () => {
      try { return await nativeModule.isForegroundMonitorEnabled(); }
      catch (e) { console.error('LauncherModule.isForegroundMonitorEnabled failed:', e); reportBridgeError('isForegroundMonitorEnabled', e); return false; }
    },
    openAccessibilitySettings: async () => {
      try { return await nativeModule.openAccessibilitySettings(); }
      catch (e) { console.error('LauncherModule.openAccessibilitySettings failed:', e); reportBridgeError('openAccessibilitySettings', e); return false; }
    },
    postLiveActivity: async (id: string, title: string, text: string, progress: number, maxProgress: number) => {
      try {
        const { percent, indeterminate } = clampLiveActivityProgress(progress, maxProgress);
        return await nativeModule.postLiveActivity(id, title, text, percent, indeterminate);
      } catch (e) { console.error('LauncherModule.postLiveActivity failed:', e); reportBridgeError('postLiveActivity', e); return false; }
    },
    cancelLiveActivity: async (id: string) => {
      try { return await nativeModule.cancelLiveActivity(id); }
      catch (e) { console.error('LauncherModule.cancelLiveActivity failed:', e); reportBridgeError('cancelLiveActivity', e); return false; }
    },
    startTapDetection: async () => {
      try { return await nativeModule.startTapDetection(); }
      catch (e) { console.error('LauncherModule.startTapDetection failed:', e); reportBridgeError('startTapDetection', e); return false; }
    },
    stopTapDetection: async () => {
      try { return await nativeModule.stopTapDetection(); }
      catch (e) { console.error('LauncherModule.stopTapDetection failed:', e); reportBridgeError('stopTapDetection', e); return false; }
    },
    isTapDetectionRunning: async () => {
      try { return await nativeModule.isTapDetectionRunning(); }
      catch (e) { console.error('LauncherModule.isTapDetectionRunning failed:', e); reportBridgeError('isTapDetectionRunning', e); return false; }
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

// Generic rather than `any`: each caller already knows the shape the native side
// emits for its event, and stating it here propagates that type to the handler
// instead of erasing it at the boundary.
function addModuleListener<TPayload>(
  eventName: string,
  handler: (payload: TPayload) => void,
): Subscription {
  if (!nativeModule || typeof nativeModule.addListener !== 'function') {
    return { remove: () => {} };
  }
  const sub: Subscription = nativeModule.addListener(eventName, handler);
  return sub;
}

/**
 * Subscribe to new notifications as they arrive.
 * The native event (a Bundle sent from NotificationService) may be partial —
 * older builds only carried `id`/`packageName`/`title`/`text`/`postedAt`, and
 * even now we normalize defensively — so this bridge turns it into a full
 * `DeviceNotification`: `key` falls back to `id`, `time` falls back to
 * `postedAt`, and `isOngoing` defaults to `false`. A never-`undefined` object
 * keeps the screen's grouping/mapping (which keys by `packageName`/`key`) safe
 * instead of throwing and blanking the whole center.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addNotificationListener(
  listener: (n: DeviceNotification) => void,
): () => void {
  const sub = addModuleListener('onNotificationPosted', (raw: Partial<DeviceNotification> & { postedAt?: number }) => {
    const norm: DeviceNotification = {
      id: raw.id ?? '',
      key: raw.key ?? raw.id ?? '',
      packageName: raw.packageName ?? '',
      title: raw.title ?? '',
      text: raw.text ?? '',
      time: typeof raw.time === 'number' ? raw.time : (raw.postedAt ?? 0),
      isOngoing: raw.isOngoing ?? false,
    };
    listener(norm);
  });
  return () => sub.remove();
}

/**
 * Subscribe to notification removals.
 * The callback receives the notification **key** (string id) — matching the
 * `key` the screen uses to key and remove rows. The native `onNotificationRemoved`
 * event historically carried `id` but not `key`, so we prefer `key` and fall
 * back to `id` only when `key` is absent.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addNotificationRemovedListener(
  listener: (key: string) => void,
): () => void {
  const sub = addModuleListener('onNotificationRemoved', (n: { id?: string; key?: string }) => {
    listener(n.key ?? n.id ?? '');
  });
  return () => sub.remove();
}

/**
 * Subscribe to Android re-delivering the HOME intent (onNewIntent, fired only
 * for CATEGORY_HOME — see MainActivity's override injected by
 * plugins/withLauncherIntent.js) while the launcher is already in the
 * foreground.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addHomePressedListener(listener: () => void): () => void {
  const sub = addModuleListener('onHomePressed', listener);
  return () => sub.remove();
}

/**
 * Subscribe to speech-to-text results as they are recognized.
 * The callback receives the recognized text (string). Partial results arrive
 * via onSpeechPartialResult; the final result via onSpeechResult.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addSpeechResultListener(
  listener: (text: string) => void,
): () => void {
  const sub = addModuleListener('onSpeechResult', (n: { text: string }) => {
    listener(n.text);
  });
  return () => sub.remove();
}

/**
 * Subscribe to partial (in-flight) speech-to-text results.
 * Fires repeatedly while the user is still speaking so callers can render a
 * live transcript before the recognizer commits with onSpeechResult.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addSpeechPartialResultListener(
  listener: (text: string) => void,
): () => void {
  const sub = addModuleListener('onSpeechPartialResult', (n: { text: string }) => {
    listener(n.text);
  });
  return () => sub.remove();
}

/**
 * Subscribe to speech-recognition errors emitted by the native recognizer.
 * The callback receives the error message (string).
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addSpeechErrorListener(
  listener: (error: string) => void,
): () => void {
  const sub = addModuleListener('onSpeechError', (n: { error: string }) => {
    listener(n.error);
  });
  return () => sub.remove();
}

export type PackageChangeAction = 'added' | 'removed' | 'replaced';

export interface PackageChange {
  action: PackageChangeAction;
  packageName: string;
}

/**
 * Emitted by the native back-tap sensor service (#636) when the user double- or
 * triple-taps the back of the device (iOS 14+ Back Tap equivalent).
 * `taps` are the raw impulse timestamps (ms) that formed the gesture; `count`
 * is 2 or 3. Surfaced to JS via the `addBackTapListener` subscription.
 */
export interface BackTapEvent {
  type: 'double' | 'triple';
  count: number;
  taps: number[];
}

/**
 * Subscribe to apps being installed, uninstalled or updated on the device.
 * Backed by a dynamically registered BroadcastReceiver on the Kotlin side
 * (PackageChangeReceiver) — implicit package broadcasts are not delivered to
 * manifest-declared receivers since API 26, so the registration lives in the
 * module's OnCreate/OnDestroy.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addPackageChangedListener(
  listener: (change: PackageChange) => void,
): () => void {
  const sub = addModuleListener<PackageChange>('onPackageChanged', listener);  return () => sub.remove();
}

/**
 * Subscribe to double/triple "back tap" gestures detected by the native
 * TapSensorService (#636). The callback receives a [BackTapEvent] describing
 * the gesture (`type` is 'double' | 'triple', `count` is 2 or 3).
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addBackTapListener(
  listener: (event: BackTapEvent) => void,
): () => void {
  const sub = addModuleListener<BackTapEvent>('onBackTap', listener);
  return () => sub.remove();
}

/**
 * Subscribe to foreground-app changes reported by ForegroundMonitorService
 * (#627 child issue). The callback receives the package name that just moved
 * to the foreground, or '' for HOME / no app. The launcher uses this to keep
 * its own UI in sync and to know when the native BiometricPrompt gate fired.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function addForegroundAppListener(
  listener: (packageName: string) => void,
): () => void {
  const sub = addModuleListener<{ packageName: string }>('onForegroundAppChanged', (n: { packageName: string }) => {
    listener(n.packageName);
  });
  return () => sub.remove();
}
