import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import type { AppNavigationProp } from '../navigation/types';

import { useTheme } from '../theme/ThemeContext';
import { useSettings } from '../store/SettingsStore';
import { useApps } from '../store/AppsStore';
import { useFolders } from '../store/FoldersStore';
import appJson from '../../app.json';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoButton,
  useAlert,
} from '../components';
import { logger } from '../utils/logger';

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
  const navigation = useNavigation<AppNavigationProp>();
  const themeCtx = useTheme();
  const { theme, typography, isDark, toggleTheme } = themeCtx;
  const { colors } = theme;
  const { settings, update, reset: resetSettings } = useSettings();
  const { dockApps } = useApps();
  const { folders, deleteFolder } = useFolders();

  const alert = useAlert();
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [pinInput, setPinInput] = useState('');
  const [newPin, setNewPin] = useState('');

  const handleChangePinPress = useCallback(() => {
    setPinStep('current');
    setPinInput('');
    setNewPin('');
    setShowPinModal(true);
  }, []);

  const handlePinSubmit = useCallback(async () => {
    if (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput)) {
      alert('Invalid PIN', 'PIN must be exactly 4 digits.');
      return;
    }
    if (pinStep === 'current') {
      // Read PIN from SecureStore (fall back to legacy AsyncStorage)
      let current: string | null = null;
      try { current = await SecureStore.getItemAsync('lock_pin'); } catch { /* ignore */ }
      if (!current) {
        try { current = await AsyncStorage.getItem('@lock_pin'); } catch { /* ignore */ }
      }
      if (current && pinInput !== current) {
        alert('Incorrect PIN', 'The current PIN you entered is wrong.');
        setPinInput('');
        return;
      }
      setPinStep('new');
      setPinInput('');
    } else if (pinStep === 'new') {
      setNewPin(pinInput);
      setPinStep('confirm');
      setPinInput('');
    } else {
      if (pinInput !== newPin) {
        alert('PIN Mismatch', 'The PINs do not match. Please try again.');
        setPinStep('new');
        setPinInput('');
        setNewPin('');
        return;
      }
      // Store PIN securely
      try {
        await SecureStore.setItemAsync('lock_pin', pinInput);
        // Remove legacy key if it exists
        await AsyncStorage.removeItem('@lock_pin');
      } catch {
        // Fallback to AsyncStorage if SecureStore unavailable
        await AsyncStorage.setItem('@lock_pin', pinInput);
      }
      setShowPinModal(false);
      alert('Success', 'Your passcode has been changed.');
    }
  }, [pinInput, pinStep, newPin, alert]);

  const handleResetDock = () => {
    alert('Reset Dock', 'Restore dock to Phone, Messages, Contacts, Settings?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          AsyncStorage.getItem('@iostoandroid/apps_layout').then((raw) => {
            let homeApps: unknown[] = [];
            if (raw) {
              try { homeApps = JSON.parse(raw).homeApps || []; } catch (e) { logger.warn('LauncherSettings', 'failed to parse layout', e); }
            }
            AsyncStorage.setItem('@iostoandroid/apps_layout', JSON.stringify({
              dockApps: DEFAULT_DOCK,
              homeApps,
            }));
          });
          alert('Dock reset', 'Restart the app to apply changes.');
        },
      },
    ]);
  };

  const handleResetHomeLayout = () => {
    alert('Reset Home Layout', 'This will clear all app positions on the home screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          AsyncStorage.getItem('@iostoandroid/apps_layout').then((raw) => {
            let dockPkgs: unknown[] = DEFAULT_DOCK;
            if (raw) {
              try { dockPkgs = JSON.parse(raw).dockApps || DEFAULT_DOCK; } catch (e) { logger.warn('LauncherSettings', 'failed to parse layout', e); }
            }
            AsyncStorage.setItem('@iostoandroid/apps_layout', JSON.stringify({
              dockApps: dockPkgs,
              homeApps: [],
            }));
          });
          alert('Home layout reset', 'Restart the app to apply changes.');
        },
      },
    ]);
  };

  const handleResetFolders = () => {
    alert('Reset Folders', 'Delete all folders? Apps will remain on the home screen.', [
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
    alert(
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
            alert('Reset complete', 'Please restart the app.');
          },
        },
      ],
    );
  };

  const handleRerunOnboarding = () => {
    alert('Re-run Onboarding', 'This will show the onboarding flow on next app start.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          await AsyncStorage.removeItem('@iostoandroid/onboarding_done');
          alert('Done', 'Restart the app to see onboarding.');
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
          leading={{ name: 'apps', color: '#fff', backgroundColor: colors.accent }}
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
              value={settings.showSearchLabel}
              onValueChange={(v) => update('showSearchLabel', v)}
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
              value={settings.showLockScreen}
              onValueChange={(v) => update('showLockScreen', v)}
            />
          }
        />
        <CupertinoListTile
          title="Biometric Unlock"
          leading={{ name: 'finger-print', color: '#fff', backgroundColor: '#34C759' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.biometricUnlock}
              onValueChange={(v) => update('biometricUnlock', v)}
            />
          }
        />
        <CupertinoListTile
          title="Change Passcode"
          leading={{ name: 'keypad', color: '#fff', backgroundColor: '#8E8E93' }}
          showChevron
          isLast
          onPress={handleChangePinPress}
        />
      </CupertinoListSection>

      {/* ── PIN Change Modal ───────────────────────────────────── */}
      <Modal visible={showPinModal} transparent animationType="fade" onRequestClose={() => setShowPinModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPinModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.secondarySystemGroupedBackground }]} onPress={() => {}}>
            <Text style={[typography.headline, { color: colors.label, marginBottom: 6 }]}>
              {pinStep === 'current' ? 'Enter Current Passcode' : pinStep === 'new' ? 'Enter New Passcode' : 'Confirm New Passcode'}
            </Text>
            <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 16, textAlign: 'center' }]}>
              {pinStep === 'current' ? 'Default passcode is 1234' : 'Must be exactly 4 digits'}
            </Text>
            <TextInput
              style={[styles.pinInput, { color: colors.label, borderColor: colors.separator, backgroundColor: colors.systemBackground }]}
              value={pinInput}
              onChangeText={setPinInput}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              placeholder="••••"
              placeholderTextColor={colors.secondaryLabel}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable onPress={() => setShowPinModal(false)} style={[styles.modalBtn, { borderColor: colors.separator }]}>
                <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handlePinSubmit} style={[styles.modalBtn, { borderColor: colors.separator }]}>
                <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}>Next</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── About ──────────────────────────────────────────────── */}
      <CupertinoListSection header="About">
        <CupertinoListTile
          title="Version"
          leading={{ name: 'information-circle', color: '#fff', backgroundColor: '#5856D6' }}
          trailing={<Text style={[typography.body, { color: colors.secondaryLabel }]}>{appJson.expo.version}</Text>}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: 300,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
  },
  pinInput: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
});
