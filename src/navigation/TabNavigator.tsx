import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LauncherHomeScreen } from '../screens/LauncherHomeScreen';
import { AppDrawerScreen } from '../screens/AppDrawerScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LockScreen } from '../screens/LockScreen';
import { ControlCenterScreen } from '../screens/ControlCenterScreen';
import { MessagesScreen } from '../screens/MessagesScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { PhoneScreen } from '../screens/PhoneScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { ContactDetailScreen } from '../screens/contacts/ContactDetailScreen';
import { ContactEditScreen } from '../screens/contacts/ContactEditScreen';
import { ComponentsGalleryScreen } from '../screens/ComponentsGalleryScreen';
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
import { CupertinoTabBar } from '../components';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const PhoneStack = createNativeStackNavigator();
const MessagesStack = createNativeStackNavigator();
const ContactsStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={LauncherHomeScreen} />
      <HomeStack.Screen name="AppDrawer" component={AppDrawerScreen} />
      <HomeStack.Screen name="Dashboard" component={HomeScreen} />
      <HomeStack.Screen name="LockScreen" component={LockScreen} options={{ animation: 'fade' }} />
      <HomeStack.Screen name="ControlCenter" component={ControlCenterScreen} options={{ animation: 'fade', presentation: 'transparentModal' }} />
    </HomeStack.Navigator>
  );
}

function PhoneStackScreen() {
  return (
    <PhoneStack.Navigator screenOptions={{ headerShown: false }}>
      <PhoneStack.Screen name="PhoneMain" component={PhoneScreen} />
    </PhoneStack.Navigator>
  );
}

function MessagesStackScreen() {
  return (
    <MessagesStack.Navigator screenOptions={{ headerShown: false }}>
      <MessagesStack.Screen name="MessagesMain" component={MessagesScreen} />
      <MessagesStack.Screen name="Conversation" component={ConversationScreen} />
    </MessagesStack.Navigator>
  );
}

function ContactsStackScreen() {
  return (
    <ContactsStack.Navigator screenOptions={{ headerShown: false }}>
      <ContactsStack.Screen name="ContactsMain" component={ContactsScreen} />
      <ContactsStack.Screen name="ContactDetail" component={ContactDetailScreen} />
      <ContactsStack.Screen name="ContactEdit" component={ContactEditScreen} />
    </ContactsStack.Navigator>
  );
}

function SettingsStackScreen() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
      <SettingsStack.Screen name="WiFi" component={WifiScreen} />
      <SettingsStack.Screen name="Bluetooth" component={BluetoothScreen} />
      <SettingsStack.Screen name="Cellular" component={CellularScreen} />
      <SettingsStack.Screen name="Hotspot" component={HotspotScreen} />
      <SettingsStack.Screen name="Notifications" component={NotificationsScreen} />
      <SettingsStack.Screen name="SoundsHaptics" component={SoundsHapticsScreen} />
      <SettingsStack.Screen name="Focus" component={FocusScreen} />
      <SettingsStack.Screen name="ScreenTime" component={ScreenTimeScreen} />
      <SettingsStack.Screen name="General" component={GeneralScreen} />
      <SettingsStack.Screen name="About" component={AboutScreen} />
      <SettingsStack.Screen name="DisplayBrightness" component={DisplayBrightnessScreen} />
      <SettingsStack.Screen name="Wallpaper" component={WallpaperScreen} />
      <SettingsStack.Screen name="Accessibility" component={AccessibilityScreen} />
      <SettingsStack.Screen name="Battery" component={BatteryScreen} />
      <SettingsStack.Screen name="Privacy" component={PrivacyScreen} />
      <SettingsStack.Screen name="Storage" component={StorageScreen} />
      <SettingsStack.Screen name="SoftwareUpdate" component={SoftwareUpdateScreen} />
      <SettingsStack.Screen name="DateTime" component={DateTimeScreen} />
      <SettingsStack.Screen name="Keyboard" component={KeyboardScreen} />
      <SettingsStack.Screen name="LanguageRegion" component={LanguageRegionScreen} />
      <SettingsStack.Screen name="Vpn" component={VpnScreen} />
      <SettingsStack.Screen name="ProfileMain" component={ProfileScreen} />
      <SettingsStack.Screen name="EditProfile" component={EditProfileScreen} />
      <SettingsStack.Screen name="ComponentsGallery" component={ComponentsGalleryScreen} />
    </SettingsStack.Navigator>
  );
}

export function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CupertinoTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeStackScreen} />
      <Tab.Screen name="Phone" component={PhoneStackScreen} />
      <Tab.Screen name="Messages" component={MessagesStackScreen} />
      <Tab.Screen name="Contacts" component={ContactsStackScreen} />
      <Tab.Screen name="Settings" component={SettingsStackScreen} />
    </Tab.Navigator>
  );
}
