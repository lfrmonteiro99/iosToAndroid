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
} from '../../components';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DateTimeScreen({ navigation }: { navigation: any }) {
  const { theme, typography, spacing } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  const { openSystemPanel } = useDevice();

  const now = new Date();
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const utcOffset = (() => {
    const offset = -now.getTimezoneOffset();
    const h = Math.floor(Math.abs(offset) / 60);
    const m = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    return `GMT${sign}${h}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''}`;
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.systemGroupedBackground }]}>
      <CupertinoNavigationBar
        title="Date & Time"
        largeTitle={false}
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
        {/* Set Automatically + Time Zone + 24-Hour */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <CupertinoListSection>
            <CupertinoListTile
              title="Set Automatically"
              trailing={
                <CupertinoSwitch
                  value={settings.dateTimeAutomatic}
                  onValueChange={(v) => update('dateTimeAutomatic', v)}
                />
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Time Zone"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {detectedTimezone}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="UTC Offset"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {utcOffset}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="24-Hour Time"
              trailing={
                <CupertinoSwitch
                  value={settings.use24Hour}
                  onValueChange={(v) => update('use24Hour', v)}
                />
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Current date/time display */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Current Date & Time">
            <CupertinoListTile
              title="Date"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {now.toLocaleDateString()}
                </Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Time"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>
                  {now.toLocaleTimeString()}
                </Text>
              }
              showChevron={false}
            />
          </CupertinoListSection>
        </View>

        {/* Calendar format */}
        <View style={{ paddingHorizontal: spacing.md }}>
          <CupertinoListSection header="Calendar"
            footer="Changing the system timezone requires Android Settings."
          >
            <CupertinoListTile
              title="Calendar"
              trailing={
                <Text style={[typography.body, { color: colors.secondaryLabel }]}>Gregorian</Text>
              }
              showChevron={false}
            />
            <CupertinoListTile
              title="Change Timezone"
              leading={{ name: 'open-outline', color: '#FFF', backgroundColor: colors.systemBlue }}
              onPress={() => openSystemPanel('date_time')}
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
