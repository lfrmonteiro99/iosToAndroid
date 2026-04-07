import React, { useState } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';
import { useApps } from '../store/AppsStore';
import { useFolders } from '../store/FoldersStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoButton,
} from '../components';

// Default dock package names — mirrors AppsStore constant
const DEFAULT_DOCK = [
  'com.iostoandroid.phone',
  'com.iostoandroid.messages',
  'com.iostoandroid.contacts',
  'com.iostoandroid.settings',
];

const DOCK_LABELS: Record<string, string> = {
  'com.iostoandroid.phone': 'Phone',
  'com.iostoandroid.messages': 'Messages',
  'com.iostoandroid.contacts': 'Contacts',
  'com.iostoandroid.settings': 'Settings',
};

export function LauncherSettingsScreen() {
  const navigation = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const themeCtx = useTheme();
  const { theme, typography, isDark, toggleTheme } = themeCtx;
  const { colors } = theme;
  const { settings, update, reset: resetSettings } = useSettings();
  const { dockApps } = useApps();
  const { folders, deleteFolder } = useFolders();

  // Local state for settings not yet in SettingsStore
  const [showLockScreen, setShowLockScreen] = useState(false);
  const [biometricUnlock, setBiometricUnlock] = useState(false);

  const handleResetDock = () => {
    Alert.alert('Reset Dock', 'Restore dock to Phone, Messages, Contacts, Settings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          AsyncStorage.getItem('@iostoandroid/apps_layout').then((raw) => {
            let homeApps: unknown[] = [];
            if (raw) {
              try { homeApps = JSON.parse(raw).homeApps || []; } catch { /* ignore */ }
            }
            AsyncStorage.setItem('@iostoandroid/apps_layout', JSON.stringify({
              dockApps: DEFAULT_DOCK,
              homeApps,
            }));
          });
          Alert.alert('Dock reset', 'Restart the app to apply changes.');
        },
      },
    ]);
  };

  const handleResetHomeLayout = () => {
    Alert.alert('Reset Home Layout', 'This will clear all app positions on the home screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          AsyncStorage.getItem('@iostoandroid/apps_layout').then((raw) => {
            let dockPkgs: unknown[] = DEFAULT_DOCK;
            if (raw) {
              try { dockPkgs = JSON.parse(raw).dockApps || DEFAULT_DOCK; } catch { /* ignore */ }
            }
            AsyncStorage.setItem('@iostoandroid/apps_layout', JSON.stringify({
              dockApps: dockPkgs,
              homeApps: [],
            }));
          });
          Alert.alert('Home layout reset', 'Restart the app to apply changes.');
        },
      },
    ]);
  };

  const handleResetFolders = () => {
    Alert.alert('Reset Folders', 'Delete all folders? Apps will remain on the home screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: () => {
          folders.forEach(f => deleteFolder(f.id));
        },
      },
    ]);
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset All Settings',
      'This will clear all launcher settings, layout, folders, and onboarding. The app will need to be restarted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            resetSettings();
            await Promise.all([
              AsyncStorage.removeItem('@iostoandroid/apps_layout'),
              AsyncStorage.removeItem('@iostoandroid/folders'),
              AsyncStorage.removeItem('@iostoandroid/onboarding_done'),
              AsyncStorage.removeItem('@iostoandroid/custom_wallpaper'),
            ]);
            Alert.alert('Reset complete', 'Please restart the app.');
          },
        },
      ],
    );
  };

  const handleRerunOnboarding = () => {
    Alert.alert('Re-run Onboarding', 'This will show the onboarding flow on next app start.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          await AsyncStorage.removeItem('@iostoandroid/onboarding_done');
          Alert.alert('Done', 'Restart the app to see onboarding.');
        },
      },
    ]);
  };

  const doneButton = (
    <Text
      style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}
      onPress={() => navigation.goBack()}
      accessibilityRole="button"
      accessibilityLabel="Done"
    >
      Done
    </Text>
  );

  return (
    <CupertinoNavigationBar
      title="Launcher Settings"
      largeTitle
      rightButton={doneButton}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* ── Appearance ─────────────────────────────────────────── */}
      <CupertinoListSection header="Appearance">
        <CupertinoListTile
          title="Wallpaper"
          leading={{ name: 'image', color: '#fff', backgroundColor: '#5856D6' }}
          showChevron
          onPress={() => navigation.navigate('Wallpaper')}
        />
        <CupertinoListTile
          title="Dark Mode"
          leading={{ name: 'moon', color: '#fff', backgroundColor: '#1C1C1E' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={isDark}
              onValueChange={() => toggleTheme()}
            />
          }
        />
        <CupertinoListTile
          title="App Icon Size"
          leading={{ name: 'apps', color: '#fff', backgroundColor: '#007AFF' }}
          trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>Default</Text>}
          showChevron={false}
          isLast
        />
      </CupertinoListSection>

      {/* ── Home Screen ────────────────────────────────────────── */}
      <CupertinoListSection header="Home Screen">
        <CupertinoListTile
          title="Show Badge Counts"
          leading={{ name: 'notifications', color: '#fff', backgroundColor: '#FF3B30' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.notificationBadges}
              onValueChange={(v) => update('notificationBadges', v)}
            />
          }
        />
        <CupertinoListTile
          title="Show Battery in Status Bar"
          leading={{ name: 'battery-half', color: '#fff', backgroundColor: '#34C759' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.batteryPercentage}
              onValueChange={(v) => update('batteryPercentage', v)}
            />
          }
        />
        <CupertinoListTile
          title="Show Search Label"
          leading={{ name: 'search', color: '#fff', backgroundColor: '#5AC8FA' }}
          showChevron={false}
          isLast
          trailing={
            <CupertinoSwitch
              value={true}
              onValueChange={() => {
                // Placeholder — extend SettingsState to persist if needed
              }}
            />
          }
        />
      </CupertinoListSection>

      {/* ── Dock ───────────────────────────────────────────────── */}
      <CupertinoListSection header="Dock">
        {dockApps.map((app, i) => (
          <CupertinoListTile
            key={app.packageName}
            title={DOCK_LABELS[app.packageName] ?? app.name}
            leading={{ name: 'ellipse-outline', color: '#fff', backgroundColor: '#8E8E93' }}
            showChevron={false}
            isLast={i === dockApps.length - 1}
          />
        ))}
        <View style={styles.buttonRow}>
          <CupertinoButton
            title="Reset Dock to Defaults"
            variant="tinted"
            destructive
            onPress={handleResetDock}
          />
        </View>
      </CupertinoListSection>

      {/* ── App Grid ───────────────────────────────────────────── */}
      <CupertinoListSection header="App Grid">
        <View style={styles.buttonRow}>
          <CupertinoButton
            title="Reset Home Layout"
            variant="tinted"
            destructive
            onPress={handleResetHomeLayout}
          />
        </View>
        <View style={[styles.buttonRow, { marginTop: 8 }]}>
          <CupertinoButton
            title={`Reset Folders (${folders.length})`}
            variant="tinted"
            destructive
            onPress={handleResetFolders}
          />
        </View>
      </CupertinoListSection>

      {/* ── Lock Screen ────────────────────────────────────────── */}
      <CupertinoListSection header="Lock Screen">
        <CupertinoListTile
          title="Show Lock Screen"
          leading={{ name: 'lock-closed', color: '#fff', backgroundColor: '#FF9500' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={showLockScreen}
              onValueChange={setShowLockScreen}
            />
          }
        />
        <CupertinoListTile
          title="Biometric Unlock"
          leading={{ name: 'finger-print', color: '#fff', backgroundColor: '#34C759' }}
          showChevron={false}
          isLast
          trailing={
            <CupertinoSwitch
              value={biometricUnlock}
              onValueChange={setBiometricUnlock}
            />
          }
        />
      </CupertinoListSection>

      {/* ── About ──────────────────────────────────────────────── */}
      <CupertinoListSection header="About">
        <CupertinoListTile
          title="Version"
          leading={{ name: 'information-circle', color: '#fff', backgroundColor: '#5856D6' }}
          trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>1.4.0</Text>}
          showChevron={false}
        />
        <CupertinoListTile
          title="Re-run Onboarding"
          leading={{ name: 'refresh', color: '#fff', backgroundColor: '#5AC8FA' }}
          showChevron
          onPress={handleRerunOnboarding}
          isLast
        />
        <View style={[styles.buttonRow, { marginTop: 8 }]}>
          <CupertinoButton
            title="Reset All Settings"
            variant="tinted"
            destructive
            onPress={handleResetAll}
          />
        </View>
      </CupertinoListSection>
    </CupertinoNavigationBar>
  );
}

const styles = StyleSheet.create({
  buttonRow: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
});
