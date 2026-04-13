import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type RootStackParamList = {
  // Launcher
  HomeMain: undefined;
  LockScreen: undefined;
  ControlCenter: undefined;
  NotificationCenter: undefined;
  Multitask: undefined;

  // Built-in apps
  Calculator: undefined;
  Phone: undefined;
  CallScreen: { name: string; number: string };
  Messages: undefined;
  Conversation: { address: string };
  Contacts: undefined;
  ContactDetail: { contactId: string };
  ContactEdit: { contactId?: string };
  Weather: undefined;
  Clock: undefined;
  Camera: undefined;
  Photos: undefined;
  Calendar: undefined;
  Notes: undefined;
  Maps: undefined;
  Reminders: undefined;
  Mail: { composeTo?: string; composeSubject?: string; composeBody?: string } | undefined;

  // Settings
  Settings: undefined;
  WiFi: undefined;
  Bluetooth: undefined;
  Cellular: undefined;
  Hotspot: undefined;
  Notifications: undefined;
  SoundsHaptics: undefined;
  Focus: undefined;
  ScreenTime: undefined;
  General: undefined;
  About: undefined;
  DisplayBrightness: undefined;
  Wallpaper: undefined;
  Accessibility: undefined;
  Battery: undefined;
  Privacy: undefined;
  Storage: undefined;
  SoftwareUpdate: undefined;
  DateTime: undefined;
  Keyboard: undefined;
  LanguageRegion: undefined;
  Vpn: undefined;
  BackupRestore: undefined;
  ProfileMain: undefined;
  EditProfile: undefined;
  ComponentsGallery: undefined;
  AppLibrary: undefined;
  SpotlightSearch: undefined;
  TodayView: undefined;
  LauncherSettings: undefined;
};

export type AppNavigationProp = NativeStackNavigationProp<RootStackParamList>;

export type AppRouteProp<T extends keyof RootStackParamList> = RouteProp<RootStackParamList, T>;
