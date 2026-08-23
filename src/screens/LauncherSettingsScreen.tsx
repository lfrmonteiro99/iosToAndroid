import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  CupertinoSegmentedControl,
  CupertinoSlider,
  CupertinoActionSheet,
  useAlert,
} from '../components';
import { logger } from '../utils/logger';
import {
  PERF_BUDGETS,
  getPerfMetrics,
  isWithinBudget,
  subscribePerfMetrics,
  type PerfBudgetKey,
  type PerfMetrics,
} from '../utils/perfMetrics';

/**
 * #517: os números de arranque têm de ser legíveis em runtime, e não podem
 * viver num `console.log` — o `transform-remove-console` do babel apaga-os
 * na build de release, que é precisamente a que interessa medir. Por isso são
 * lidos do registo em memória e mostrados aqui.
 */
function usePerfMetrics(): PerfMetrics {
  const [metrics, setMetrics] = useState<PerfMetrics>(() => getPerfMetrics());
  useEffect(() => subscribePerfMetrics(setMetrics), []);
  return metrics;
}

/** "312 ms (alvo 400 ms)" / "sem medição (alvo 400 ms)" — nunca um 0 inventado. */
export function formatPerfValue(value: number | null, budget: PerfBudgetKey): string {
  const target = `alvo ${PERF_BUDGETS[budget]} ms`;
  if (value === null || !Number.isFinite(value)) return `sem medição (${target})`;
  return `${Math.round(value)} ms (${target})`;
}

// Default dock package names — mirrors AppsStore constant
const DEFAULT_DOCK = [
  'com.iostoandroid.phone',
  'com.iostoandroid.messages',
  'com.iostoandroid.contacts',
  'com.iostoandroid.settings',
];

// Passcode storage: SecureStore is primary; AsyncStorage is a fallback when
// SecureStore is unavailable. The legacy key predates the @iostoandroid/ namespace.
const LOCK_PIN_KEY = 'lock_pin';
const LOCK_PIN_STORAGE_KEY = '@iostoandroid/lock_pin';
const LOCK_PIN_LEGACY_KEY = '@lock_pin';

// Home-screen grid density options (issue #503).
const GRID_COLUMN_VALUES = [3, 4, 5, 6] as const;
const GRID_ROW_VALUES = [4, 5, 6, 7] as const;

const DOCK_LABELS: Record<string, string> = {
  'com.iostoandroid.phone': 'Phone',
  'com.iostoandroid.messages': 'Messages',
  'com.iostoandroid.contacts': 'Contacts',
  'com.iostoandroid.settings': 'Settings',
};

export function LauncherSettingsScreen() {
  const navigation = useNavigation<AppNavigationProp>();
  const themeCtx = useTheme();
  const { theme, typography, isDark, toggleTheme, textScale } = themeCtx;
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update, reset: resetSettings } = useSettings();
  const { dockApps, apps, hiddenApps, unhideApp } = useApps();
  const { folders, deleteFolder } = useFolders();

  const alert = useAlert();
  const [showPinModal, setShowPinModal] = useState(false);
  const [showNewAppsPicker, setShowNewAppsPicker] = useState(false);
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
      // Read PIN from SecureStore (fall back to namespaced AsyncStorage key, then legacy)
      let current: string | null = null;
      try { current = await SecureStore.getItemAsync(LOCK_PIN_KEY); } catch { /* ignore */ }
      if (!current) {
        try { current = await AsyncStorage.getItem(LOCK_PIN_STORAGE_KEY); } catch { /* ignore */ }
      }
      if (!current) {
        try { current = await AsyncStorage.getItem(LOCK_PIN_LEGACY_KEY); } catch { /* ignore */ }
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
        await SecureStore.setItemAsync(LOCK_PIN_KEY, pinInput);
        // Remove AsyncStorage copies if they exist
        await AsyncStorage.removeItem(LOCK_PIN_STORAGE_KEY);
        await AsyncStorage.removeItem(LOCK_PIN_LEGACY_KEY);
      } catch {
        // Fallback to AsyncStorage if SecureStore unavailable (namespaced key only)
        await AsyncStorage.setItem(LOCK_PIN_STORAGE_KEY, pinInput);
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

  const perf = usePerfMetrics();

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
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
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
          trailing={
            <Text style={[typography.body, { color: colors.secondaryLabel }]}>
              {Math.round(settings.iconSizeScale * 100)}%
            </Text>
          }
          showChevron={false}
          isLast
        />
        <View style={styles.sliderRow}>
          <CupertinoSlider
            value={settings.iconSizeScale}
            onValueChange={(v) => update('iconSizeScale', v)}
            minimumValue={0.8}
            maximumValue={1.2}
          />
        </View>
      </CupertinoListSection>

      {/* ── Home Screen ────────────────────────────────────────── */}
      <CupertinoListSection header="Home Screen">
        <CupertinoListTile
          title="New Apps Go To"
          leading={{ name: 'apps', color: '#fff', backgroundColor: '#5856D6' }}
          showChevron
          trailing={
            <Text style={[typography.body, { color: colors.secondaryLabel }]}>
              {settings.newAppsToHome ? 'Home Screen' : 'App Library Only'}
            </Text>
          }
          onPress={() => setShowNewAppsPicker(true)}
        />
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
          trailing={
            <CupertinoSwitch
              value={settings.showSearchLabel}
              onValueChange={(v) => update('showSearchLabel', v)}
            />
          }
        />
        <CupertinoListTile
          title="Show Page Dots"
          leading={{ name: 'apps', color: '#fff', backgroundColor: '#FF9500' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.showPageDots}
              onValueChange={(v) => update('showPageDots', v)}
            />
          }
        />
        <CupertinoListTile
          title="Show App Names"
          leading={{ name: 'text-outline', color: '#fff', backgroundColor: '#8E8E93' }}
          showChevron={false}
          isLast
          trailing={
            <CupertinoSwitch
              value={settings.showIconLabels}
              onValueChange={(v) => update('showIconLabels', v)}
            />
          }
        />
      </CupertinoListSection>

      {/* ── Hidden Apps (#606) ─────────────────────────────────── */}
      {/* Só existe quando há algo escondido: uma secção permanentemente vazia
          seria ruído no ecrã, e o utilizador só chega aqui depois de esconder. */}
      {hiddenApps.length > 0 && (
        <CupertinoListSection header="Hidden Apps">
          {hiddenApps.map((pkg, i) => (
            <CupertinoListTile
              key={pkg}
              // Um pacote desinstalado entretanto já não está em `apps`; mostra-se
              // o packageName para continuar a ser possível revelá-lo.
              title={apps.find(a => a.packageName === pkg)?.name ?? pkg}
              subtitle="Tap to unhide"
              leading={{ name: 'eye-off', color: '#fff', backgroundColor: '#8E8E93' }}
              showChevron={false}
              isLast={i === hiddenApps.length - 1}
              onPress={() => unhideApp(pkg)}
            />
          ))}
          <View style={styles.buttonRow}>
            <CupertinoButton
              title="Unhide All Apps"
              variant="tinted"
              onPress={() => hiddenApps.forEach(unhideApp)}
            />
          </View>
        </CupertinoListSection>
      )}

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
        <View style={styles.gridControlRow}>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 6 }]}>Columns</Text>
          <CupertinoSegmentedControl
            values={GRID_COLUMN_VALUES.map(String)}
            selectedIndex={GRID_COLUMN_VALUES.indexOf(settings.gridColumns)}
            onChange={(i) => update('gridColumns', GRID_COLUMN_VALUES[i])}
          />
        </View>
        <View style={styles.gridControlRow}>
          <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 6 }]}>Rows</Text>
          <CupertinoSegmentedControl
            values={GRID_ROW_VALUES.map(String)}
            selectedIndex={GRID_ROW_VALUES.indexOf(settings.gridRows)}
            onChange={(i) => update('gridRows', GRID_ROW_VALUES[i])}
          />
        </View>
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
        <Pressable style={styles.modalOverlay} onPress={() => setShowPinModal(false)} accessibilityLabel="Dismiss" accessibilityRole="button">
          <Pressable style={[styles.modalCard, { backgroundColor: colors.secondarySystemGroupedBackground }]} onPress={() => {}} importantForAccessibility="no">
            <Text style={[typography.headline, { color: colors.label, marginBottom: 6 }]}>
              {pinStep === 'current' ? 'Enter Current Passcode' : pinStep === 'new' ? 'Enter New Passcode' : 'Confirm New Passcode'}
            </Text>
            <Text style={[typography.footnote, { color: colors.secondaryLabel, marginBottom: 16, textAlign: 'center' }]}>
              {pinStep === 'current' ? 'Default passcode is 1234' : 'Must be exactly 4 digits'}
            </Text>
            <TextInput
              style={[styles.pinInput, { color: colors.label, borderColor: colors.separator, backgroundColor: colors.systemBackground, fontSize: 18 * textScale }]}
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
              <Pressable onPress={() => setShowPinModal(false)} style={[styles.modalBtn, { borderColor: colors.separator }]} accessibilityLabel="Cancel" accessibilityRole="button">
                <Text style={[typography.body, { color: colors.systemBlue }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handlePinSubmit} style={[styles.modalBtn, { borderColor: colors.separator }]} accessibilityLabel="Next" accessibilityRole="button">
                <Text style={[typography.body, { color: colors.systemBlue, fontWeight: '600' }]}>Next</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── New Apps destination (#601) ────────────────────────── */}
      <CupertinoActionSheet
        visible={showNewAppsPicker}
        onClose={() => setShowNewAppsPicker(false)}
        title="New Apps Go To"
        options={[
          {
            label: 'App Library Only',
            onPress: () => { update('newAppsToHome', false); setShowNewAppsPicker(false); },
          },
          {
            label: 'Home Screen',
            onPress: () => { update('newAppsToHome', true); setShowNewAppsPicker(false); },
          },
        ]}
        cancelLabel="Cancel"
      />

      {/* ── Diagnostics (#517) ─────────────────────────────────── */}
      <CupertinoListSection header="Diagnostics">
        <CupertinoListTile
          title="Cold Start"
          leading={{ name: 'speedometer', color: '#fff', backgroundColor: '#FF9500' }}
          showChevron={false}
          trailing={
            <Text
              accessibilityLabel={`Cold start: ${formatPerfValue(perf.coldStartMs, 'coldStartMs')}`}
              style={[
                typography.body,
                {
                  color:
                    isWithinBudget('coldStartMs', perf.coldStartMs) === false
                      ? colors.systemRed
                      : colors.secondaryLabel,
                },
              ]}
            >
              {formatPerfValue(perf.coldStartMs, 'coldStartMs')}
            </Text>
          }
        />
        <CupertinoListTile
          title="Warm Start"
          leading={{ name: 'flash', color: '#fff', backgroundColor: '#34C759' }}
          showChevron={false}
          isLast
          trailing={
            <Text
              accessibilityLabel={`Warm start: ${formatPerfValue(perf.warmStartMs, 'warmStartMs')}`}
              style={[
                typography.body,
                {
                  color:
                    isWithinBudget('warmStartMs', perf.warmStartMs) === false
                      ? colors.systemRed
                      : colors.secondaryLabel,
                },
              ]}
            >
              {formatPerfValue(perf.warmStartMs, 'warmStartMs')}
            </Text>
          }
        />
      </CupertinoListSection>

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
  sliderRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  gridControlRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
