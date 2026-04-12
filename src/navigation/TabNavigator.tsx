import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSettings } from '../store/SettingsStore';
import type { RootStackParamList } from './types';

// Launcher
import { LauncherHomeScreen } from '../screens/LauncherHomeScreen';
import { MultitaskScreen } from '../screens/MultitaskScreen';

import { LockScreen } from '../screens/LockScreen';
import { ControlCenterScreen } from '../screens/ControlCenterScreen';

// Built-in "apps" (opened from dock/grid, not tabs)
import { CalculatorScreen } from '../screens/CalculatorScreen';
import { PhoneScreen } from '../screens/PhoneScreen';
import { CallScreen } from '../screens/CallScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { ContactDetailScreen } from '../screens/contacts/ContactDetailScreen';
import { ContactEditScreen } from '../screens/contacts/ContactEditScreen';

// Settings (opened from grid like a real app)
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { EditProfileScreen } from '../screens/profile/EditProfileScreen';
import { WifiScreen } from '../screens/settings/WifiScreen';
import { GeneralScreen } from '../screens/settings/GeneralScreen';
import { AboutScreen } from '../screens/settings/AboutScreen';
import { DisplayBrightnessScreen } from '../screens/settings/DisplayBrightnessScreen';
import { BluetoothScreen } from '../screens/settings/BluetoothScreen';
import { CellularScreen } from '../screens/settings/CellularScreen';
import { HotspotScreen } from '../screens/settings/HotspotScreen';
import { NotificationsScreen } from '../screens/settings/NotificationsScreen';
import { SoundsHapticsScreen } from '../screens/settings/SoundsHapticsScreen';
import { FocusScreen } from '../screens/settings/FocusScreen';
import { ScreenTimeScreen } from '../screens/settings/ScreenTimeScreen';
import { StorageScreen } from '../screens/settings/StorageScreen';
import { SoftwareUpdateScreen } from '../screens/settings/SoftwareUpdateScreen';
import { DateTimeScreen } from '../screens/settings/DateTimeScreen';
import { KeyboardScreen } from '../screens/settings/KeyboardScreen';
import { LanguageRegionScreen } from '../screens/settings/LanguageRegionScreen';
import { VpnScreen } from '../screens/settings/VpnScreen';
import { BatteryScreen } from '../screens/settings/BatteryScreen';
import { PrivacyScreen } from '../screens/settings/PrivacyScreen';
import { WallpaperScreen } from '../screens/settings/WallpaperScreen';
import { AccessibilityScreen } from '../screens/settings/AccessibilityScreen';
import { BackupRestoreScreen } from '../screens/settings/BackupRestoreScreen';
import { ComponentsGalleryScreen } from '../screens/ComponentsGalleryScreen';
import { AppLibraryScreen } from '../screens/AppLibraryScreen';
import { SpotlightSearchScreen } from '../screens/SpotlightSearchScreen';
import { TodayViewScreen } from '../screens/TodayViewScreen';
import { NotificationCenterScreen } from '../screens/NotificationCenterScreen';
import { LauncherSettingsScreen } from '../screens/LauncherSettingsScreen';
import { WeatherScreen } from '../screens/WeatherScreen';
import { ClockScreen } from '../screens/ClockScreen';
import { CameraScreen } from '../screens/CameraScreen';
import { PhotosScreen } from '../screens/PhotosScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { NotesScreen } from '../screens/NotesScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function TabNavigator() {
  const { settings } = useSettings();
  const animation = settings.reduceMotion ? 'none' as const : 'fade_from_bottom' as const;
  const slideAnimation = settings.reduceMotion ? 'none' as const : 'slide_from_right' as const;
  const fadeAnimation = settings.reduceMotion ? 'none' as const : 'fade' as const;

  return (
    <Stack.Navigator screenOptions={{
      headerShown: false,
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      animation,
      animationDuration: settings.reduceMotion ? 0 : 250,
    }}>
      {/* Launcher home — the ROOT screen, fullscreen, no tabs */}
      <Stack.Screen name="HomeMain" component={LauncherHomeScreen} />
      {/* App Drawer removed — iOS doesn't have one. All apps are on home pages. App Library is the last page. */}
      <Stack.Screen name="LockScreen" component={LockScreen} options={{ animation: fadeAnimation, gestureEnabled: false }} />
      <Stack.Screen name="ControlCenter" component={ControlCenterScreen} options={{ animation: fadeAnimation, presentation: 'transparentModal', gestureEnabled: false }} />
      <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} options={{ animation: fadeAnimation, presentation: 'transparentModal' }} />
      <Stack.Screen name="Multitask" component={MultitaskScreen} options={{ animation: fadeAnimation, presentation: 'transparentModal' }} />

      {/* Built-in apps — zoom up like iOS app launch */}
      <Stack.Screen name="Calculator" component={CalculatorScreen} options={{ animation }} />
      <Stack.Screen name="Phone" component={PhoneScreen} options={{ animation }} />
      <Stack.Screen name="CallScreen" component={CallScreen} options={{ animation: fadeAnimation, gestureEnabled: false }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ animation }} />
      <Stack.Screen name="Conversation" component={ConversationScreen} options={{ animation }} />
      <Stack.Screen name="Contacts" component={ContactsScreen} options={{ animation }} />
      <Stack.Screen name="ContactDetail" component={ContactDetailScreen} options={{ animation }} />
      <Stack.Screen name="ContactEdit" component={ContactEditScreen} options={{ animation }} />
      <Stack.Screen name="Weather" component={WeatherScreen} options={{ animation }} />
      <Stack.Screen name="Clock" component={ClockScreen} options={{ animation }} />
      <Stack.Screen name="Camera" component={CameraScreen} options={{ animation, gestureEnabled: false }} />
      <Stack.Screen name="Photos" component={PhotosScreen} options={{ animation }} />
      <Stack.Screen name="Calendar" component={CalendarScreen} options={{ animation }} />
      <Stack.Screen name="Notes" component={NotesScreen} options={{ animation }} />

      {/* Settings app — zoom up on entry, push for sub-screens like iOS */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation }} />
      <Stack.Screen name="WiFi" component={WifiScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Bluetooth" component={BluetoothScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Cellular" component={CellularScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Hotspot" component={HotspotScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="SoundsHaptics" component={SoundsHapticsScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Focus" component={FocusScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="ScreenTime" component={ScreenTimeScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="General" component={GeneralScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="DisplayBrightness" component={DisplayBrightnessScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Wallpaper" component={WallpaperScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Accessibility" component={AccessibilityScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Battery" component={BatteryScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Storage" component={StorageScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="SoftwareUpdate" component={SoftwareUpdateScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="DateTime" component={DateTimeScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Keyboard" component={KeyboardScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="LanguageRegion" component={LanguageRegionScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="Vpn" component={VpnScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ animation: slideAnimation }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ animation: slideAnimation }} />
      {__DEV__ && <Stack.Screen name="ComponentsGallery" component={ComponentsGalleryScreen} options={{ animation: slideAnimation }} />}
      <Stack.Screen name="AppLibrary" component={AppLibraryScreen} />
      <Stack.Screen name="SpotlightSearch" component={SpotlightSearchScreen} options={{ animation: fadeAnimation, presentation: 'transparentModal' }} />
      <Stack.Screen name="TodayView" component={TodayViewScreen} options={{ animation: settings.reduceMotion ? 'none' : 'slide_from_left' }} />
      <Stack.Screen name="LauncherSettings" component={LauncherSettingsScreen} options={{ animation: slideAnimation }} />
    </Stack.Navigator>
  );
}
