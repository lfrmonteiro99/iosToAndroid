import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import LauncherModule from '../../../modules/launcher-module/src';
import type { ScreenTimeStat } from '../../../modules/launcher-module/src';
import { withAutoLockSuppressed } from '../../utils/permissions';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  useAlert,
} from '../../components';
import type { AppNavigationProp } from '../../navigation/types';

const PERMISSION_CATEGORIES = [
  { key: 'location', title: 'Location Services', icon: 'location', bg: '#007AFF' },
  { key: 'camera', title: 'Camera', icon: 'camera', bg: '#1C1C1E' },
  { key: 'contacts', title: 'Contacts', icon: 'people', bg: '#34C759' },
  { key: 'calendar', title: 'Calendar', icon: 'calendar', bg: '#FF3B30' },
  { key: 'sms', title: 'Messages', icon: 'chatbubble', bg: '#34C759' },
  { key: 'callLog', title: 'Phone', icon: 'call', bg: '#34C759' },
] as const;

/**
 * Formats total foreground time (ms) as reported by getScreenTimeStats
 * (UsageStatsManager) into a short "usage time" label. Never say "access" —
 * this is aggregate time-on-screen, not a sensor/permission access event.
 */
function formatUsageTime(totalTimeMs: number): string {
  const minutes = Math.round(totalTimeMs / 60000);
  if (minutes < 1) return '< 1 min';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${minutes} min`;
}

export function PrivacyScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

  const alert = useAlert();

  // Android 12 (API 31) exposes Settings.ACTION_PRIVACY_DASHBOARD — the real
  // system Privacy Dashboard, powered by the OS's own app-ops data (no invented
  // counts). Below that, or on iOS, there is no native panel, so we explain the
  // requirement instead of opening a dead or wrong screen.
  const isPrivacyDashboardAvailable =
    Platform.OS === 'android' && parseInt(String(Platform.Version), 10) >= 31;

  const handleOpenPrivacyReport = useCallback(() => {
    if (isPrivacyDashboardAvailable) {
      LauncherModule.openSystemSettings('privacy_dashboard');
    } else {
      alert(
        'App Privacy Report Unavailable',
        'The system Privacy Dashboard is available on Android 12 or later. ' +
          'Your device does not provide it, so there is no native report to open.'
      );
    }
  }, [isPrivacyDashboardAvailable, alert]);

  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [requestingPermissions, setRequestingPermissions] = useState(false);

  const checkPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setLoadingPermissions(true);
    try {
      const perms = await LauncherModule.checkPermissions();
      setPermissions(perms);
    } catch { /* ignore */ } finally {
      setLoadingPermissions(false);
    }
  }, []);

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  const [screenTimeStats, setScreenTimeStats] = useState<ScreenTimeStat[]>([]);
  const [loadingScreenTime, setLoadingScreenTime] = useState(false);

  const loadScreenTime = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    setLoadingScreenTime(true);
    try {
      const stats = await LauncherModule.getScreenTimeStats(1);
      setScreenTimeStats(stats);
    } catch { /* ignore */ } finally {
      setLoadingScreenTime(false);
    }
  }, []);

  useEffect(() => {
    loadScreenTime();
  }, [loadScreenTime]);

  const topScreenTimeApps = [...screenTimeStats]
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 5);

  const handleRequestPermissions = useCallback(async () => {
    setRequestingPermissions(true);
    try {
      // Requests every category one after another — each native dialog
      // backgrounds the app, so the whole batch must be suppressed or a
      // slow reader gets auto-locked mid-flow.
      await withAutoLockSuppressed(() => LauncherModule.requestAllPermissions());
      // Re-check after requesting
      await checkPermissions();
      alert('Permissions Updated', 'Permission status has been refreshed.');
    } catch {
      alert('Error', 'Could not request permissions. Please try again.');
    } finally {
      setRequestingPermissions(false);
    }
  }, [checkPermissions, alert]);

  const totalPermissions = PERMISSION_CATEGORIES.length;
  const grantedCount = PERMISSION_CATEGORIES.filter(
    (p) => p.key === 'location'
      ? settings.locationServices && permissions[p.key] === true
      : permissions[p.key] === true
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

        {/* App Privacy with real permission status */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <View style={[styles.sectionHeaderRow, { paddingHorizontal: 16, paddingBottom: 6, paddingTop: 22 }]}>
            <Text style={[typography.footnote, { color: colors.secondaryLabel, textTransform: 'uppercase' }]}>
              App Privacy
            </Text>
            <Pressable onPress={checkPermissions} disabled={loadingPermissions} hitSlop={8} accessibilityLabel="Refresh permissions" accessibilityRole="button">
              {loadingPermissions ? (
                <ActivityIndicator size="small" color={colors.systemBlue} />
              ) : (
                <Text style={[typography.footnote, { color: colors.systemBlue }]}>Refresh</Text>
              )}
            </Pressable>
          </View>
          <CupertinoListSection>
            {PERMISSION_CATEGORIES.map((item) => {
              // Location row is gated by the Location Services toggle above
              const locationDisabled = item.key === 'location' && !settings.locationServices;
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
                      {locationDisabled ? (
                        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                          Disabled by user
                        </Text>
                      ) : hasData ? (
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
                            {isGranted ? 'Granted' : 'Denied'}
                          </Text>
                          {!isGranted && (
                            <Pressable
                              onPress={handleRequestPermissions}
                              disabled={requestingPermissions}
                              style={[styles.requestBtn, { backgroundColor: colors.systemBlue }]}
                              accessibilityLabel="Request permission"
                              accessibilityRole="button"
                            >
                              {requestingPermissions ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Text style={[typography.caption2, { color: '#fff', fontWeight: '600' }]}>
                                  Request
                                </Text>
                              )}
                            </Pressable>
                          )}
                        </>
                      ) : (
                        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                          Checking…
                        </Text>
                      )}
                    </View>
                  }
                  showChevron={false}
                />
              );
            })}
          </CupertinoListSection>
        </View>

        {/* Screen Time — real usage time from getScreenTimeStats (UsageStatsManager).
            This is time-on-screen, not sensor access, so the section never appears
            on iOS (there is no equivalent native data source here) and the label
            always says "usage time" / "Screen Time", never "access". */}
        {Platform.OS === 'android' && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <View style={[styles.sectionHeaderRow, { paddingHorizontal: 16, paddingBottom: 6, paddingTop: 22 }]}>
              <Text style={[typography.footnote, { color: colors.secondaryLabel, textTransform: 'uppercase' }]}>
                Screen Time
              </Text>
            </View>
            <CupertinoListSection footer="Usage time today, per app.">
              {loadingScreenTime ? (
                <View style={styles.screenTimeLoading}>
                  <ActivityIndicator size="small" color={colors.systemBlue} />
                </View>
              ) : topScreenTimeApps.length === 0 ? (
                <CupertinoListTile title="No usage data yet" showChevron={false} />
              ) : (
                topScreenTimeApps.map((app) => (
                  <CupertinoListTile
                    key={app.packageName}
                    title={app.appName}
                    trailing={
                      <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                        {formatUsageTime(app.totalTimeMs)}
                      </Text>
                    }
                    showChevron={false}
                  />
                ))
              )}
            </CupertinoListSection>
          </View>
        )}

        {/* App Privacy Report — opens the real system Privacy Dashboard (API 31+).
            We never build our own counts; below Android 12 the tap explains the
            requirement instead of opening a dead screen. */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer={
              isPrivacyDashboardAvailable
                ? 'Opens the system Privacy Dashboard showing real app access to your camera, microphone and location.'
                : 'Requires Android 12 or later. Your device does not expose the system Privacy Dashboard.'
            }
          >
            <CupertinoListTile
              title="App Privacy Report"
              leading={{
                name: 'shield-checkmark',
                color: '#FFFFFF',
                backgroundColor: colors.systemBlue,
              }}
              showChevron
              onPress={handleOpenPrivacyReport}
            />
          </CupertinoListSection>
        </View>

        {/* Footer */}
        <Text style={[typography.footnote, styles.footer, { color: colors.secondaryLabel }]}>
          Tap &quot;Request&quot; to prompt the system for any denied permissions. Use &quot;Refresh&quot; to re-check current status.
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
  requestBtn: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTimeLoading: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    marginHorizontal: 32,
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
});
