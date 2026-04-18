// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSegmentedControl,
  CupertinoActionSheet,
} from '../../components';

const PREVIEW_VALUES = ['always', 'whenUnlocked', 'never'] as const;
const PREVIEW_LABELS = ['Always', 'When Unlocked', 'Never'];
const SUMMARY_OPTIONS = ['Off', 'Morning (8:00 AM)', 'Evening (6:00 PM)', 'Both'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NotificationsScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const [summaryIdx, setSummaryIdx] = useState(settings.scheduledSummaryIdx ?? 0);
  const [showSummaryPicker, setShowSummaryPicker] = useState(false);

  const previewIndex = PREVIEW_VALUES.indexOf(settings.notificationPreviews);

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Notifications"
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
          <CupertinoListSection>
            <CupertinoListTile
              title="Allow Notifications"
              trailing={
                <CupertinoSwitch
                  value={settings.notificationsEnabled}
                  onValueChange={(v) => update('notificationsEnabled', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Show Previews">
            <View style={{ padding: spacing.md }}>
              <CupertinoSegmentedControl
                values={PREVIEW_LABELS}
                selectedIndex={previewIndex >= 0 ? previewIndex : 0}
                onChange={(i) => update('notificationPreviews', PREVIEW_VALUES[i])}
              />
            </View>
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Sounds"
              trailing={
                <CupertinoSwitch
                  value={settings.notificationSounds}
                  onValueChange={(v) => update('notificationSounds', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Badges"
              trailing={
                <CupertinoSwitch
                  value={settings.notificationBadges}
                  onValueChange={(v) => update('notificationBadges', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection
            header="Scheduled Summary"
            footer="Deliver notifications in scheduled batches to reduce interruptions."
          >
            <CupertinoListTile
              title="Scheduled Summary"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {SUMMARY_OPTIONS[summaryIdx]}
                </Text>
              }
              onPress={() => setShowSummaryPicker(true)}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>

      <CupertinoActionSheet
        visible={showSummaryPicker}
        onClose={() => setShowSummaryPicker(false)}
        title="Scheduled Summary"
        options={SUMMARY_OPTIONS.map((label, i) => ({
          label,
          onPress: () => { setSummaryIdx(i); update('scheduledSummaryIdx', i); setShowSummaryPicker(false); },
        }))}
        cancelLabel="Cancel"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
