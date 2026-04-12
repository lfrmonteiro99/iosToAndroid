import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

const getLauncher = async () => {
  try { return (await import('../../../modules/launcher-module/src')).default; }
  catch { return null; }
};

const PERMISSION_CATEGORIES = [
  { key: 'location', title: 'Location Services', icon: 'location', bg: '#007AFF' },
  { key: 'camera', title: 'Camera', icon: 'camera', bg: '#1C1C1E' },
  { key: 'contacts', title: 'Contacts', icon: 'people', bg: '#34C759' },
  { key: 'calendar', title: 'Calendar', icon: 'calendar', bg: '#FF3B30' },
  { key: 'sms', title: 'Messages', icon: 'chatbubble', bg: '#34C759' },
  { key: 'callLog', title: 'Phone', icon: 'call', bg: '#34C759' },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function PrivacyScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

  const [allowTracking, setAllowTracking] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      try {
        const mod = await getLauncher();
        if (!mod) return;
        const perms = await mod.checkPermissions();
        setPermissions(perms);
      } catch { /* ignore */ }
    })();
  }, []);

  const totalPermissions = PERMISSION_CATEGORIES.length;
  const grantedCount = PERMISSION_CATEGORIES.filter(
    (p) => permissions[p.key] === true
  ).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Privacy & Security"
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
        {/* Permission Status Summary */}
        <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.secondarySystemGroupedBackground }]}>
            <Text style={[typography.title3, { color: colors.label, fontWeight: '600', marginBottom: 4 }]}>
              Permission Status
            </Text>
            <Text style={[typography.body, { color: colors.secondaryLabel }]}>
              {grantedCount} of {totalPermissions} permissions granted
            </Text>
            <View style={[styles.summaryBar, { marginTop: 10 }]}>
              <View
                style={{
                  flex: grantedCount,
                  height: 6,
                  backgroundColor: colors.systemGreen,
                  borderRadius: 3,
                }}
              />
              <View
                style={{
                  flex: Math.max(totalPermissions - grantedCount, 0),
                  height: 6,
                  backgroundColor: colors.systemRed,
                  borderRadius: 3,
                  marginLeft: grantedCount > 0 && grantedCount < totalPermissions ? 2 : 0,
                }}
              />
            </View>
          </View>
        </View>

        {/* Location Services */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Location Services"
              leading={{ name: 'location', color: '#FFFFFF', backgroundColor: colors.accent }}
              trailing={
                <CupertinoSwitch
                  value={settings.locationServices}
                  onValueChange={(v) => update('locationServices', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Tracking */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Tracking">
            <CupertinoListTile
              title="Allow Apps to Request to Track"
              trailing={
                <CupertinoSwitch
                  value={allowTracking}
                  onValueChange={setAllowTracking}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* App Privacy with real permission status */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="App Privacy">
            {PERMISSION_CATEGORIES.map((item) => {
              const isGranted = permissions[item.key] === true;
              const hasData = item.key in permissions;
              return (
                <CupertinoListTile
                  key={item.key}
                  title={item.title}
                  leading={{
                    name: item.icon as 'people',
                    color: '#FFFFFF',
                    backgroundColor: item.bg,
                  }}
                  trailing={
                    <View style={styles.trailingRow}>
                      {hasData ? (
                        <>
                          <View
                            style={[
                              styles.permissionDot,
                              {
                                backgroundColor: isGranted
                                  ? colors.systemGreen
                                  : colors.systemRed,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              typography.body,
                              {
                                color: isGranted
                                  ? colors.systemGreen
                                  : colors.systemRed,
                              },
                            ]}
                          >
                            {isGranted ? 'Granted' : 'Not Granted'}
                          </Text>
                        </>
                      ) : (
                        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                          Manage
                        </Text>
                      )}
                    </View>
                  }
                  showChevron
                  onPress={() => openSystemPanel('privacy')}
                />
              );
            })}
          </CupertinoListSection>
        </View>

        {/* Analytics & Improvements */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Analytics & Improvements">
            <CupertinoListTile
              title="Share Analytics"
              trailing={
                <CupertinoSwitch
                  value={settings.analyticsEnabled}
                  onValueChange={(v) => update('analyticsEnabled', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Personalized Ads"
              trailing={
                <CupertinoSwitch
                  value={settings.personalizedAds}
                  onValueChange={(v) => update('personalizedAds', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open Privacy Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('privacy')}
            />
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Privacy settings control which apps can access your data. Tap a permission to manage it in system settings.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  summaryBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trailingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
