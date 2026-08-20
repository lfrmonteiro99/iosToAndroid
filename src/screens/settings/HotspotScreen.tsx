import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Modal, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoButton,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';
import LauncherModule from '../../../modules/launcher-module/src';

function generatePassword(): string {
  // Generate a readable 12-char password
  const chars = 'abcdefghijkmnopqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

export function HotspotScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState(settings.hotspotPassword || '');
  const [showPassword, setShowPassword] = useState(false);

  const handleHotspotPress = useCallback(() => {
    LauncherModule.openSystemSettings('hotspot');
  }, []);

  const handleSavePassword = () => {
    if (newPassword.length < 8) {
      return; // Wi-Fi password must be at least 8 characters
    }
    update('hotspotPassword', newPassword);
    setShowPasswordModal(false);
  };

  const handleGeneratePassword = () => {
    setNewPassword(generatePassword());
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Personal Hotspot"
        leftButton={
          <Text
            style={[typography.body, { color: colors.systemBlue }]}
            onPress={() => navigation.goBack()}
          >
            Settings
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection footer="Android restricts hotspot control to system apps. Tap to open the Android hotspot panel where you can enable or disable tethering.">
            <CupertinoListTile
              title="Personal Hotspot"
              subtitle="Managed by Android"
              showChevron
              onPress={handleHotspotPress}
            />
          </CupertinoListSection>
        </View>

        {/* Wi-Fi Password — now edited in-app */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Wi-Fi Password"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {settings.hotspotPassword ? '••••••••' : 'Not set'}
                </Text>
              }
              leading={{
                name: 'key-outline',
                color: '#FFFFFF',
                backgroundColor: colors.systemBlue,
              }}
              showChevron
              onPress={() => { setNewPassword(settings.hotspotPassword || ''); setShowPasswordModal(true); }}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer="Maximize Compatibility allows older devices to connect. This may reduce Wi-Fi performance."
          >
            <CupertinoListTile
              title="Maximize Compatibility"
              trailing={
                <CupertinoSwitch
                  value={settings.hotspotMaxCompatibility}
                  onValueChange={(v) => update('hotspotMaxCompatibility', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Tapping Personal Hotspot opens the Android tethering panel. Password and compatibility preferences are saved locally for when you enable tethering there.
        </Text>
      </ScrollView>

      {/* In-app password edit modal (no Android panel) */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.pwOverlay}>
          <View style={[styles.pwDialog, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
            <Text style={[typography.headline, { color: colors.label, textAlign: 'center' }]}>
              Hotspot Password
            </Text>
            <Text style={[typography.caption1, { color: colors.secondaryLabel, textAlign: 'center' }]}>
              Must be at least 8 characters
            </Text>
            <View style={[styles.pwInputWrap, { backgroundColor: colors.systemBackground, borderColor: colors.separator }]}>
              <TextInput
                style={[typography.body, styles.pwInput, { color: colors.label }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Password"
                placeholderTextColor={colors.tertiaryLabel}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.secondaryLabel} />
              </Pressable>
            </View>
            <Pressable onPress={handleGeneratePassword} style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={[typography.footnote, { color: colors.systemBlue }]}>Generate strong password</Text>
            </Pressable>
            <View style={styles.pwActions}>
              <CupertinoButton
                title="Cancel"
                onPress={() => setShowPasswordModal(false)}
                variant="tinted"
                style={{ flex: 1 }}
              />
              <CupertinoButton
                title="Save"
                onPress={handleSavePassword}
                disabled={newPassword.length < 8}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  pwOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pwDialog: {
    width: '85%',
    borderRadius: 14,
    padding: 20,
    gap: 10,
  },
  pwInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  pwInput: {
    flex: 1,
    paddingVertical: 12,
  },
  pwActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
