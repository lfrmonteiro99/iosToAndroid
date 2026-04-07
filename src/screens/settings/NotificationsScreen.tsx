// eslint-disable-next-line @typescript-eslint/no-explicit-any
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { useSettings } from '../../store/SettingsStore';
import { useDevice } from '../../store/DeviceStore';
import {
  CupertinoNavigationBar,
  CupertinoListSection,
  CupertinoListTile,
  CupertinoSwitch,
  CupertinoSegmentedControl,
} from '../../components';

const PREVIEW_VALUES = ['always', 'whenUnlocked', 'never'] as const;
const PREVIEW_LABELS = ['Always', 'When Unlocked', 'Never'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function NotificationsScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

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
            footer="Notification preferences are applied system-wide."
          >
            <CupertinoListTile
              title="Scheduled Summary"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Off</Text>
              }
              onPress={() => openSystemPanel('notification')}
            />
          </CupertinoListSection>
        </View>

        {/* Open System Settings */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Open Notification Settings"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('notification')}
            />
          </CupertinoListSection>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
