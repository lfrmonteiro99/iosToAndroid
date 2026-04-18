import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  useAlert,
} from '../../components';
import { logger } from '../../utils/logger';
import type { AppNavigationProp } from '../../navigation/types';

import type { DailyScreenTime, ScreenTimeApp, ScreenTimeStat } from '../../../modules/launcher-module/src';

const getLauncher = async () => {
  try { return (await import('../../../modules/launcher-module/src')).default; }
  catch { return null; }
};

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h 0m`;
  return `${m}m`;
}

const APP_BAR_COLORS = [
  '#007AFF', // blue
  '#5856D6', // indigo
  '#AF52DE', // purple
  '#FF9500', // orange
  '#34C759', // green
  '#FF3B30', // red
  '#5AC8FA', // teal
  '#FF2D55', // pink
  '#FFCC00', // yellow
  '#8E8E93', // gray
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ScreenTimeScreen({ navigation }: { navigation: AppNavigationProp }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const alert = useAlert();

  const [loading, setLoading] = useState(true);
  const [usageAccessGranted, setUsageAccessGranted] = useState(false);
  const [todayData, setTodayData] = useState<DailyScreenTime | null>(null);
  const [, setWeeklyStats] = useState<ScreenTimeStat[]>([]);
  const [weeklyAvgMinutes, setWeeklyAvgMinutes] = useState(0);

  const loadScreenTimeData = useCallback(async () => {
    const launcher = await getLauncher();
    if (!launcher) {
      setLoading(false);
      return;
    }

    try {
      const granted = await launcher.isUsageAccessGranted();
      setUsageAccessGranted(granted);

      if (granted) {
        const [today, stats] = await Promise.all([
          launcher.getTodayScreenTime(),
          launcher.getScreenTimeStats(7),
        ]);
        setTodayData(today);
        setWeeklyStats(stats);

        // Calculate weekly average: sum all time, divide by 7 days
        if (stats.length > 0) {
          const totalMs = stats.reduce((sum: number, s: ScreenTimeStat) => sum + s.totalTimeMs, 0);
          const avgMinutes = Math.round(totalMs / 60000 / 7);
          setWeeklyAvgMinutes(avgMinutes);
        }
      }
    } catch (e) {
      logger.warn('ScreenTimeScreen', 'failed to load screen time data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (settings.screenTimeEnabled) {
      loadScreenTimeData();
    } else {
      setLoading(false);
    }
  }, [settings.screenTimeEnabled, loadScreenTimeData]);

  const handleOpenUsageAccess = async () => {
    const launcher = await getLauncher();
    if (launcher) {
      await launcher.openUsageAccessSettings();
    }
  };

  const topApps: ScreenTimeApp[] = todayData?.topApps?.slice(0, 5) ?? [];
  const maxAppMinutes = topApps.length > 0 ? Math.max(...topApps.map(a => a.minutes)) : 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Screen Time"
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
        {/* Screen Time toggle */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            footer="Screen Time provides weekly reports about your device usage."
          >
            <CupertinoListTile
              title="Screen Time"
              trailing={
                <CupertinoSwitch
                  value={settings.screenTimeEnabled}
                  onValueChange={(v) => update('screenTimeEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Conditional detail sections when Screen Time is enabled */}
        {settings.screenTimeEnabled && (
          <>
            {/* Usage Access Permission */}
            {!loading && !usageAccessGranted && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Usage Access Required">
                  <View style={styles.permissionCard}>
                    <Text style={[typography.body, { color: colors.label, textAlign: 'center', marginBottom: 8 }]}>
                      Screen Time needs usage access permission to show your app usage data.
                    </Text>
                    <Pressable
                      onPress={handleOpenUsageAccess}
                      style={({ pressed }) => [
                        styles.permissionButton,
                        { backgroundColor: colors.systemBlue, opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <Text style={[typography.body, { color: '#FFFFFF', fontWeight: '600' }]}>
                        Open Usage Access Settings
                      </Text>
                    </Pressable>
                    <Text style={[typography.caption1, { color: colors.secondaryLabel, textAlign: 'center', marginTop: 8 }]}>
                      Find this app in the list and enable access, then return here.
                    </Text>
                    <Pressable
                      onPress={() => { setLoading(true); loadScreenTimeData(); }}
                      style={{ marginTop: 12 }}
                    >
                      <Text style={[typography.body, { color: colors.systemBlue, textAlign: 'center' }]}>
                        Refresh
                      </Text>
                    </Pressable>
                  </View>
                </CupertinoListSection>
              </View>
            )}

            {/* Loading state */}
            {loading && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Daily Average">
                  <View style={styles.dailyAverageCard}>
                    <ActivityIndicator size="small" color={colors.systemBlue} />
                  </View>
                </CupertinoListSection>
              </View>
            )}

            {/* Daily Average card - real data */}
            {!loading && usageAccessGranted && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Today">
                  <View style={styles.dailyAverageCard}>
                    <Text style={[styles.dailyAverageTime, { color: colors.label }]}>
                      {todayData ? formatMinutes(todayData.totalMinutes) : '0m'}
                    </Text>
                    <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                      Total screen time today
                    </Text>
                  </View>
                </CupertinoListSection>
              </View>
            )}

            {/* Top Apps usage bars */}
            {!loading && usageAccessGranted && topApps.length > 0 && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Most Used">
                  {topApps.map((app, index) => (
                    <View
                      key={app.packageName}
                      style={[
                        styles.appUsageRow,
                        index < topApps.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.separator,
                        },
                      ]}
                    >
                      <View style={styles.appUsageInfo}>
                        <Text
                          style={[typography.body, { color: colors.label, flex: 1 }]}
                          numberOfLines={1}
                        >
                          {app.name}
                        </Text>
                        <Text style={[typography.footnote, { color: colors.secondaryLabel, marginLeft: 8 }]}>
                          {formatMinutes(app.minutes)}
                        </Text>
                      </View>
                      <View style={[styles.barBackground, { backgroundColor: colors.systemGray5 }]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: APP_BAR_COLORS[index % APP_BAR_COLORS.length],
                              width: `${Math.max((app.minutes / maxAppMinutes) * 100, 2)}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))}
                </CupertinoListSection>
              </View>
            )}

            {/* Weekly Average */}
            {!loading && usageAccessGranted && (
              <View style={{ paddingHorizontal: spacing.md }}>
                <CupertinoListSection header="Weekly Average">
                  <View style={styles.dailyAverageCard}>
                    <Text style={[styles.weeklyAverageTime, { color: colors.label }]}>
                      {formatMinutes(weeklyAvgMinutes)}
                    </Text>
                    <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                      Daily average over the past 7 days
                    </Text>
                  </View>
                </CupertinoListSection>
              </View>
            )}

            {/* Daily Limit */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection>
                <CupertinoListTile
                  title="Daily Limit"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {formatMinutes(settings.dailyLimit)}
                    </Text>
                  }
                  onPress={() => alert('Daily Limit', 'Use Android Digital Wellbeing to configure app timers.')}
                />
              </CupertinoListSection>
            </View>

            {/* Downtime section */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="Downtime">
                <CupertinoListTile
                  title="Downtime"
                  trailing={
                    <CupertinoSwitch
                      value={settings.downtime}
                      onValueChange={(v) => update('downtime', v)}
                    />
                  }
                  showChevron={false}
                />
                {settings.downtime && (
                  <>
                    <CupertinoListTile
                      title="Start"
                      trailing={
                        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                          {settings.downtimeStart}
                        </Text>
                      }
                      onPress={() => alert('Downtime Start', 'Configure downtime schedule in Android Digital Wellbeing settings.')}
                    />
                    <CupertinoListTile
                      title="End"
                      trailing={
                        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                          {settings.downtimeEnd}
                        </Text>
                      }
                      onPress={() => alert('Downtime End', 'Configure downtime schedule in Android Digital Wellbeing settings.')}
                    />
                  </>
                )}
              </CupertinoListSection>
            </View>

            {/* App Limits & Content Restrictions */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection>
                <CupertinoListTile
                  title="App Limits"
                  trailing={
                    <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                      {settings.dailyLimit > 0 ? 'On' : 'Off'}
                    </Text>
                  }
                  onPress={() => alert('App Limits', 'Use Android Digital Wellbeing to set app timers.')}
                />
                <CupertinoListTile
                  title="Content & Privacy Restrictions"
                  onPress={() => alert('Content & Privacy Restrictions', 'Use Android parental controls to manage content restrictions.')}
                />
              </CupertinoListSection>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dailyAverageCard: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  dailyAverageTime: {
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: -1,
    lineHeight: 56,
  },
  weeklyAverageTime: {
    fontSize: 36,
    fontWeight: '300',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  permissionCard: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  appUsageRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  appUsageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  barBackground: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: 3,
  },
});
