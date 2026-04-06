import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

interface InstalledApp {
  name: string;
  packageName: string;
  icon: string; // base64 data URI
  isSystem: boolean;
}

interface LauncherModuleType {
  getInstalledApps(): Promise<InstalledApp[]>;
  launchApp(packageName: string): Promise<boolean>;
  getAppIcon(packageName: string): Promise<string>;
  isDefaultLauncher(): Promise<boolean>;
  openLauncherSettings(): Promise<boolean>;
}

const isAndroid = Platform.OS === 'android';

// Stub for non-Android platforms
const stub: LauncherModuleType = {
  getInstalledApps: async () => [],
  launchApp: async () => false,
  getAppIcon: async () => '',
  isDefaultLauncher: async () => false,
  openLauncherSettings: async () => false,
};

const LauncherModule: LauncherModuleType = isAndroid
  ? requireNativeModule('LauncherModule')
  : stub;

export { InstalledApp, LauncherModuleType };
export default LauncherModule;
