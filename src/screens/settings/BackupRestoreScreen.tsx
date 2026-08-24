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
import { createSnapshot, applySnapshot } from '../../services/BackupSnapshot';
import { encryptSnapshot, decryptSnapshot } from '../../services/BackupEncryption';
import { validateSnapshot } from '../../services/BackupValidation';
import { uploadBackup, listBackups, downloadBackup, type CloudBackupEntry } from '../../services/CloudBackup';
import {
  getInitialState,
  getAccessToken,
  signIn as googleSignIn,
  signOut as googleSignOut,
  type GoogleAuthState,
} from '../../services/GoogleAuth';

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
  const alert = useAlert();

  const [googleState, setGoogleState] = useState<GoogleAuthState>(() => getInitialState());
  const [googleBusy, setGoogleBusy] = useState(false);

  const [cloudBackupBusy, setCloudBackupBusy] = useState(false);
  const [cloudRestoreBusy, setCloudRestoreBusy] = useState(false);
  const [passphraseMode, setPassphraseMode] = useState<'backup' | 'restore' | null>(null);
  const [passphraseText, setPassphraseText] = useState('');
  const [showRestoreListModal, setShowRestoreListModal] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupEntry[]>([]);
  const [selectedRestoreFileId, setSelectedRestoreFileId] = useState<string | null>(null);

  const handleGoogleConnect = useCallback(async () => {
    try {
      setGoogleBusy(true);
      if (googleState.isSignedIn) {
        await googleSignOut();
        setGoogleState({ isSignedIn: false, email: null });
      } else {
        const result = await googleSignIn();
        setGoogleState(result);
      }
    } catch (e) {
      alert('Google Drive', String(e));
    } finally {
      setGoogleBusy(false);
    }
  }, [googleState.isSignedIn, alert]);

  const handleBackUpNow = useCallback(() => {
    setPassphraseText('');
    setPassphraseMode('backup');
  }, []);

  const handleRestoreFromCloud = useCallback(async () => {
    try {
      setCloudRestoreBusy(true);
      const token = await getAccessToken();
      if (!token) {
        alert('Google Drive', 'You need to connect Google Drive first.');
        return;
      }
      const backups = await listBackups(token);
      setCloudBackups(backups);
      setShowRestoreListModal(true);
    } catch (e) {
      alert('Restore Failed', String(e));
    } finally {
      setCloudRestoreBusy(false);
    }
  }, [alert]);

  const handleSelectCloudBackup = useCallback((fileId: string) => {
    setSelectedRestoreFileId(fileId);
    setShowRestoreListModal(false);
    setPassphraseText('');
    setPassphraseMode('restore');
  }, []);

  const handlePassphraseCancel = useCallback(() => {
    setPassphraseMode(null);
    setPassphraseText('');
    setSelectedRestoreFileId(null);
  }, []);

  const handlePassphraseConfirm = useCallback(async () => {
    const mode = passphraseMode;
    const passphrase = passphraseText;
    const fileId = selectedRestoreFileId;
    setPassphraseMode(null);
    setPassphraseText('');

    if (mode === 'backup') {
      try {
        setCloudBackupBusy(true);
        const token = await getAccessToken();
        if (!token) {
          alert('Google Drive', 'You need to connect Google Drive first.');
          return;
        }
        const snapshot = await createSnapshot();
        const encrypted = encryptSnapshot(snapshot, passphrase);
        await uploadBackup(encrypted, token);
        const now = new Date().toLocaleString();
        setLastBackupTime(now);
        alert('Backup Uploaded', 'Your settings were backed up to Google Drive.');
      } catch (e) {
        alert('Cloud Backup Failed', String(e));
      } finally {
        setCloudBackupBusy(false);
      }
      return;
    }

    if (mode === 'restore' && fileId) {
      try {
        setCloudRestoreBusy(true);
        const token = await getAccessToken();
        if (!token) {
          alert('Google Drive', 'You need to connect Google Drive first.');
          return;
        }
        const encrypted = await downloadBackup(fileId, token);
        const snapshot = decryptSnapshot(encrypted, passphrase);
        validateSnapshot(snapshot);
        await applySnapshot(snapshot);
        alert('Restored', 'Settings restored from Google Drive. Restart the app to apply all changes.');
      } catch (e) {
        alert('Error', `Invalid backup data: ${String(e)}`);
      } finally {
        setCloudRestoreBusy(false);
        setSelectedRestoreFileId(null);
      }
    }
  }, [passphraseMode, passphraseText, selectedRestoreFileId, alert]);

  const doExport = useCallback(async () => {
    try {
      setBusy(true);
      const snapshot = await createSnapshot();
      const json = JSON.stringify(snapshot, null, 2);
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
        {/* Google Drive — OAuth connection (epic #126) */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <Text style={[styles.sectionHeader, { color: colors.secondaryLabel }]}>GOOGLE DRIVE</Text>
          <CupertinoListSection>
            <CupertinoListTile
              title={googleState.isSignedIn ? `Connected: ${googleState.email}` : 'Connect Google Drive'}
              subtitle={
                googleState.isSignedIn
                  ? 'Tap to disconnect'
                  : 'Back up to your private Drive app folder'
              }
              onPress={handleGoogleConnect}
              trailing={
                googleBusy ? <ActivityIndicator size="small" color={colors.systemBlue} /> : undefined
              }
            />
          </CupertinoListSection>
        </View>

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
            <CupertinoListTile
              title="Back Up Now"
              subtitle="Encrypt and upload settings to Google Drive"
              onPress={googleState.isSignedIn ? handleBackUpNow : undefined}
              trailing={
                cloudBackupBusy ? <ActivityIndicator size="small" color={colors.systemBlue} /> : undefined
              }
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
            <CupertinoListTile
              title="Restore from Cloud"
              subtitle="Pick a backup from Google Drive"
              onPress={googleState.isSignedIn ? handleRestoreFromCloud : undefined}
              trailing={
                cloudRestoreBusy ? <ActivityIndicator size="small" color={colors.systemBlue} /> : undefined
              }
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

      {/* Cloud Restore — pick a backup */}
      <Modal
        visible={showRestoreListModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRestoreListModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.systemBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.label }]}>Choose a Backup</Text>
            {cloudBackups.length === 0 ? (
              <Text style={[styles.modalSubtitle, { color: colors.secondaryLabel }]}>
                No backups found in Google Drive.
              </Text>
            ) : (
              cloudBackups.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.separator, marginBottom: 8 }]}
                  onPress={() => handleSelectCloudBackup(entry.id)}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalBtnText, { color: colors.label }]}>
                    {new Date(entry.createdTime).toLocaleString()}
                  </Text>
                </Pressable>
              ))
            )}
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.separator }]}
                onPress={() => setShowRestoreListModal(false)}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text style={[styles.modalBtnText, { color: colors.label }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Passphrase Modal — shared by Back Up Now and Restore from Cloud */}
      <Modal
        visible={passphraseMode !== null}
        transparent
        animationType="slide"
        onRequestClose={handlePassphraseCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.systemBackground }]}>
            <Text style={[styles.modalTitle, { color: colors.label }]}>
              {passphraseMode === 'backup' ? 'Backup Passphrase' : 'Restore Passphrase'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.secondaryLabel }]}>
              {passphraseMode === 'backup'
                ? 'Choose a passphrase to encrypt this backup. You will need it to restore.'
                : 'Enter the passphrase used to encrypt this backup.'}
            </Text>
            <TextInput
              style={[
                styles.textArea,
                {
                  backgroundColor: colors.systemGroupedBackground,
                  color: colors.label,
                  borderColor: colors.separator,
                  minHeight: 46,
                },
              ]}
              value={passphraseText}
              onChangeText={setPassphraseText}
              placeholder="Passphrase"
              placeholderTextColor={colors.tertiaryLabel}
              secureTextEntry
              autoCorrect={false}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: colors.separator }]}
                onPress={handlePassphraseCancel}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text style={[styles.modalBtnText, { color: colors.label }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnConfirm, { backgroundColor: colors.systemBlue }]}
                onPress={handlePassphraseConfirm}
                disabled={!passphraseText}
                accessibilityLabel="Confirm"
                accessibilityRole="button"
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Confirm</Text>
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
