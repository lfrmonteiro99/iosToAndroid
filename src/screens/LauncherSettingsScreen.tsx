import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Pressable, useWindowDimensions } from 'react-native';
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
import { readDiagnostics, clearDiagnostics, type Diagnostics } from '../utils/crashLog';
import { maxColumnsFor, maxIconScaleFor } from '../utils/launcherGridGeometry';
import {
  PERF_BUDGETS,
  getPerfMetrics,
  isWithinBudget,
  subscribePerfMetrics,
  type PerfBudgetKey,
  type PerfMetrics,
} from '../utils/perfMetrics';
import {
  REQUIRE_PASSCODE_LABELS,
  REQUIRE_PASSCODE_OPTIONS,
  normalizeRequirePasscodeAfter,
} from '../utils/passcodePolicy';
import { AccentColors, type AccentColorKey } from '../theme/CupertinoTheme';

// Tinted Icons colour swatches (issue #620): reuses the app's named accent
// palette instead of a bespoke colour list, so «Tinted Icons» and «Display &
// Brightness → Tint» always offer the same six options.
const ICON_TINT_KEYS = Object.keys(AccentColors) as AccentColorKey[];

/** 'blue' → 'Blue'. Mirrors DisplayBrightnessScreen's accentLabel. */
function iconTintLabel(key: AccentColorKey) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

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

// Top of the App Icon Size slider range (#503): the iOS «Large (no text)»
// preset (#621) — reaching it also hides app-name labels.
const ICON_SIZE_SCALE_LARGE = 1.2;

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
/** Menor coluna oferecida — o fallback se nem esta couber (larguras absurdas). */
const MIN_GRID_COLUMNS = GRID_COLUMN_VALUES[0];
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
  const { settings, update, updateMany, reset: resetSettings } = useSettings();
  const {
    dockApps, apps, hiddenApps, unhideApp, protectedApps = [], compactHomeLayout,
    isDefaultLauncher, openLauncherSettings,
  } = useApps();
  const { folders, deleteFolder } = useFolders();

  const alert = useAlert();
  const [errorLogOpen, setErrorLogOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({ breadcrumbs: [] });
  // Read once on mount, not on open: the row's subtitle has to say whether
  // there is anything to read before you tap it.
  useEffect(() => {
    let alive = true;
    readDiagnostics()
      .then((d) => { if (alive) setDiagnostics(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const [showPinModal, setShowPinModal] = useState(false);
  const [showNewAppsPicker, setShowNewAppsPicker] = useState(false);
  const [showRequirePasscodePicker, setShowRequirePasscodePicker] = useState(false);
  const [showIconTintPicker, setShowIconTintPicker] = useState(false);
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

  // ── Colunas x tamanho de ícone: limites mútuos ────────────────────────────
  //
  // A geometria da grelha nunca deixa um ícone transbordar: se não cabe na
  // célula, encolhe. O resultado era um controlo que aceitava tudo e degradava
  // em silêncio — 6 colunas com ícones a 120% dava ícones a ~93% sem nada a
  // dizer que o pedido era impossível. Aqui só se oferece o que cabe.
  const { width: windowWidth } = useWindowDimensions();

  const columnOptions = useMemo(() => {
    const limit = maxColumnsFor(windowWidth, settings.iconSizeScale);
    const fitting = GRID_COLUMN_VALUES.filter((c) => c <= limit);
    // Nunca deixar o controlo vazio: numa largura absurda oferece-se a menor.
    return fitting.length > 0 ? fitting : [MIN_GRID_COLUMNS];
  }, [windowWidth, settings.iconSizeScale]);

  // Tecto do slider = o que a densidade escolhida permite, nunca acima da gama.
  const iconScaleCeiling = useMemo(
    () => Math.min(ICON_SIZE_SCALE_LARGE, maxIconScaleFor(windowWidth, settings.gridColumns)),
    [windowWidth, settings.gridColumns],
  );

  // O valor guardado pode ter ficado fora da lista (guardado 6, e depois o
  // tamanho do ícone subiu). Mostra-se o maior que ainda cabe em vez de deixar
  // o controlo sem nada seleccionado.
  const selectedColumnIndex = Math.max(
    0,
    columnOptions.indexOf(
      columnOptions.includes(settings.gridColumns)
        ? settings.gridColumns
        : columnOptions[columnOptions.length - 1],
    ),
  );

  // iOS «Grande» esconde os nomes das apps — ao chegar ao topo da gama
  // (Large), combina-se com showIconLabels=false num único update atómico.
  // Abaixo do máximo o comportamento fica inalterado: o utilizador continua a
  // controlar showIconLabels pelo switch "Show App Names".
  const handleIconSizeChange = (v: number) => {
    // Subir o tamanho pode tornar as colunas actuais impossíveis. Baixa-se as
    // colunas no MESMO update, em vez de guardar um par que a grelha teria de
    // corrigir por baixo do utilizador.
    const limit = maxColumnsFor(windowWidth, v);
    // Escolhido da lista tipada, não calculado: gridColumns é uma união
    // estreita (3 | 4 | 5 | 6) e um Math.min devolveria um `number` qualquer.
    const fitting = GRID_COLUMN_VALUES.filter((c) => c <= limit);
    const largestFitting = fitting.length > 0 ? fitting[fitting.length - 1] : MIN_GRID_COLUMNS;
    const columns = settings.gridColumns <= largestFitting ? settings.gridColumns : largestFitting;
    const patch: Partial<typeof settings> = { iconSizeScale: v };
    if (columns !== settings.gridColumns) patch.gridColumns = columns;
    if (v >= ICON_SIZE_SCALE_LARGE) patch.showIconLabels = false;
    updateMany(patch);
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
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* ── Default launcher ───────────────────────────────────── */}
      {/*
        Always present, whichever way the answer currently goes.

        The only route to Android's home-launcher picker used to be the "Set
        Now" button on the home screen's banner, and that banner is hidden once
        this app IS the default. So the moment it worked, it disappeared — and
        there was no way left to go BACK to the stock launcher without digging
        through Android Settings by hand. Same intent opens the picker in both
        directions; only the wording changes.
      */}
      <CupertinoListSection
        header="Default Launcher"
        footer={
          isDefaultLauncher
            ? 'This app is your home screen. Opening the picker lets you switch back to another launcher.'
            : 'Android opens the launcher you pick here when you press Home.'
        }
      >
        <CupertinoListTile
          title={isDefaultLauncher ? 'Change Default Launcher' : 'Set as Default Launcher'}
          subtitle={isDefaultLauncher ? 'Currently this app' : 'Currently another launcher'}
          leading={{ name: 'home', color: '#fff', backgroundColor: colors.accent }}
          showChevron
          onPress={openLauncherSettings}
        />
      </CupertinoListSection>

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
        />
        <View style={styles.sliderRow}>
          <CupertinoSlider
            value={settings.iconSizeScale}
            onValueChange={handleIconSizeChange}
            minimumValue={0.8}
            maximumValue={iconScaleCeiling}
          />
        </View>
        <CupertinoListTile
          title="Tinted Icons"
          leading={{ name: 'color-palette', color: '#fff', backgroundColor: '#FF2D55' }}
          showChevron={false}
          isLast={!settings.iconTintEnabled}
          trailing={
            <CupertinoSwitch
              value={settings.iconTintEnabled}
              onValueChange={(v) => update('iconTintEnabled', v)}
            />
          }
        />
        {settings.iconTintEnabled && (
          <CupertinoListTile
            title="Tint Color"
            leading={{ name: 'color-fill', color: '#fff', backgroundColor: settings.iconTintColor }}
            isLast
            trailing={
              <View style={styles.tintTrailing}>
                <View
                  testID="icon-tint-swatch"
                  style={[styles.tintSwatch, { backgroundColor: settings.iconTintColor }]}
                />
              </View>
            }
            onPress={() => setShowIconTintPicker(true)}
          />
        )}
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
          title="Show Status Bar"
          leading={{ name: 'cellular', color: '#fff', backgroundColor: '#34C759' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.statusBarVisible}
              onValueChange={(v) => update('statusBarVisible', v)}
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

      {/* ── App Library (#602) ─────────────────────────────────── */}
      <CupertinoListSection header="App Library">
        <CupertinoListTile
          title="Show Notifications"
          leading={{ name: 'notifications', color: '#fff', backgroundColor: '#FF3B30' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.appLibraryShowNotifications}
              onValueChange={(v) => update('appLibraryShowNotifications', v)}
              testID="toggle-appLibraryShowNotifications"
            />
          }
        />
        <CupertinoListTile
          title="Show Suggestions"
          leading={{ name: 'apps', color: '#fff', backgroundColor: '#5856D6' }}
          showChevron={false}
          isLast
          trailing={
            <CupertinoSwitch
              value={settings.appLibraryShowSuggestions}
              onValueChange={(v) => update('appLibraryShowSuggestions', v)}
              testID="toggle-appLibraryShowSuggestions"
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
            values={columnOptions.map(String)}
            selectedIndex={selectedColumnIndex}
            onChange={(i) => update('gridColumns', columnOptions[i])}
          />
          {columnOptions.length < GRID_COLUMN_VALUES.length && (
            <Text style={[typography.caption1, { color: colors.secondaryLabel, marginTop: 6 }]}>
              {`Up to ${columnOptions[columnOptions.length - 1]} columns fit at this icon size. Make icons smaller for more.`}
            </Text>
          )}
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
          {/* #762: reassigns homeApps positions sequentially (0,1,2,...),
              closing every hole left by removing/moving icons — no app is
              lost, only positions shift. Non-destructive, so no `destructive`
              styling unlike the reset buttons below. */}
          <CupertinoButton
            title="Compact Layout"
            variant="tinted"
            onPress={compactHomeLayout}
          />
        </View>
        <View style={[styles.buttonRow, { marginTop: 8 }]}>
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
        {/* #611 — sub-opção do master `biometricUnlock` (iOS «iPhone Unlock»). */}
        <CupertinoListTile
          title="Face ID for Unlock"
          leading={{ name: 'scan', color: '#fff', backgroundColor: '#5856D6' }}
          showChevron={false}
          trailing={
            <CupertinoSwitch
              value={settings.faceIdForUnlock}
              onValueChange={(v) => update('faceIdForUnlock', v)}
            />
          }
        />
        {/* #611 — iOS «Require Passcode». */}
        <CupertinoListTile
          title="Require Passcode"
          leading={{ name: 'time', color: '#fff', backgroundColor: '#FF3B30' }}
          showChevron
          trailing={
            <Text style={[typography.body, { color: colors.secondaryLabel }]}>
              {REQUIRE_PASSCODE_LABELS[normalizeRequirePasscodeAfter(settings.requirePasscodeAfter)]}
            </Text>
          }
          onPress={() => setShowRequirePasscodePicker(true)}
        />
        <CupertinoListTile
          title="Change Passcode"
          leading={{ name: 'keypad', color: '#fff', backgroundColor: '#8E8E93' }}
          showChevron
          isLast
          onPress={handleChangePinPress}
        />
      </CupertinoListSection>

      {/* ── Protected Apps (#627) ─────────────────────────────────
          Distinto do Lock Screen acima: aquele bloqueia o launcher todo, este
          pede biometria a abrir apps individuais (ver AppsStore.launchApp). */}
      <CupertinoListSection header="App Lock">
        <CupertinoListTile
          title="Protected Apps"
          subtitle={protectedApps.length > 0 ? `${protectedApps.length} protected` : 'None'}
          leading={{ name: 'shield-checkmark', color: '#fff', backgroundColor: '#34C759' }}
          showChevron
          isLast
          onPress={() => navigation.navigate('ProtectedApps')}
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

      {/* ── Require Passcode after (#611) ──────────────────────── */}
      <CupertinoActionSheet
        visible={showRequirePasscodePicker}
        onClose={() => setShowRequirePasscodePicker(false)}
        title="Require Passcode"
        options={REQUIRE_PASSCODE_OPTIONS.map((option) => ({
          label: REQUIRE_PASSCODE_LABELS[option],
          onPress: () => {
            update('requirePasscodeAfter', option);
            setShowRequirePasscodePicker(false);
          },
        }))}
        cancelLabel="Cancel"
      />

      {/* ── Tinted Icons colour (#620) ──────────────────────────── */}
      <CupertinoActionSheet
        visible={showIconTintPicker}
        onClose={() => setShowIconTintPicker(false)}
        title="Tint Color"
        options={ICON_TINT_KEYS.map((key) => ({
          label: iconTintLabel(key),
          onPress: () => {
            update('iconTintColor', AccentColors[key].light);
            setShowIconTintPicker(false);
          },
        }))}
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
        {/*
          The error log. A release build used to discard every caught error
          (logger was a no-op outside __DEV__) and wrote nothing at all when the
          process died, so a device report of "opening a third-party app kills
          the launcher" could not be investigated — the only evidence was a
          screenshot of Android's "keeps stopping" dialog.

          The count is on the row so it is obvious there is something to read
          without opening it. See utils/crashLog.ts for why the breadcrumbs and
          the fatal record survive different kinds of crash.
        */}
        <CupertinoListTile
          title="Error Log"
          subtitle={
            diagnostics.lastFatal
              ? 'A crash was recorded'
              : diagnostics.breadcrumbs.length > 0
              ? `${diagnostics.breadcrumbs.length} entries`
              : 'Nothing recorded'
          }
          leading={{
            name: 'bug',
            color: '#fff',
            backgroundColor: diagnostics.lastFatal ? colors.systemRed : '#8E8E93',
          }}
          showChevron
          isLast
          onPress={() => setErrorLogOpen((open) => !open)}
        />
      </CupertinoListSection>

      {errorLogOpen && (
        <View
          testID="error-log-body"
          style={[styles.errorLog, { backgroundColor: colors.secondarySystemBackground }]}
        >
          {diagnostics.lastFatal && (
            <Text selectable style={[typography.footnote, { color: colors.systemRed, marginBottom: 12 }]}>
              {diagnostics.lastFatal.at} {diagnostics.lastFatal.message}
              {diagnostics.lastFatal.stack ? `\n${diagnostics.lastFatal.stack}` : ''}
            </Text>
          )}
          {diagnostics.breadcrumbs.length === 0 && !diagnostics.lastFatal ? (
            <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
              Nothing recorded yet.
            </Text>
          ) : (
            // Newest first: after a crash the last few lines are the ones that
            // matter, and this list is read on a phone.
            [...diagnostics.breadcrumbs].reverse().map((b, i) => (
              <Text
                key={`${b.at}-${i}`}
                selectable
                style={[
                  typography.footnote,
                  { color: b.level === 'error' || b.level === 'fatal' ? colors.systemRed : colors.secondaryLabel },
                ]}
              >
                {b.at.slice(11, 23)} [{b.tag}] {b.message}
                {b.detail ? ` — ${b.detail}` : ''}
              </Text>
            ))
          )}
          <CupertinoButton
            title="Clear Log"
            variant="tinted"
            onPress={() => {
              clearDiagnostics()
                .catch(() => {})
                .finally(() => setDiagnostics({ breadcrumbs: [] }));
            }}
            style={{ marginTop: 16 }}
          />
        </View>
      )}

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
  tintTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tintSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  errorLog: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    padding: 12,
    gap: 2,
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
