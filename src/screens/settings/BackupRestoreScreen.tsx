import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
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
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function BackupRestoreScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();

  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const alert = useAlert();

  const handleExport = useCallback(async () => {
    try {
      setBusy(true);
      const keys = await AsyncStorage.getAllKeys();
      const rawEntries = await AsyncStorage.getMany(keys);
      const backup: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawEntries)) {
        if (v !== null) backup[k] = v;
      }
      const json = JSON.stringify(backup, null, 2);
      await Clipboard.setStringAsync(json);
      const now = new Date().toLocaleString();
      setLastBackupTime(now);
      alert('Backup Copied', 'Settings exported to clipboard. Paste the JSON somewhere safe.');
    } catch (e) {
      alert('Export Failed', String(e));
    } finally {
      setBusy(false);
    }
  }, [alert]);

  const handleImportConfirm = useCallback(async () => {
    if (!importText.trim()) {
      alert('Error', 'Paste your backup JSON first.');
      return;
    }
    try {
      setImporting(true);
      const data = JSON.parse(importText.trim());
      if (typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Expected a JSON object');
      }
      const entries: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        entries[k] = String(v);
      }
      await AsyncStorage.setMany(entries);
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
              subtitle="Copy all settings to clipboard as JSON"
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
              >
                <Text style={[styles.modalBtnText, { color: colors.label }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnConfirm, { backgroundColor: colors.systemBlue }]}
                onPress={handleImportConfirm}
                disabled={importing}
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
