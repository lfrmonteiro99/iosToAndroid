import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
import { TodayViewScreen } from '../screens/TodayViewScreen';
import { NotificationCenterScreen } from '../screens/NotificationCenterScreen';
import { LauncherSettingsScreen } from '../screens/LauncherSettingsScreen';

const Stack = createNativeStackNavigator();

export function TabNavigator() {
  return (
    <Stack.Navigator screenOptions={{
      headerShown: false,
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      animation: 'fade_from_bottom',
      animationDuration: 250,
    }}>
      {/* Launcher home — the ROOT screen, fullscreen, no tabs */}
      <Stack.Screen name="HomeMain" component={LauncherHomeScreen} />
      {/* App Drawer removed — iOS doesn't have one. All apps are on home pages. App Library is the last page. */}
      <Stack.Screen name="LockScreen" component={LockScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="ControlCenter" component={ControlCenterScreen} options={{ animation: 'fade', presentation: 'transparentModal', gestureEnabled: false }} />
      <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} options={{ animation: 'fade', presentation: 'transparentModal' }} />
      <Stack.Screen name="Multitask" component={MultitaskScreen} options={{ animation: 'fade', presentation: 'transparentModal' }} />

      {/* Built-in apps — zoom up like iOS app launch */}
      <Stack.Screen name="Calculator" component={CalculatorScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="Phone" component={PhoneScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="CallScreen" component={CallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="Conversation" component={ConversationScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="Contacts" component={ContactsScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="ContactDetail" component={ContactDetailScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="ContactEdit" component={ContactEditScreen} options={{ animation: 'fade_from_bottom' }} />

      {/* Settings app — zoom up on entry, push for sub-screens like iOS */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'fade_from_bottom' }} />
      <Stack.Screen name="WiFi" component={WifiScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Bluetooth" component={BluetoothScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Cellular" component={CellularScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Hotspot" component={HotspotScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SoundsHaptics" component={SoundsHapticsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Focus" component={FocusScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ScreenTime" component={ScreenTimeScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="General" component={GeneralScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="About" component={AboutScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="DisplayBrightness" component={DisplayBrightnessScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Wallpaper" component={WallpaperScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Accessibility" component={AccessibilityScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Battery" component={BatteryScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Storage" component={StorageScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="SoftwareUpdate" component={SoftwareUpdateScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="DateTime" component={DateTimeScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Keyboard" component={KeyboardScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="LanguageRegion" component={LanguageRegionScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="Vpn" component={VpnScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="ProfileMain" component={ProfileScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ animation: 'slide_from_right' }} />
      {__DEV__ && <Stack.Screen name="ComponentsGallery" component={ComponentsGalleryScreen} options={{ animation: 'slide_from_right' }} />}
      <Stack.Screen name="AppLibrary" component={AppLibraryScreen} />
      <Stack.Screen name="TodayView" component={TodayViewScreen} options={{ animation: 'slide_from_left' }} />
      <Stack.Screen name="LauncherSettings" component={LauncherSettingsScreen} options={{ animation: 'slide_from_right' }} />
    </Stack.Navigator>
  );
}
