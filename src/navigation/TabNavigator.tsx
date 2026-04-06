import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Launcher
import { LauncherHomeScreen } from '../screens/LauncherHomeScreen';
import { MultitaskScreen } from '../screens/MultitaskScreen';
import { AppDrawerScreen } from '../screens/AppDrawerScreen';
import { LockScreen } from '../screens/LockScreen';
import { ControlCenterScreen } from '../screens/ControlCenterScreen';

// Built-in "apps" (opened from dock/grid, not tabs)
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
import { ComponentsGalleryScreen } from '../screens/ComponentsGalleryScreen';
import { AppLibraryScreen } from '../screens/AppLibraryScreen';
import { TodayViewScreen } from '../screens/TodayViewScreen';

const Stack = createNativeStackNavigator();

export function TabNavigator() {
  return (
    <Stack.Navigator screenOptions={{
      headerShown: false,
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      animation: 'slide_from_right',
    }}>
      {/* Launcher home — the ROOT screen, fullscreen, no tabs */}
      <Stack.Screen name="HomeMain" component={LauncherHomeScreen} />
      <Stack.Screen name="AppDrawer" component={AppDrawerScreen} />
      <Stack.Screen name="LockScreen" component={LockScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="ControlCenter" component={ControlCenterScreen} options={{ animation: 'fade', presentation: 'transparentModal', gestureEnabled: false }} />
      <Stack.Screen name="Multitask" component={MultitaskScreen} options={{ animation: 'fade', presentation: 'transparentModal' }} />

      {/* Built-in apps — opened from dock/grid, slide in like real iOS apps */}
      <Stack.Screen name="Phone" component={PhoneScreen} />
      <Stack.Screen name="CallScreen" component={CallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="Messages" component={MessagesScreen} />
      <Stack.Screen name="Conversation" component={ConversationScreen} />
      <Stack.Screen name="Contacts" component={ContactsScreen} />
      <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
      <Stack.Screen name="ContactEdit" component={ContactEditScreen} />

      {/* Settings app — opened from grid */}
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="WiFi" component={WifiScreen} />
      <Stack.Screen name="Bluetooth" component={BluetoothScreen} />
      <Stack.Screen name="Cellular" component={CellularScreen} />
      <Stack.Screen name="Hotspot" component={HotspotScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="SoundsHaptics" component={SoundsHapticsScreen} />
      <Stack.Screen name="Focus" component={FocusScreen} />
      <Stack.Screen name="ScreenTime" component={ScreenTimeScreen} />
      <Stack.Screen name="General" component={GeneralScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="DisplayBrightness" component={DisplayBrightnessScreen} />
      <Stack.Screen name="Wallpaper" component={WallpaperScreen} />
      <Stack.Screen name="Accessibility" component={AccessibilityScreen} />
      <Stack.Screen name="Battery" component={BatteryScreen} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} />
      <Stack.Screen name="Storage" component={StorageScreen} />
      <Stack.Screen name="SoftwareUpdate" component={SoftwareUpdateScreen} />
      <Stack.Screen name="DateTime" component={DateTimeScreen} />
      <Stack.Screen name="Keyboard" component={KeyboardScreen} />
      <Stack.Screen name="LanguageRegion" component={LanguageRegionScreen} />
      <Stack.Screen name="Vpn" component={VpnScreen} />
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="ComponentsGallery" component={ComponentsGalleryScreen} />
      <Stack.Screen name="AppLibrary" component={AppLibraryScreen} />
      <Stack.Screen name="TodayView" component={TodayViewScreen} options={{ animation: 'slide_from_left' }} />
    </Stack.Navigator>
  );
}
