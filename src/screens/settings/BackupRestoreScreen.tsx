import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoAlertDialog,
  CupertinoSwitch,
  CupertinoSegmentedControl,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';
import { createSnapshot, applySnapshot } from '../../services/BackupSnapshot';
import {
  isBackupDue,
  loadAutoBackupPrefs,
  saveAutoBackupPrefs,
  withBackupTimestamp,
  DEFAULT_AUTO_BACKUP_PREFS,
  type AutoBackupPrefs,
  type BackupFrequency,
} from '../../services/AutoBackupSchedule';

const FREQUENCY_OPTIONS: BackupFrequency[] = ['daily', 'weekly'];

export function BackupRestoreScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);

  // Auto Backup prefs (issue #283).
  const [autoEnabled, setAutoEnabled] = useState(DEFAULT_AUTO_BACKUP_PREFS.enabled);
  const [autoFrequency, setAutoFrequency] = useState<BackupFrequency>(DEFAULT_AUTO_BACKUP_PREFS.frequency);
  const [autoLastBackupAt, setAutoLastBackupAt] = useState<string | null>(DEFAULT_AUTO_BACKUP_PREFS.lastBackupAt);

  const alert = useAlert();

  // Mirror the live prefs into a ref so the AppState listener (registered once)
  // always evaluates the current state, never a stale closure.
  const prefsRef = useRef<AutoBackupPrefs>({
    enabled: autoEnabled,
    frequency: autoFrequency,
    lastBackupAt: autoLastBackupAt,
  });
  useEffect(() => {
    prefsRef.current = { enabled: autoEnabled, frequency: autoFrequency, lastBackupAt: autoLastBackupAt };
  }, [autoEnabled, autoFrequency, autoLastBackupAt]);

  // Tracks whether the user has already interacted with the toggle in this
  // session. The persisted prefs load asynchronously on mount; if that load
  // settles after the user has toggled, we must NOT clobber their choice.
  const userTouched = useRef(false);

  // Load persisted Auto Backup prefs on mount. There is no code path that
  // renders this screen while the app is backgrounded, so mounting IS a
  // foreground transition — check due-ness unconditionally here rather than
  // gating on AppState.currentState/a "last seen state" ref. That ref starts
  // out unset (there is no synthetic 'change' event on mount, in production
  // or under jest/no-native), so gating on it silently swallowed the very
  // first due-check: a user opening this screen with a backup already overdue
  // never saw the reminder until some *later* explicit foreground transition.
  useEffect(() => {
    let cancelled = false;
    loadAutoBackupPrefs().then((prefs) => {
      if (cancelled || userTouched.current) return;
      setAutoEnabled(prefs.enabled);
      setAutoFrequency(prefs.frequency);
      setAutoLastBackupAt(prefs.lastBackupAt);
      if (isBackupDue(prefs, new Date())) {
        setShowBackupPrompt(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Foreground-triggered reminder (issue #283): on the app coming BACK to the
  // foreground after being backgrounded, if a backup is due and Auto Backup is
  // on, surface a one-tap prompt. The prompt only ever runs the existing
  // MANUAL backup flow (doExport) — it never uploads unattended, so the
  // passphrase constraint (#270) holds.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      if (isBackupDue(prefsRef.current, new Date())) {
        setShowBackupPrompt(true);
      }
    });
    return () => subscription.remove();
  }, []);

  const persistPrefs = useCallback(
    (next: AutoBackupPrefs) => {
      setAutoEnabled(next.enabled);
      setAutoFrequency(next.frequency);
      setAutoLastBackupAt(next.lastBackupAt);
      void saveAutoBackupPrefs(next);
    },
    [],
  );

  const doExport = useCallback(async () => {
    try {
      setBusy(true);
      const snapshot = await createSnapshot();
      const json = JSON.stringify(snapshot, null, 2);
      await Clipboard.setStringAsync(json);
      const now = new Date();
      const nowLabel = now.toLocaleString();
      setLastBackupTime(nowLabel);
      // Stamp the Auto Backup schedule so the reminder stops firing until the
      // next interval — only when Auto Backup is on, so a manual export with
      // Auto Backup OFF leaves the auto-backup key completely untouched
      // (regression guard). Always via the manual (supervised) flow, never
      // silently.
      if (prefsRef.current.enabled) {
        persistPrefs(withBackupTimestamp(prefsRef.current, now));
      }
      alert('Backup Copied', 'Settings exported to clipboard. Paste the JSON somewhere safe.');
    } catch (e) {
      alert('Export Failed', String(e));
    } finally {
      setBusy(false);
    }
  }, [alert, persistPrefs]);

  const handleExport = useCallback(() => {
    setShowExportConfirm(true);
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!importText.trim()) {
      alert('Error', 'Paste your backup JSON first.');
      return;
    }
    try {
      setImporting(true);
      const data = JSON.parse(importText.trim());
      await applySnapshot(data);
      setShowImportModal(false);
      setImportText('');
      alert('Restored', 'Settings imported successfully. Restart the app to apply all changes.');
    } catch (e) {
      alert('Error', `Invalid backup data: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }, [importText, alert]);

  const handleReset = useCallback(async () => {
    try {
      setBusy(true);
      await AsyncStorage.clear();
      setShowResetConfirm(false);
      alert('Reset Complete', 'All settings cleared. Restart the app to apply changes.');
    } catch (e) {
      alert('Reset Failed', String(e));
    } finally {
      setBusy(false);
    }
  }, [alert]);

  const handleToggleAuto = useCallback(
    (enabled: boolean) => {
      userTouched.current = true;
      persistPrefs({ ...prefsRef.current, enabled });
    },
    [persistPrefs],
  );

  const handleFrequencyChange = useCallback(
    (index: number) => {
      userTouched.current = true;
      const frequency = FREQUENCY_OPTIONS[index] ?? 'daily';
      persistPrefs({ ...prefsRef.current, frequency });
    },
    [persistPrefs],
  );

  const handleBackupPrompt = useCallback(() => {
    setShowBackupPrompt(false);
    void doExport();
  }, [doExport]);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Backup & Restore"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            General
          </Text>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Backup */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>BACKUP</Text>
          <CupertinoListSection>
            <CupertinoListTile
              title="Export Settings"
              subtitle="Copy app preferences to clipboard as JSON"
              onPress={handleExport}
              trailing={busy ? <ActivityIndicator size="small" color={colors.systemBlue} /> : undefined}
            />
            {lastBackupTime && (
              <CupertinoListTile
                title="Last Backup"
                showChevron={false}
                trailing={
                  <Text style={[typography.footnote, { color: colors.secondaryLabel }]}>
                    {lastBackupTime}
                  </Text>
                }
                onPress={() => alert('Last Backup', `Your last backup was on ${lastBackupTime}.`)}
              />
            )}
          </CupertinoListSection>
        </View>

        {/* Auto Backup */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>AUTO BACKUP</Text>
          <CupertinoListSection>
            <CupertinoListTile
              title="Auto Backup"
              subtitle="Remind me to back up when due"
              showChevron={false}
              trailing={
                <CupertinoSwitch
                  value={autoEnabled}
                  onValueChange={handleToggleAuto}
                  testID="auto-backup-switch"
                />
              }
            />
            {autoEnabled && (
              <CupertinoListTile
                title="Frequency"
                showChevron={false}
                trailing={
                  <View style={{ width: 160 }}>
                    <CupertinoSegmentedControl
                      values={['Daily', 'Weekly']}
                      selectedIndex={FREQUENCY_OPTIONS.indexOf(autoFrequency)}
                      onChange={handleFrequencyChange}
                      testID="auto-backup-frequency"
                    />
                  </View>
                }
              />
            )}
          </CupertinoListSection>
          {autoEnabled && (
            <Text style={[styles.footer, { color: colors.secondaryLabel }]}>
              Backups are never uploaded automatically. When a backup is due, you&apos;ll be reminded on app open and can run it with your passphrase, just like a manual export.
            </Text>
          )}
        </View>

        {/* Restore */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>RESTORE</Text>
          <CupertinoListSection>
            <CupertinoListTile
              title="Import Settings"
              subtitle="Paste a backup JSON to restore settings"
              onPress={() => setShowImportModal(true)}
            />
          </CupertinoListSection>
        </View>

        {/* Reset */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>RESET</Text>
          <CupertinoListSection>
            <CupertinoListTile
              title="Reset All Settings"
              showChevron={false}
              leading={{ name: 'trash', color: '#FFFFFF', backgroundColor: colors.systemRed }}
              onPress={() => setShowResetConfirm(true)}
            />
          </CupertinoListSection>
          <Text style={[styles.footer, { color: colors.secondaryLabel }]}>
            This will erase all app preferences, appearance settings, and stored data. The app will revert to its default state.
          </Text>
        </View>
      </ScrollView>

      {/* Import Modal */}
      <Modal
        visible={showImportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowImportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.systemBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.label }]}>Import Settings</Text>
            <Text style={[styles.modalSubtitle, { color: colors.secondaryLabel }]}>
              Paste your backup JSON below:
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.systemGroupedBackground,
                  color: colors.label,
                  borderColor: colors.separator,
                },
              ]}
              multiline
              numberOfLines={8}
              value={importText}
              onChangeText={setImportText}
              placeholder='{"@iostoandroid/...": "..."}'
              placeholderTextColor={colors.tertiaryLabel}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.separator }]}
                onPress={() => {
                  setShowImportModal(false);
                  setImportText('');
                }}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text style={[styles.modalBtnText, { color: colors.label }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnConfirm, { backgroundColor: colors.systemBlue }]}
                onPress={handleImportConfirm}
                disabled={importing}
                accessibilityLabel="Import"
                accessibilityRole="button"
              >
                {importing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Import</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Export Disclosure Dialog */}
      <CupertinoAlertDialog
        visible={showExportConfirm}
        title="Export Settings"
        message="This copies your app preferences (display, sounds, keyboard, accessibility, and similar settings) to the clipboard. The clipboard is readable by any app in the foreground."
        actions={[
          { label: 'Cancel', style: 'cancel', onPress: () => setShowExportConfirm(false) },
          {
            label: 'Export',
            style: 'default',
            onPress: () => {
              setShowExportConfirm(false);
              doExport();
            },
          },
        ]}
        onClose={() => setShowExportConfirm(false)}
      />

      {/* Auto Backup Reminder Dialog — foreground-triggered only, runs the manual flow */}
      <CupertinoAlertDialog
        visible={showBackupPrompt}
        title="Time for your backup"
        message="Your scheduled backup is due. Back up now? Your settings will be copied to the clipboard, just like a manual export."
        actions={[
          { label: 'Not Now', style: 'cancel', onPress: () => setShowBackupPrompt(false) },
          { label: 'Back Up Now', style: 'default', onPress: handleBackupPrompt },
        ]}
        onClose={() => setShowBackupPrompt(false)}
      />

      {/* Reset Confirm Dialog */}
      <CupertinoAlertDialog
        visible={showResetConfirm}
        title="Reset All Settings"
        message="This will permanently erase all launcher settings and data. This action cannot be undone."
        actions={[
          { label: 'Cancel', style: 'cancel', onPress: () => setShowResetConfirm(false) },
          { label: 'Reset', style: 'destructive', onPress: handleReset },
        ]}
        onClose={() => setShowResetConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 24,
    marginBottom: 6,
    marginLeft: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  footer: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginHorizontal: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    fontFamily: 'monospace',
    minHeight: 160,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    borderWidth: 1,
  },
  modalBtnConfirm: {},
  modalBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
