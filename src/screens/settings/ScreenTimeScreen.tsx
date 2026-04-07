// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
} from '../../components';

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h 0m`;
  return `${m}m`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ScreenTimeScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();

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
            {/* Daily Average card */}
            <View style={{ paddingHorizontal: spacing.md }}>
              <CupertinoListSection header="Daily Average">
                <View style={styles.dailyAverageCard}>
                  <Text style={[styles.dailyAverageTime, { color: colors.label }]}>
                    2h 34m
                  </Text>
                  <Text style={[typography.caption1, { color: colors.secondaryLabel }]}>
                    Today
                  </Text>
                </View>
              </CupertinoListSection>
            </View>

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
                  onPress={() => Alert.alert('Daily Limit', 'Use Android Digital Wellbeing to configure app timers.')}
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
                      onPress={() => Alert.alert('Downtime Start', 'Configure downtime schedule in Android Digital Wellbeing settings.')}
                    />
                    <CupertinoListTile
                      title="End"
                      trailing={
                        <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                          {settings.downtimeEnd}
                        </Text>
                      }
                      onPress={() => Alert.alert('Downtime End', 'Configure downtime schedule in Android Digital Wellbeing settings.')}
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
                  onPress={() => Alert.alert('App Limits', 'Use Android Digital Wellbeing to set app timers.')}
                />
                <CupertinoListTile
                  title="Content & Privacy Restrictions"
                  onPress={() => Alert.alert('Content & Privacy Restrictions', 'Use Android parental controls to manage content restrictions.')}
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
});
